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

  const supabaseClient = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_ANON_KEY") ?? ""
  );

  try {
    const authHeader = req.headers.get("Authorization")!;
    const token = authHeader.replace("Bearer ", "");
    const { data } = await supabaseClient.auth.getUser(token);
    const user = data.user;
    if (!user?.email) throw new Error("User not authenticated");

    const body = await req.json();
    const { route_id, origin: clientOrigin } = body;
    if (!route_id) throw new Error("route_id is required");

    const siteUrl = clientOrigin || req.headers.get("origin") || Deno.env.get("SITE_URL") || "https://routemarket.io";

    // Fetch route details
    const { data: route, error: routeErr } = await supabaseClient
      .from("routes")
      .select("id, title, price, user_id")
      .eq("id", route_id)
      .eq("status", "published")
      .single();

    if (routeErr || !route) throw new Error("Route not found");
    if (route.user_id === user.id) throw new Error("Cannot buy your own route");

    // Check if already purchased
    const { data: existing } = await supabaseClient
      .from("purchases")
      .select("id")
      .eq("user_id", user.id)
      .eq("route_id", route_id)
      .maybeSingle();

    if (existing) throw new Error("Already purchased");

    const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY") || "", {
      apiVersion: "2025-08-27.basil",
    });

    // Find or skip customer
    const customers = await stripe.customers.list({ email: user.email, limit: 1 });
    const customerId = customers.data.length > 0 ? customers.data[0].id : undefined;

    const priceInCents = Math.round(route.price * 100);

    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      customer_email: customerId ? undefined : user.email,
      line_items: [
        {
          price_data: {
            currency: "pln",
            product_data: { name: route.title },
            unit_amount: priceInCents,
          },
          quantity: 1,
        },
      ],
      mode: "payment",
      metadata: {
        user_id: user.id,
        route_id: String(route.id),
        amount: String(route.price),
      },
      success_url: `${siteUrl}/payment-success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${siteUrl}/route/${route.id}`,
    });

    return new Response(JSON.stringify({ url: session.url }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return new Response(JSON.stringify({ error: message }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 400,
    });
  }
});
