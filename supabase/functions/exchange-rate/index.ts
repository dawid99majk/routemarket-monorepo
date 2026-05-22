import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// Cache rates for 1 hour
let cachedRates: Record<string, number> | null = null;
let cacheTime = 0;
const CACHE_TTL = 60 * 60 * 1000;

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { from, to, amount } = await req.json();
    if (!from || !to || amount == null) {
      return new Response(JSON.stringify({ error: "from, to, amount required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const now = Date.now();
    if (!cachedRates || now - cacheTime > CACHE_TTL) {
      // Use free API for exchange rates (no key needed)
      const resp = await fetch("https://api.exchangerate-api.com/v4/latest/USD");
      if (!resp.ok) throw new Error("Failed to fetch exchange rates");
      const data = await resp.json();
      cachedRates = data.rates;
      cacheTime = now;
    }

    const fromRate = cachedRates![from.toUpperCase()] || 1;
    const toRate = cachedRates![to.toUpperCase()] || 1;
    const converted = (amount / fromRate) * toRate;

    return new Response(JSON.stringify({
      from,
      to,
      amount,
      converted: Math.round(converted * 100) / 100,
      rate: toRate / fromRate,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("exchange-rate error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
