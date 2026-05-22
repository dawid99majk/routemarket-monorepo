import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY")!;
const GOOGLE_MAPS_API_KEY = Deno.env.get("GOOGLE_MAPS_API_KEY"); 
const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY");

// --- MACHINE CONFIGURATION ---
// 1. MÓZG OPERACJI: Gemini 2.5 Flash (Główny Architekt, 2M context)
const BRAIN_MODEL = "gemini-2.5-flash"; 
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/${BRAIN_MODEL}:generateContent?key=${GEMINI_API_KEY}`;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return new Response(JSON.stringify({ error: "Missing Authorization header" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const supabaseAuth = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_ANON_KEY")!, { global: { headers: { Authorization: authHeader } } });
    const { data: userRes } = await supabaseAuth.auth.getUser();
    if (!userRes.user) return new Response(JSON.stringify({ error: "Invalid session" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    const userId = userRes.user.id;

    const { instructions, files } = await req.json();

    console.log(`[magic-machine] User ${userId} starting multi-stage generation via ${BRAIN_MODEL}`);

    // --- KROK 1: MÓZG OPERACJI (Analiza i Ekstrakcja) ---
    const parts: any[] = [];
    parts.push({
      text: `Jesteś Głównym Architektem Tras w RouteMarket. Twoim zadaniem jest stworzenie kompleksowego, profesjonalnego przewodnika outdoorowego na podstawie dostarczonych materiałów (opisy, zdjęcia, PDFy).
      
      ZASADY GENEROWANIA TREŚCI:
      - OPIS: Musi być BOGATY i SZCZEGÓŁOWY (minimum 2500 znaków). Używaj nagłówków, pogrubień i przede wszystkim LIST PUNKTOWYCH dla atrakcji, etapów trasy i logistyki.
      - SEKCJE: Wstęp, Szczegółowy Przebieg Trasy (krok po kroku), Logistyka i Dojazd, Bezpieczeństwo, Wymagany Sprzęt, Ciekawostki.
      - JĘZYK: Polski, profesjonalny, zachęcający do przygody.
      
      ZASADY GENEROWANIA GPX:
      - Wygeneruj pełny, poprawny technicznie plik GPX XML (<gpx><trk><trkseg><trkpt>...).
      - TRASA: Na podstawie tekstu i zdjęć spróbuj odtworzyć rzeczywisty przebieg trasy. Jeśli nie masz dokładnych współrzędnych, wygeneruj ciąg punktów (min. 10-20 punktów) tworzących logiczną ścieżkę w opisywanym regionie.
      - POI: Dołącz punkty <wpt> dla najważniejszych POI wymienionych w opisie.
      
      ZWRÓĆ WYNIK WYŁĄCZNIE JAKO CZYSTY JSON:
      {
        "title": "Chwytliwa nazwa trasy",
        "description": "Pełny, sformatowany opis Markdown (min. 2500 znaków) z wieloma listami punktowymi.",
        "location_string": "Miejscowość, Region, Kraj",
        "latitude": 52.2297,
        "longitude": 21.0122,
        "distance_km": 12.5,
        "difficulty": "easy|moderate|hard|expert",
        "estimated_time_h": 4.5,
        "category_id": 1,
        "tags": ["widoki", "jezioro", "wymagająca"],
        "suggested_price": 29.99,
        "highlights": ["Atrakcja 1", "Atrakcja 2"],
        "equipment": ["Sprzęt 1", "Sprzęt 2"],
        "gpx_content": "<?xml version=\"1.0\" encoding=\"UTF-8\"?><gpx version=\"1.1\" creator=\"RouteMarket Atlas\" ...> FULL GPX XML </gpx>",
        "geometry_instruction": "Szczegółowy opis geograficzny miejsca dla modułu wizualizacji (po angielsku)",
        "imagen_prompt": "Ultra-realistic cinematic outdoor photography of [location], showing [terrain features], [lighting condition], 8k, highly detailed, professional photography style"
      }`
    });

    parts.push({ text: `Instrukcje użytkownika: ${instructions || "Brak dodatkowych instrukcji."}` });

    if (files && files.length > 0) {
      for (const file of files) {
        if (file.type === "image" || (file.data && file.data.startsWith("data:image"))) {
          const matches = file.data.match(/^data:(image\/\w+);base64,(.+)$/);
          if (matches) parts.push({ inline_data: { mime_type: matches[1], data: matches[2] } });
        } else if (file.type === "pdf" || (file.data && file.data.startsWith("data:application/pdf"))) {
          const matches = file.data.match(/^data:(application\/pdf);base64,(.+)$/);
          if (matches) parts.push({ inline_data: { mime_type: matches[1], data: matches[2] } });
        } else if (file.type === "docx" || (file.data && file.data.startsWith("data:application/vnd.openxmlformats-officedocument.wordprocessingml.document"))) {
          const matches = file.data.match(/^data:(application\/vnd\.openxmlformats-officedocument\.wordprocessingml\.document);base64,(.+)$/);
          if (matches) parts.push({ inline_data: { mime_type: matches[1], data: matches[2] } });
        } else {
          parts.push({ text: `Treść pliku ${file.name}:\n${file.data}\n---` });
        }
      }
    }

    const brainResp = await fetch(GEMINI_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts }],
        generationConfig: { temperature: 0.7, maxOutputTokens: 8192, responseMimeType: "application/json" }
      }),
    });

    if (!brainResp.ok) throw new Error(`Brain module failed: ${await brainResp.text()}`);
    const brainData = await brainResp.json();
    let resultText = brainData.candidates[0].content.parts[0].text;
    resultText = resultText.replace(/```json\s?|```/g, "").trim();
    const routeData = JSON.parse(resultText);

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    
    // 1. Zapisz trasę (Draft)
    const { data: route, error: insertErr } = await supabase.from("routes").insert({
      user_id: userId,
      title: routeData.title,
      description: routeData.description,
      location_string: routeData.location_string,
      latitude: routeData.latitude,
      longitude: routeData.longitude,
      distance_km: routeData.distance_km,
      difficulty: routeData.difficulty,
      estimated_time_h: routeData.estimated_time_h,
      category_id: routeData.category_id || 1,
      price: routeData.suggested_price || 0,
      status: "draft",
      ai_assisted: true,
      ai_assisted_scope: "magic_machine_v1",
      tags: routeData.tags || [],
      required_equipment: routeData.equipment || [],
    }).select("id").single();

    if (insertErr) throw insertErr;

    // 2. Upload GPX
    if (routeData.gpx_content) {
      const gpxPath = `${userId}/${route.id}/magic_route.gpx`;
      await supabase.storage.from("gpx-files").upload(gpxPath, routeData.gpx_content, { contentType: "application/gpx+xml", upsert: true });
      await supabase.from("routes").update({ gpx_file_key: gpxPath }).eq("id", route.id);
    }

    // --- KROK 2 & 3: GEOMETRIA I ESTETYKA (Maps + Imaging) ---
    // Pobieramy surowy kontekst geograficzny i nakładamy "filtr" estetyczny
    
    if (routeData.latitude && routeData.longitude) {
      try {
        let baseImageBlob: Blob | null = null;
        
        // Pobierz Geometry Context z Google Maps Static (Satellite)
        if (GOOGLE_MAPS_API_KEY) {
          console.log("[magic-machine] Fetching geometry context...");
          const mapUrl = `https://maps.googleapis.com/maps/api/staticmap?center=${routeData.latitude},${routeData.longitude}&zoom=15&size=1024x1024&maptype=satellite&key=${GOOGLE_MAPS_API_KEY}`;
          const mapResp = await fetch(mapUrl);
          if (mapResp.ok) baseImageBlob = await mapResp.blob();
        }

        // Generuj estetykę (Imagen 3 / DALL-E 3)
        // Jeśli mamy baseImageBlob, możemy użyć Image-to-Image (tu uproszczone do Text-to-Image z kontekstem)
        if (OPENAI_API_KEY) {
          console.log("[magic-machine] Refining aesthetics...");
          const imgResp = await fetch("https://api.openai.com/v1/images/generations", {
            method: "POST",
            headers: { Authorization: `Bearer ${OPENAI_API_KEY}`, "Content-Type": "application/json" },
            body: JSON.stringify({
              model: "dall-e-3",
              prompt: `${routeData.imagen_prompt}. Geographic context: ${routeData.geometry_instruction}`,
              n: 1, size: "1024x1024"
            }),
          });

          if (imgResp.ok) {
            const imgData = await imgResp.json();
            const finalImgResp = await fetch(imgData.data[0].url);
            const finalImgBlob = await finalImgResp.blob();
            const imgPath = `${userId}/${route.id}/cover.png`;
            await supabase.storage.from("route-covers").upload(imgPath, finalImgBlob, { contentType: "image/png", upsert: true });
            await supabase.from("routes").update({ cover_image_key: imgPath }).eq("id", route.id);
          }
        } else if (baseImageBlob) {
          // Jeśli brak generatora AI, użyj mapy jako okładki
          const imgPath = `${userId}/${route.id}/cover.png`;
          await supabase.storage.from("route-covers").upload(imgPath, baseImageBlob, { contentType: "image/png", upsert: true });
          await supabase.from("routes").update({ cover_image_key: imgPath }).eq("id", route.id);
        }
      } catch (vizErr) {
        console.error("[magic-machine] Visualization failed:", vizErr);
      }
    }

    console.log(`[magic-machine] Success: Route ${route.id} created.`);
    return new Response(JSON.stringify({ route_id: route.id, message: "Magic Machine successful!" }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (e) {
    console.error("[magic-machine] Critical error:", e);
    return new Response(JSON.stringify({ error: e.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});