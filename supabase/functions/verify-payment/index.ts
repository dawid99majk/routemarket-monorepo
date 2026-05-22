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

    const supabaseClient = createClient(supabaseUrl, anonKey);
    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey);
    const stripe = new Stripe(stripeKey, {
      apiVersion: "2025-08-27.basil",
      httpClient: Stripe.createFetchHttpClient(),
    });

    const token = authHeader.replace("Bearer ", "");
    const { data: authData, error: authError } = await supabaseClient.auth.getUser(token);
    const user = authData.user;

    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json().catch(() => ({}));
    const sessionId = typeof body.session_id === "string" ? body.session_id : undefined;
    const providedRouteId = Number(body.route_id);

    let routeId = Number.isFinite(providedRouteId) ? providedRouteId : undefined;
    let purchaseAmount: number | undefined;
    let stripePaymentIntentId: string | null = null;

    if (sessionId) {
      const session = await stripe.checkout.sessions.retrieve(sessionId);

      if (session.metadata?.user_id !== user.id) {
        return new Response(JSON.stringify({ error: "Brak dostępu do tej płatności" }), {
          status: 403,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      if (session.payment_status !== "paid") {
        return new Response(JSON.stringify({ error: "Płatność nie została jeszcze potwierdzona" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const metadataRouteId = Number(session.metadata?.route_id);
      routeId = Number.isFinite(metadataRouteId) ? metadataRouteId : routeId;
      purchaseAmount = Number(session.metadata?.amount ?? ((session.amount_total ?? 0) / 100));
      stripePaymentIntentId = typeof session.payment_intent === "string"
        ? session.payment_intent
        : session.payment_intent?.id ?? null;
    }

    if (!routeId) {
      return new Response(JSON.stringify({ error: "Brak identyfikatora trasy" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const [{ data: roles }, { data: route, error: routeError }] = await Promise.all([
      supabaseAdmin.from("user_roles").select("role").eq("user_id", user.id),
      supabaseAdmin
        .from("routes")
        .select("id, title, location_string, gpx_file_key, pdf_file_key, user_id, price")
        .eq("id", routeId)
        .single(),
    ]);

    if (routeError || !route) {
      return new Response(JSON.stringify({ error: "Trasa nie została znaleziona" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const isAdmin = (roles ?? []).some((roleRow) => roleRow.role === "admin");
    const isOwner = route.user_id === user.id;

    const { data: existingPurchase } = await supabaseAdmin
      .from("purchases")
      .select("id, amount_paid, purchased_at")
      .eq("user_id", user.id)
      .eq("route_id", routeId)
      .maybeSingle();

    let purchase = existingPurchase;

    if (!purchase && sessionId) {
      const amountPaid = Number.isFinite(purchaseAmount) ? purchaseAmount! : Number(route.price ?? 0);

      const { data: insertedPurchase, error: insertError } = await supabaseAdmin
        .from("purchases")
        .insert({
          user_id: user.id,
          route_id: routeId,
          amount_paid: amountPaid,
          stripe_payment_intent_id: stripePaymentIntentId,
        })
        .select("id, amount_paid, purchased_at")
        .single();

      if (insertError) {
        throw new Error(`Nie udało się zapisać zakupu: ${insertError.message}`);
      }

      purchase = insertedPurchase;

      const creatorShare = amountPaid * 0.65;
      const { data: creatorProfile } = await supabaseAdmin
        .from("creator_profiles")
        .select("id, total_earnings, total_sales")
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

    if (!purchase && !isOwner && !isAdmin) {
      return new Response(JSON.stringify({ error: "Nie masz dostępu do plików tej trasy" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: routePdfs } = await supabaseAdmin
      .from("route_pdfs")
      .select("language_code, file_key")
      .eq("route_id", routeId)
      .order("language_code");

    const pdfRecords = [...(routePdfs ?? [])];
    if (pdfRecords.length === 0 && route.pdf_file_key) {
      pdfRecords.push({ language_code: "default", file_key: route.pdf_file_key });
    }

    const gpxDownload = route.gpx_file_key
      ? await supabaseAdmin.storage.from("gpx-files").createSignedUrl(route.gpx_file_key, 3600)
      : null;

    const pdfDownloads = await Promise.all(
      pdfRecords.map(async (pdf) => {
        const { data } = await supabaseAdmin.storage.from("pdf-guides").createSignedUrl(pdf.file_key, 3600);
        return {
          language_code: pdf.language_code === "default" ? null : pdf.language_code,
          url: data?.signedUrl ?? "",
          file_key: pdf.file_key,
        };
      }),
    );

    return new Response(JSON.stringify({
      route: {
        id: route.id,
        title: route.title,
        location_string: route.location_string,
      },
      purchase: {
        amount_paid: Number(purchase?.amount_paid ?? route.price ?? 0),
        purchased_at: purchase?.purchased_at ?? new Date().toISOString(),
      },
      gpx_download: gpxDownload?.data?.signedUrl
        ? {
            language_code: null,
            url: gpxDownload.data.signedUrl,
            file_key: route.gpx_file_key,
          }
        : null,
      pdf_downloads: pdfDownloads.filter((pdf) => pdf.url),
    }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("verify-payment error:", message);
    return new Response(JSON.stringify({ error: message }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
