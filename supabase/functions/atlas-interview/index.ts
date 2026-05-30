const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  
  return new Response(
    JSON.stringify({ 
      error: "This edge function is DEPRECATED. Please use the Atlas Engine API directly.",
      migration: "Move to apps/atlas-engine/apps/api"
    }), 
    { 
      status: 410, 
      headers: { ...corsHeaders, "Content-Type": "application/json" } 
    }
  );
});
