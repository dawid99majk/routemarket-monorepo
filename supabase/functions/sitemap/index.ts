import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SITE_URL = "https://routemarket.io";

const STATIC_PAGES = [
  { path: "/", priority: "1.0", changefreq: "daily" },
  { path: "/map", priority: "0.8", changefreq: "daily" },
  { path: "/contact", priority: "0.5", changefreq: "monthly" },
  { path: "/legal/terms", priority: "0.3", changefreq: "monthly" },
  { path: "/legal/privacy", priority: "0.3", changefreq: "monthly" },
  { path: "/legal/cookies", priority: "0.3", changefreq: "monthly" },
  { path: "/legal/refunds", priority: "0.3", changefreq: "monthly" },
  { path: "/legal/documents", priority: "0.3", changefreq: "monthly" },
  { path: "/legal/acceptable-use", priority: "0.3", changefreq: "monthly" },
  { path: "/legal/copyright", priority: "0.3", changefreq: "monthly" },
  { path: "/legal/creator-agreement", priority: "0.3", changefreq: "monthly" },
  { path: "/legal/dsa-compliance", priority: "0.3", changefreq: "monthly" },
];

// Subcategories per category (mirrors src/lib/categories.ts SUB_CATEGORIES)
const SUB_CATEGORIES: Record<string, string[]> = {
  Motorcycling: ["Scenic Rides", "Adventure Routes", "Road Trips", "Travel", "Enduro"],
  Cycling: ["Road Cycling", "Gravel", "MTB", "Bikepacking", "Enduro", "Trekking"],
  Hiking: ["Easy Walks", "Day Hikes", "Mountain Hikes", "Multi-day Treks", "Backpacking"],
  Car: ["Road Trips", "Scenic Drives", "4x4 Lite", "4x4 Hard", "Caravaning / Vanlife"],
  Running: ["Road Running", "Trail Running", "City Runs", "Scenic Runs"],
  "Winter Sports": ["Ski Touring", "Cross-country Skiing", "Snowshoeing", "Winter Hiking"],
  "Water Sports": ["Kayaking", "Paddleboarding", "Sailing Routes", "Wild Swimming Spots"],
  City: ["Highlights", "City Walks", "Food & Drink", "Culture & History", "Themed Routes", "Nature in City", "Night & Lifestyle"],
};

const slugify = (s: string) =>
  s
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

Deno.serve(async () => {
  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const { data: routes } = await supabase
      .from("routes")
      .select("id, updated_at")
      .eq("status", "published")
      .order("updated_at", { ascending: false });

    const { data: categories } = await supabase
      .from("categories")
      .select("id, name");

    const today = new Date().toISOString().split("T")[0];

    let xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"
        xmlns:xhtml="http://www.w3.org/1999/xhtml">
`;

    // Static pages
    for (const page of STATIC_PAGES) {
      xml += `  <url>
    <loc>${SITE_URL}${page.path}</loc>
    <lastmod>${today}</lastmod>
    <changefreq>${page.changefreq}</changefreq>
    <priority>${page.priority}</priority>
    <xhtml:link rel="alternate" hreflang="pl" href="${SITE_URL}${page.path}?lang=pl" />
    <xhtml:link rel="alternate" hreflang="en" href="${SITE_URL}${page.path}?lang=en" />
    <xhtml:link rel="alternate" hreflang="x-default" href="${SITE_URL}${page.path}" />
  </url>
`;
    }

    // Category landing pages (filtered home)
    for (const cat of categories ?? []) {
      const slug = slugify(cat.name);
      xml += `  <url>
    <loc>${SITE_URL}/?category=${cat.id}</loc>
    <lastmod>${today}</lastmod>
    <changefreq>weekly</changefreq>
    <priority>0.7</priority>
  </url>
  <url>
    <loc>${SITE_URL}/map?category=${cat.id}</loc>
    <lastmod>${today}</lastmod>
    <changefreq>weekly</changefreq>
    <priority>0.6</priority>
  </url>
`;

      // Subcategory variants for the category
      const subs = SUB_CATEGORIES[cat.name] ?? [];
      for (const sub of subs) {
        xml += `  <url>
    <loc>${SITE_URL}/?category=${cat.id}&amp;subcategory=${encodeURIComponent(sub)}</loc>
    <lastmod>${today}</lastmod>
    <changefreq>weekly</changefreq>
    <priority>0.5</priority>
  </url>
`;
      }
    }

    // Route pages
    for (const route of routes ?? []) {
      const lastmod = route.updated_at
        ? new Date(route.updated_at).toISOString().split("T")[0]
        : today;
      xml += `  <url>
    <loc>${SITE_URL}/route/${route.id}</loc>
    <lastmod>${lastmod}</lastmod>
    <changefreq>weekly</changefreq>
    <priority>0.7</priority>
    <xhtml:link rel="alternate" hreflang="pl" href="${SITE_URL}/route/${route.id}?lang=pl" />
    <xhtml:link rel="alternate" hreflang="en" href="${SITE_URL}/route/${route.id}?lang=en" />
    <xhtml:link rel="alternate" hreflang="x-default" href="${SITE_URL}/route/${route.id}" />
  </url>
`;
    }

    xml += `</urlset>`;

    return new Response(xml, {
      headers: {
        "Content-Type": "application/xml; charset=utf-8",
        "Cache-Control": "public, max-age=3600, s-maxage=3600",
        "Access-Control-Allow-Origin": "*",
      },
    });
  } catch (err) {
    return new Response(`<!-- Error generating sitemap: ${err instanceof Error ? err.message : String(err)} -->`, {
      status: 500,
      headers: { "Content-Type": "application/xml" },
    });
  }
});
