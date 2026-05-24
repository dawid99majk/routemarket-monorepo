import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
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
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) throw new Error("User not authenticated");
    const token = authHeader.replace("Bearer ", "");
    const { data: userData } = await supabaseClient.auth.getUser(token);
    const user = userData.user;
    if (!user) throw new Error("User not authenticated");

    const body = await req.json();
    const { youtube_url } = body;
    if (!youtube_url) throw new Error("YouTube URL is required");

    // Extract video ID from YouTube URL
    const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|\&v=)([^#\&\?]*).*/;
    const match = youtube_url.match(regExp);
    const videoId = (match && match[2].length === 11) ? match[2] : null;

    if (!videoId) {
      throw new Error("Nieprawidłowy adres URL filmu YouTube.");
    }

    console.log(`Processing YouTube video ID: ${videoId}`);

    const geminiKey = Deno.env.get("GEMINI_API_KEY");
    if (!geminiKey) {
      return new Response(JSON.stringify({
        error: "GEMINI_API_KEY is not configured. YouTube import cannot run in production without Gemini."
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 503,
      });
    }

    // 1. Attempt to fetch subtitles or video description/metadata from YouTube
    let textToAnalyze = "";
    try {
      const response = await fetch(`https://www.youtube.com/watch?v=${videoId}`);
      const html = await response.text();

      // Parse video title and description
      const titleMatch = html.match(/<title>(.*?)<\/title>/);
      const descMatch = html.match(/"shortDescription":"(.*?)"/);

      const title = titleMatch ? titleMatch[1].replace(" - YouTube", "") : "";
      const description = descMatch ? descMatch[1].replace(/\\n/g, "\n") : "";

      textToAnalyze = `Tytuł filmu: ${title}\n\nOpis filmu:\n${description}`;

      // Attempt to find caption details (timedtext url)
      const captionMatch = html.match(/"captionTracks":\[(.*?)\]/);
      if (captionMatch && captionMatch[1]) {
        const captions = JSON.parse(`[${captionMatch[1]}]`);
        if (captions.length > 0 && captions[0].baseUrl) {
          const subRes = await fetch(captions[0].baseUrl);
          const subXml = await subRes.text();
          // Stripping XML tags
          const cleanSubs = subXml
            .replace(/<text[^>]*>/g, " ")
            .replace(/<\/text>/g, "\n")
            .replace(/<[^>]*>/g, "");
          textToAnalyze += `\n\nTranskrypcja filmu:\n${cleanSubs.substring(0, 15000)}`; // limit to 15k characters
        }
      }
    } catch (scrapErr) {
      console.warn("Failed to scrape YouTube subtitles/metadata", scrapErr);
      textToAnalyze = "";
    }

    if (!textToAnalyze.trim()) {
      return new Response(JSON.stringify({
        error: "Nie udało się pobrać transkrypcji ani opisu filmu. Dodaj opis/notatki ręcznie albo wklej transkrypcję jako materiał."
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 422,
      });
    }

    // 2. Call Gemini API to extract and format route
    const model = Deno.env.get("GEMINI_MODEL") ?? "gemini-2.5-flash";
    const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(geminiKey)}`;

    const systemInstruction = `Jesteś ekspertem nawigacji GPX, tras turystycznych i przewodników podróżniczych w RouteMarket.io.
Twoim zadaniem jest przeanalizować dostępny tytuł, opis i transkrypcję vloga YouTube i wyciągnąć z nich fakty przydatne do projektu trasy.
Nie zmyślaj regionu, POI, dystansu, GPX ani parametrów trasy. Jeśli materiał nie zawiera wystarczających informacji, ustaw "needs_more_input": true i krótko napisz czego brakuje.
Musisz zwrócić odpowiedź wyłącznie w czystym formacie JSON o poniższej strukturze (bez żadnego formatowania markdown, tagów \`\`\`json ani innych znaków wokół):

{
  "needs_more_input": false,
  "missing": "",
  "title": "Atrakcyjny tytuł trasy",
  "description": "Opis oparty tylko na materiale z filmu (ok. 3-4 zdania)",
  "region": "Województwo, Polska lub Kraj",
  "distance_km": 120.5,
  "elevation_gain_m": 450,
  "category": "motorcycle" | "cycling" | "hiking",
  "cyclingSurface": "asphalt" | "offroad",
  "difficulty": "Easy" | "Moderate" | "Hard" | "Expert",
  "season": "Spring" | "Summer" | "Autumn" | "Winter" | "Year-round",
  "risk_level": "Low" | "Medium" | "High",
  "pois": [
    {
      "name": "Nazwa punktu POI (np. Parking Startowy)",
      "description": "Dlaczego warto tam się zatrzymać, wskazówki dla podróżnika",
      "category": "parking" | "dining" | "hotel" | "water" | "viewpoint",
      "lat": 50.1234,
      "lng": 22.5678,
      "rating": 4.8
    }
  ],
  "gpx_points": [
    { "lat": 50.1234, "lng": 22.5678, "ele": 230 }
  ]
}

Pamiętaj:
1. Zwracaj POI i gpx_points tylko wtedy, gdy materiał pozwala je sensownie ustalić.
2. Jeśli lokalizacja punktów jest niepewna, zostaw puste arrays i ustaw needs_more_input=true.
3. Jeśli wideo dotyczy motocykla, ustaw kategoria: "motorcycle". Rower -> "cycling". Pieszy trekking -> "hiking".`;

    const response = await fetch(geminiUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        contents: [
          {
            parts: [
              { text: `${systemInstruction}\n\nOto transkrypcja i dane vloga z YouTube:\n${textToAnalyze}` }
            ]
          }
        ]
      })
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`Gemini API error: ${errText}`);
    }

    const resJson = await response.json();
    let textResult = resJson.candidates?.[0]?.content?.parts?.[0]?.text || "";

    // Clean potential markdown quotes
    textResult = textResult.trim();
    if (textResult.startsWith("```json")) {
      textResult = textResult.substring(7);
    }
    if (textResult.endsWith("```")) {
      textResult = textResult.substring(0, textResult.length - 3);
    }
    textResult = textResult.trim();

    const parsedRoute = JSON.parse(textResult);
    parsedRoute.source = {
      type: "youtube",
      videoId,
      url: youtube_url,
      mode: "gemini",
      model
    };
    parsedRoute.isMock = false;

    return new Response(JSON.stringify(parsedRoute), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });

  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("YouTube AI generation error:", error);
    return new Response(JSON.stringify({ error: message }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 400,
    });
  }
});
