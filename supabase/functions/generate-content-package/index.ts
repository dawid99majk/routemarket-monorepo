// Generate Content Package — 3 images + 3 texts for a single route, in parallel
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY")!;
const OPENAI_CHAT_URL = "https://api.openai.com/v1/chat/completions";
const OPENAI_IMAGES_URL = "https://api.openai.com/v1/images/generations";

function pickImageSize(format: string): "1024x1024" | "1024x1536" | "1536x1024" {
  if (format === "instagram_story") return "1024x1536";
  if (format === "og_image") return "1536x1024";
  return "1024x1024";
}

type PackageType = "premiere" | "weekend_promo" | "throwback";

const PACKAGE_PROMPTS: Record<PackageType, { angle: string; tone: string }> = {
  premiere: {
    angle: "Premiera nowej trasy — buduj ekscytację, podkreśl świeżość, zaproś do pierwszych pobrań.",
    tone: "Energetyczny, świeży, z subtelnym sensem 'wow, coś nowego'.",
  },
  weekend_promo: {
    angle: "Weekendowa propozycja na wypad — szybka decyzja, planujemy na sobotę-niedzielę.",
    tone: "Konkretny, pragmatyczny, z wezwaniem do działania 'odpal w weekend'.",
  },
  throwback: {
    angle: "Klasyk którego nie można przegapić — buduj autorytet, social proof, sprawdzona trasa.",
    tone: "Spokojny, ekspercki, z nutą nostalgii i pewności jakości.",
  },
};

const IMAGE_FORMATS = [
  { format: "instagram_square", width: 1080, height: 1080, aspect: "1:1" },
  { format: "instagram_story", width: 1080, height: 1920, aspect: "9:16" },
  { format: "og_image", width: 1200, height: 630, aspect: "16:9" },
] as const;

async function generateImage(
  routeTitle: string,
  routeLocation: string,
  routeCategory: string,
  format: typeof IMAGE_FORMATS[number],
  packageType: PackageType,
  customInstructions?: string,
): Promise<{ format: string; bytes: Uint8Array } | { error: string; format: string }> {
  const angle = PACKAGE_PROMPTS[packageType].angle;
  const extra = customInstructions ? `\nDodatkowe instrukcje od admina: ${customInstructions}` : "";
  const prompt = `Marketing image for outdoor route "${routeTitle}" in ${routeLocation} (${routeCategory}). ${angle}${extra}
Brand: RouteMarket.io — deep forest green palette (#1F3A2E), subtle topographic line texture, outdoor adventure feel.
Composition: ${format.format === "instagram_story" ? "vertical 9:16, hero subject top, space at bottom for text overlay" : format.format === "og_image" ? "horizontal 16:9, cinematic landscape, balanced composition" : "square 1:1, centered subject, instagram-grid optimized"}.
Professional photography quality, no text in image. Aspect ratio ${format.aspect}.`;

  try {
    const resp = await fetch(OPENAI_IMAGES_URL, {
      method: "POST",
      headers: { Authorization: `Bearer ${OPENAI_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "gpt-image-1",
        prompt,
        size: pickImageSize(format.format),
        n: 1,
      }),
    });
    if (!resp.ok) return { error: `${resp.status}`, format: format.format };
    const data = await resp.json();
    const base64 = data?.data?.[0]?.b64_json;
    if (!base64) return { error: "no image", format: format.format };
    const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
    return { format: format.format, bytes };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "unknown", format: format.format };
  }
}

async function generateTexts(
  route: any,
  packageType: PackageType,
  customInstructions?: string,
): Promise<{ ig_post: string; fb_post: string; story_caption: string } | { error: string }> {
  const cfg = PACKAGE_PROMPTS[packageType];
  const extra = customInstructions ? `\n\n⚡ DODATKOWE INSTRUKCJE OD ADMINA (priorytet): ${customInstructions}` : "";
  const prompt = `Trasa: "${route.title}" — ${route.location_string} — ${route.categories?.name ?? "Outdoor"}.
Dystans: ${route.distance_km ?? "?"} km. Trudność: ${route.difficulty ?? "?"}. Cena: ${route.price} ${route.currency}.
${route.description ? `Opis: ${route.description.slice(0, 500)}` : ""}

Kontekst marketingowy: ${cfg.angle}
Ton: ${cfg.tone}${extra}

Wygeneruj 3 teksty po polsku. Wezwanie do działania zawsze prowadzi do RouteMarket.io.`;

  const resp = await fetch(OPENAI_CHAT_URL, {
    method: "POST",
    headers: { Authorization: `Bearer ${OPENAI_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "gpt-4o",
      messages: [
        { role: "system", content: "Jesteś ekspertem marketingu treści dla RouteMarket.io. Piszesz autentycznie, bez corporate-bullshit." },
        { role: "user", content: prompt },
      ],
      tools: [
        {
          type: "function",
          function: {
            name: "save_package_texts",
            description: "Zapisz 3 teksty pakietu marketingowego",
            parameters: {
              type: "object",
              properties: {
                ig_post: { type: "string", description: "Post na Instagram (max 2200 znaków). Storytelling + 5-7 emoji + 8-15 hashtagów na końcu." },
                fb_post: { type: "string", description: "Post na Facebook (300-500 słów). Dłuższy storytelling, bez hashtagów." },
                story_caption: { type: "string", description: "Krótka caption do IG/FB story (max 100 znaków). 1 hook + CTA." },
              },
              required: ["ig_post", "fb_post", "story_caption"],
            },
          },
        },
      ],
      tool_choice: { type: "function", function: { name: "save_package_texts" } },
    }),
  });

  if (!resp.ok) return { error: `Text gen failed: ${resp.status}` };
  const data = await resp.json();
  const tc = data.choices?.[0]?.message?.tool_calls?.[0];
  if (!tc) return { error: "No tool call" };
  try {
    return JSON.parse(tc.function.arguments);
  } catch {
    return { error: "Bad JSON" };
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const supabaseAuth = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_ANON_KEY")!, { global: { headers: { Authorization: authHeader } } });
    const { data: userRes } = await supabaseAuth.auth.getUser();
    if (!userRes.user) return new Response(JSON.stringify({ error: "Invalid session" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    const userId = userRes.user.id;

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const { data: roleData } = await supabase.from("user_roles").select("role").eq("user_id", userId).eq("role", "admin").maybeSingle();
    if (!roleData) return new Response(JSON.stringify({ error: "Admin only" }), { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const { route_id, package_type, custom_instructions } = await req.json();
    if (!route_id || !package_type) return new Response(JSON.stringify({ error: "route_id + package_type required" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    if (!PACKAGE_PROMPTS[package_type as PackageType]) return new Response(JSON.stringify({ error: "Invalid package_type" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    const customInstr = typeof custom_instructions === "string" && custom_instructions.trim() ? custom_instructions.trim().slice(0, 500) : undefined;

    const { data: route, error: routeErr } = await supabase
      .from("routes")
      .select("id, title, description, location_string, distance_km, difficulty, price, currency, categories(name)")
      .eq("id", route_id)
      .maybeSingle();
    if (routeErr || !route) return new Response(JSON.stringify({ error: "Route not found" }), { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const packageId = crypto.randomUUID();
    const categoryName = (route as any).categories?.name ?? "Outdoor";

    console.log(`[package] start ${packageId} route=${route_id} type=${package_type}`);

    // Run image generation + text generation in parallel
    const [textsResult, ...imageResults] = await Promise.all([
      generateTexts(route, package_type as PackageType, customInstr),
      ...IMAGE_FORMATS.map((f) => generateImage(route.title, route.location_string, categoryName, f, package_type as PackageType, customInstr)),
    ]);

    if ("error" in textsResult) {
      console.error("[package] texts error", textsResult.error);
      return new Response(JSON.stringify({ error: `Text generation failed: ${textsResult.error}` }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const assets: Array<{ kind: string; format: string; url?: string; text?: string; file_key?: string }> = [];

    // Upload images + save records
    for (const img of imageResults) {
      if ("error" in img) {
        console.error(`[package] image ${img.format} error: ${img.error}`);
        continue;
      }
      const fileKey = `${userId}/packages/${packageId}/${img.format}.png`;
      const { error: upErr } = await supabase.storage.from("marketing-assets").upload(fileKey, img.bytes, { contentType: "image/png", upsert: false });
      if (upErr) {
        console.error(`[package] upload ${img.format} error`, upErr);
        continue;
      }
      const { data: pub } = supabase.storage.from("marketing-assets").getPublicUrl(fileKey);
      await supabase.from("generated_content").insert({
        created_by: userId,
        content_type: "image",
        category: img.format,
        prompt: `Package ${package_type} for route #${route_id}`,
        file_key: fileKey,
        route_id,
        metadata: { package_id: packageId, package_type, route_title: route.title },
      });
      assets.push({ kind: "image", format: img.format, url: pub.publicUrl, file_key: fileKey });
    }

    // Save text records
    const textEntries = [
      { format: "ig_post", text: textsResult.ig_post },
      { format: "fb_post", text: textsResult.fb_post },
      { format: "story_caption", text: textsResult.story_caption },
    ];
    for (const t of textEntries) {
      await supabase.from("generated_content").insert({
        created_by: userId,
        content_type: "text",
        category: t.format,
        prompt: `Package ${package_type} for route #${route_id}`,
        result_text: t.text,
        route_id,
        metadata: { package_id: packageId, package_type, route_title: route.title },
      });
      assets.push({ kind: "text", format: t.format, text: t.text });
    }

    console.log(`[package] done ${packageId} — ${assets.length} assets`);

    return new Response(
      JSON.stringify({
        package_id: packageId,
        route: { id: route.id, title: route.title, location: route.location_string },
        package_type,
        assets,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    console.error("generate-content-package error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
