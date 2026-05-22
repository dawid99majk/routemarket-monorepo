import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { youtube_url } = await req.json();

    // Mock Fallback Mode as requested
    console.log(`Analyzing YouTube URL: ${youtube_url}`);
    
    // Simulate AI thinking time
    await new Promise((resolve) => setTimeout(resolve, 2000));

    // Return mock data for Bieszczady route
    const mockData = {
      title: "Wielka Pętla Bieszczadzka - Kultowa Trasa",
      description: "Kompleksowa trasa motocyklowo-rowerowa obejmująca najpiękniejsze zakręty Bieszczad. Start i meta w Lesku, przejazd przez Cisną, Wetlinę i Ustrzyki Górne. Trasa charakteryzuje się doskonałą nawierzchnią i niesamowitymi widokami na połoniny.",
      category: "Motorcycling",
      region: "Bieszczady, Polska",
      cyclingSurface: "Asfalt",
      gpx_points: [
        { lat: 49.467, lng: 22.330, ele: 350 }, // Lesko
        { lat: 49.333, lng: 22.183, ele: 450 }, // Baligród
        { lat: 49.212, lng: 22.327, ele: 550 }, // Cisna
        { lat: 49.155, lng: 22.455, ele: 650 }, // Wetlina
        { lat: 49.102, lng: 22.651, ele: 750 }, // Ustrzyki Górne
        { lat: 49.301, lng: 22.705, ele: 600 }, // Lutowiska
        { lat: 49.432, lng: 22.588, ele: 480 }, // Ustrzyki Dolne
        { lat: 49.467, lng: 22.330, ele: 350 }  // Lesko (loop)
      ],
      pois: [
        { name: "Zamek w Lesku", category: "viewpoint", lat: 49.468, lng: 22.332, description: "Brama do Bieszczad, historyczny zamek." },
        { name: "Przełęcz Wyżna", category: "viewpoint", lat: 49.150, lng: 22.520, description: "Najlepszy punkt widokowy na Połoninę Wetlińską." },
        { name: "Kultowa Siekierezada", category: "dining", lat: 49.213, lng: 22.328, description: "Legendarny bar w Cisnej." },
        { name: "Chatka Puchatka", category: "shelter", lat: 49.162, lng: 22.535, description: "Schronisko na szczycie Połoniny." },
        { name: "Wodospad w Wetlinie", category: "viewpoint", lat: 49.158, lng: 22.458, description: "Piękny wodospad Stare Sioło." }
      ]
    };

    return new Response(JSON.stringify(mockData), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 400,
    });
  }
});
