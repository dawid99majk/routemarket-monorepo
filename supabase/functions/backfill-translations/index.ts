import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { source_language = "pl", limit = 100, dry_run = false } = await req.json().catch(() => ({}));

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceKey);

    // Verify caller is admin
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const token = authHeader.replace("Bearer ", "");
    const { data: { user } } = await supabase.auth.getUser(token);
    if (!user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const { data: roles } = await supabase
      .from("user_roles").select("role").eq("user_id", user.id);
    const isAdmin = (roles ?? []).some((r: any) => r.role === "admin");
    if (!isAdmin) {
      return new Response(JSON.stringify({ error: "Admin only" }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Find all published routes
    const { data: routes, error: rErr } = await supabase
      .from("routes")
      .select("id, title")
      .eq("status", "published")
      .limit(limit);
    if (rErr) throw rErr;

    if (dry_run) {
      return new Response(JSON.stringify({
        mode: "dry_run",
        routes_found: routes?.length ?? 0,
        route_ids: (routes ?? []).map((r: any) => r.id),
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Fire auto-translate-route for each route in background
    const results: any[] = [];
    for (const route of routes ?? []) {
      try {
        const resp = await fetch(`${supabaseUrl}/functions/v1/auto-translate-route`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${serviceKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ route_id: route.id, source_language }),
        });
        const json = await resp.json();
        results.push({ route_id: route.id, ok: resp.ok, results: json.results });
      } catch (e) {
        results.push({ route_id: route.id, ok: false, error: e instanceof Error ? e.message : "unknown" });
      }
    }

    return new Response(JSON.stringify({
      processed: results.length,
      results,
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    console.error("backfill-translations error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "unknown" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});