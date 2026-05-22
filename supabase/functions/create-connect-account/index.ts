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

  const supabaseAdmin = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
  );

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) throw new Error("User not authenticated");

    const token = authHeader.replace("Bearer ", "");
    const { data } = await supabaseClient.auth.getUser(token);
    const user = data.user;
    if (!user?.email) throw new Error("User not authenticated");

    const body = await req.json().catch(() => ({}));
    const { origin: clientOrigin, action } = body;
    const siteUrl = clientOrigin || req.headers.get("origin") || Deno.env.get("SITE_URL") || "https://routemarket.io";

    const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY") || "", {
      apiVersion: "2025-08-27.basil",
    });

    const [{ data: roleRows }, { data: profileRow }] = await Promise.all([
      supabaseAdmin.from("user_roles").select("role").eq("user_id", user.id),
      supabaseAdmin.from("profiles").select("display_name").eq("user_id", user.id).maybeSingle(),
    ]);

    const roles = (roleRows ?? []).map((row) => row.role);
    const canSell = roles.includes("creator") || roles.includes("admin");
    if (!canSell) throw new Error("To konto nie ma uprawnień do sprzedaży tras");

    let { data: creatorProfile } = await supabaseAdmin
      .from("creator_profiles")
      .select("*")
      .eq("user_id", user.id)
      .maybeSingle();

    if (!creatorProfile) {
      const { data: insertedProfile, error: insertError } = await supabaseAdmin
        .from("creator_profiles")
        .insert({
          user_id: user.id,
          display_name: profileRow?.display_name?.trim() || user.email.split('@')[0] || 'Creator',
          bio: '',
        })
        .select('*')
        .single();

      if (insertError) throw new Error(`Nie udało się utworzyć profilu sprzedawcy: ${insertError.message}`);
      creatorProfile = insertedProfile;
    }

    let accountId = creatorProfile.stripe_connect_account_id;

    if (action === "check-status") {
      if (!accountId) {
        return new Response(JSON.stringify({ connected: false }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const account = await stripe.accounts.retrieve(accountId);
      const isComplete = account.charges_enabled && account.payouts_enabled;

      if (isComplete && !creatorProfile.stripe_onboarding_complete) {
        await supabaseAdmin
          .from("creator_profiles")
          .update({ stripe_onboarding_complete: true })
          .eq("user_id", user.id);
      }

      return new Response(JSON.stringify({
        connected: true,
        charges_enabled: account.charges_enabled,
        payouts_enabled: account.payouts_enabled,
        onboarding_complete: isComplete,
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!accountId) {
      const account = await stripe.accounts.create({
        type: "express",
        email: user.email,
        capabilities: {
          card_payments: { requested: true },
          transfers: { requested: true },
        },
        metadata: { user_id: user.id },
      });
      accountId = account.id;

      await supabaseAdmin
        .from("creator_profiles")
        .update({ stripe_connect_account_id: accountId })
        .eq("user_id", user.id);
    }

    const accountLink = await stripe.accountLinks.create({
      account: accountId,
      refresh_url: `${siteUrl}/profile?stripe_refresh=true`,
      return_url: `${siteUrl}/profile?stripe_return=true`,
      type: "account_onboarding",
    });

    return new Response(JSON.stringify({ url: accountLink.url }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("create-connect-account error:", message);
    return new Response(JSON.stringify({ error: message }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 400,
    });
  }
});
