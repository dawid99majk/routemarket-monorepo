import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@18.5.0";
import { createClient } from "npm:@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!stripeKey || !supabaseUrl || !anonKey || !serviceRoleKey) {
      throw new Error("Missing required environment variables");
    }

    const stripe = new Stripe(stripeKey, {
      apiVersion: "2025-08-27.basil",
      httpClient: Stripe.createFetchHttpClient(),
    });

    const supabaseClient = createClient(supabaseUrl, anonKey);
    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey);

    const token = authHeader.replace("Bearer ", "");
    const { data: authData, error: authError } = await supabaseClient.auth.getUser(token);
    const user = authData.user;

    if (authError || !user?.email) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const sessions = await stripe.checkout.sessions.list({ limit: 100 });
    const userEmail = user.email.toLowerCase();
    const relevantSessions = sessions.data.filter((session) => {
      if (session.mode !== "payment" || session.payment_status !== "paid") return false;
      if (!session.metadata?.route_id) return false;

      const metadataUserMatches = session.metadata?.user_id === user.id;
      const emailMatches = session.customer_details?.email?.toLowerCase() === userEmail;
      return metadataUserMatches || emailMatches;
    });

    let syncedCount = 0;

    for (const session of relevantSessions) {
      const routeId = Number(session.metadata?.route_id);
      if (!Number.isFinite(routeId)) continue;

      const { data: existingPurchase } = await supabaseAdmin
        .from("purchases")
        .select("id")
        .eq("user_id", user.id)
        .eq("route_id", routeId)
        .maybeSingle();

      if (existingPurchase) continue;

      const { data: route } = await supabaseAdmin
        .from("routes")
        .select("user_id, price")
        .eq("id", routeId)
        .maybeSingle();

      if (!route) continue;

      const amountPaid = Number(session.metadata?.amount ?? ((session.amount_total ?? 0) / 100) ?? route.price ?? 0);
      const stripePaymentIntentId = typeof session.payment_intent === "string"
        ? session.payment_intent
        : session.payment_intent?.id ?? null;

      const { error: purchaseError } = await supabaseAdmin
        .from("purchases")
        .insert({
          user_id: user.id,
          route_id: routeId,
          amount_paid: amountPaid,
          stripe_payment_intent_id: stripePaymentIntentId,
        });

      if (purchaseError) {
        console.error("sync-purchases insert failed:", purchaseError.message);
        continue;
      }

      syncedCount += 1;

      const creatorShare = amountPaid * 0.65;
      const { data: creatorProfile } = await supabaseAdmin
        .from("creator_profiles")
        .select("total_earnings, total_sales")
        .eq("user_id", route.user_id)
        .maybeSingle();

      if (creatorProfile) {
        await supabaseAdmin
          .from("creator_profiles")
          .update({
            total_earnings: Number(creatorProfile.total_earnings ?? 0) + creatorShare,
            total_sales: Number(creatorProfile.total_sales ?? 0) + 1,
          })
          .eq("user_id", route.user_id);
      } else {
        const { data: sellerProfile } = await supabaseAdmin
          .from("profiles")
          .select("display_name")
          .eq("user_id", route.user_id)
          .maybeSingle();

        await supabaseAdmin
          .from("creator_profiles")
          .insert({
            user_id: route.user_id,
            display_name: sellerProfile?.display_name?.trim() || "Creator",
            bio: "",
            total_earnings: creatorShare,
            total_sales: 1,
          });
      }
    }

    return new Response(JSON.stringify({ syncedCount }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("sync-purchases error:", message);
    return new Response(JSON.stringify({ error: message }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
