import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@18.5.0";
import { createClient } from "npm:@supabase/supabase-js@2.57.2";

serve(async (req) => {
  const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
  const webhookSecret = Deno.env.get("STRIPE_WEBHOOK_SECRET");
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

  if (!stripeKey || !webhookSecret || !supabaseUrl || !serviceRoleKey) {
    console.error("Missing env vars", { stripeKey: !!stripeKey, webhookSecret: !!webhookSecret, supabaseUrl: !!supabaseUrl, serviceRoleKey: !!serviceRoleKey });
    return new Response("Missing env vars", { status: 500 });
  }

  const stripe = new Stripe(stripeKey, {
    apiVersion: "2025-08-27.basil",
    httpClient: Stripe.createFetchHttpClient(),
  });
  const supabase = createClient(supabaseUrl, serviceRoleKey);

  const signature = req.headers.get("stripe-signature");
  if (!signature) {
    console.error("No stripe-signature header");
    return new Response("No signature", { status: 400 });
  }

  const body = await req.text();

  let event: Stripe.Event;
  try {
    event = await stripe.webhooks.constructEventAsync(
      body,
      signature,
      webhookSecret,
      undefined,
      Stripe.createSubtleCryptoProvider()
    );
  } catch (err) {
    console.error("Webhook signature verification failed:", err);
    return new Response("Invalid signature", { status: 400 });
  }

  console.log(`Received event: ${event.type}, id: ${event.id}`);

  if (event.type === "checkout.session.completed") {
    const session = event.data.object as Stripe.Checkout.Session;
    const userId = session.metadata?.user_id;
    const routeId = session.metadata?.route_id;
    const amount = session.metadata?.amount;

    console.log("Processing checkout.session.completed", { userId, routeId, amount });

    if (!userId || !routeId) {
      console.error("Missing metadata", session.metadata);
      return new Response("Missing metadata", { status: 400 });
    }

    // Check for duplicate purchase
    const { data: existingPurchase } = await supabase
      .from("purchases")
      .select("id")
      .eq("user_id", userId)
      .eq("route_id", parseInt(routeId))
      .maybeSingle();

    if (existingPurchase) {
      console.log("Purchase already exists, skipping", { purchaseId: existingPurchase.id });
      return new Response(JSON.stringify({ received: true, duplicate: true }), { status: 200 });
    }

    // Insert purchase
    const { error: purchaseErr } = await supabase.from("purchases").insert({
      user_id: userId,
      route_id: parseInt(routeId),
      amount_paid: parseFloat(amount || "0"),
      stripe_payment_intent_id: session.payment_intent as string,
    });

    if (purchaseErr) {
      console.error("Failed to insert purchase:", purchaseErr);
      return new Response("DB error", { status: 500 });
    }

    console.log("Purchase inserted successfully");

    // Update creator stats
    const { data: route } = await supabase
      .from("routes")
      .select("user_id, price")
      .eq("id", parseInt(routeId))
      .single();

    if (route) {
      const creatorEarning = parseFloat(amount || "0") * 0.65;
      console.log("Updating creator stats", { creatorUserId: route.user_id, earning: creatorEarning });

      const { data: creatorProfile } = await supabase
        .from("creator_profiles")
        .select("total_earnings, total_sales, stripe_connect_account_id")
        .eq("user_id", route.user_id)
        .single();

      if (creatorProfile) {
        await supabase
          .from("creator_profiles")
          .update({
            total_earnings: (creatorProfile.total_earnings || 0) + creatorEarning,
            total_sales: (creatorProfile.total_sales || 0) + 1,
          })
          .eq("user_id", route.user_id);

        console.log("Creator stats updated", {
          newEarnings: (creatorProfile.total_earnings || 0) + creatorEarning,
          newSales: (creatorProfile.total_sales || 0) + 1,
        });

        // If creator has Stripe Connect, create a transfer
        if (creatorProfile.stripe_connect_account_id && session.payment_intent) {
          try {
            const transferAmount = Math.round(creatorEarning * 100); // in cents
            await stripe.transfers.create({
              amount: transferAmount,
              currency: "pln",
              destination: creatorProfile.stripe_connect_account_id,
              transfer_group: `route_${routeId}`,
              source_transaction: session.payment_intent as string,
            });
            console.log("Transfer created to creator", { amount: transferAmount, destination: creatorProfile.stripe_connect_account_id });
          } catch (transferErr) {
            console.error("Failed to create transfer (non-fatal):", transferErr);
            // Don't fail the webhook - purchase is still recorded
          }
        }
      } else {
        console.warn("Creator profile not found for user_id:", route.user_id);
      }
    }
  }

  return new Response(JSON.stringify({ received: true }), { status: 200 });
});
