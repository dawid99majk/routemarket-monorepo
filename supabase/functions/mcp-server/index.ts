import { Hono } from "hono";
import { McpServer, StreamableHttpTransport } from "mcp-lite";
import { createClient } from "@supabase/supabase-js";

const app = new Hono();
const mcpApp = new Hono();

function getSupabase() {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );
}

function getCreatorUserId(): string | null {
  return Deno.env.get("MCP_CREATOR_USER_ID") ?? null;
}

function authGuard(req: Request): Response | null {
  const key = Deno.env.get("API_READONLY_KEY");
  if (!key) return new Response("Server misconfigured", { status: 500 });
  const auth = req.headers.get("authorization");
  if (!auth || auth !== `Bearer ${key}`) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }
  return null;
}

function jsonContent(data: unknown) {
  return { content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }] };
}

const ROUTE_FIELDS = "id, title, description, price, category_id, location_string, latitude, longitude, distance_km, elevation_gain_m, estimated_time_h, difficulty, subcategory, surface_type, season, loop_type, start_point, end_point, instagram_url, youtube_url, created_at, user_id, categories(name)";

async function enrichWithCreators(sb: ReturnType<typeof getSupabase>, data: any[]) {
  const userIds = [...new Set(data.map((r: any) => r.user_id))];
  if (!userIds.length) return {};
  const { data: profiles } = await sb.from("profiles").select("user_id, display_name").in("user_id", userIds);
  const map: Record<string, string> = {};
  (profiles ?? []).forEach((p: any) => { map[p.user_id] = p.display_name ?? "Anonymous"; });
  return map;
}

function mapRoute(r: any, creatorName: string) {
  return {
    id: r.id, title: r.title, description: r.description, price: r.price,
    category_name: r.categories?.name ?? "Unknown", creator_name: creatorName,
    location: r.location_string, latitude: r.latitude, longitude: r.longitude,
    distance_km: r.distance_km, elevation_gain_m: r.elevation_gain_m,
    estimated_time_h: r.estimated_time_h, difficulty: r.difficulty,
    subcategory: r.subcategory, surface_type: r.surface_type, season: r.season,
    loop_type: r.loop_type, start_point: r.start_point, end_point: r.end_point,
    instagram_url: r.instagram_url, youtube_url: r.youtube_url, created_at: r.created_at,
  };
}

// ── MCP Server ──

const mcp = new McpServer({ name: "routemarket-readwrite", version: "2.4.0" });

// ── READ TOOLS ──

mcp.tool("list_routes", {
  description: "List published routes with optional category filter and pagination",
  inputSchema: {
    type: "object" as const,
    properties: {
      limit: { type: "number" as const, description: "Max results (default 50, max 200)" },
      offset: { type: "number" as const, description: "Offset for pagination (default 0)" },
      category_id: { type: "number" as const, description: "Filter by category ID" },
    },
  },
  handler: async (params: any) => {
    const sb = getSupabase();
    const limit = Math.min(params.limit ?? 50, 200);
    const offset = params.offset ?? 0;
    let query = sb.from("routes").select(ROUTE_FIELDS).eq("status", "published").order("created_at", { ascending: false }).range(offset, offset + limit - 1);
    if (params.category_id) query = query.eq("category_id", params.category_id);
    const { data, error } = await query;
    if (error) return jsonContent({ error: error.message });
    const profileMap = await enrichWithCreators(sb, data ?? []);
    return jsonContent({ data: (data ?? []).map((r: any) => mapRoute(r, profileMap[r.user_id] ?? "Anonymous")), limit, offset });
  },
});

mcp.tool("get_route", {
  description: "Get details of a single published route by ID",
  inputSchema: {
    type: "object" as const,
    properties: { id: { type: "number" as const, description: "Route ID" } },
    required: ["id"],
  },
  handler: async (params: any) => {
    const sb = getSupabase();
    const { data, error } = await sb.from("routes").select(ROUTE_FIELDS).eq("id", params.id).eq("status", "published").maybeSingle();
    if (error) return jsonContent({ error: error.message });
    if (!data) return jsonContent({ error: "Route not found" });
    const { data: profile } = await sb.from("profiles").select("display_name").eq("user_id", data.user_id).maybeSingle();
    return jsonContent(mapRoute(data, profile?.display_name ?? "Anonymous"));
  },
});

mcp.tool("list_categories", {
  description: "List all route categories",
  inputSchema: { type: "object" as const, properties: {} },
  handler: async () => {
    const sb = getSupabase();
    const { data, error } = await sb.from("categories").select("id, name, icon, sort_order").order("sort_order");
    if (error) return jsonContent({ error: error.message });
    return jsonContent(data);
  },
});

mcp.tool("list_creators", {
  description: "List public creator profiles (no Stripe IDs exposed)",
  inputSchema: {
    type: "object" as const,
    properties: {
      limit: { type: "number" as const, description: "Max results (default 50, max 200)" },
      offset: { type: "number" as const, description: "Offset (default 0)" },
    },
  },
  handler: async (params: any) => {
    const sb = getSupabase();
    const limit = Math.min(params.limit ?? 50, 200);
    const offset = params.offset ?? 0;
    const { data, error } = await sb.from("creator_profiles").select("display_name, bio, total_sales, created_at").order("created_at", { ascending: false }).range(offset, offset + limit - 1);
    if (error) return jsonContent({ error: error.message });
    return jsonContent({ data, limit, offset });
  },
});

mcp.tool("get_route_stats", {
  description: "Get ratings and purchase count for a route",
  inputSchema: {
    type: "object" as const,
    properties: { route_id: { type: "number" as const, description: "Route ID" } },
    required: ["route_id"],
  },
  handler: async (params: any) => {
    const sb = getSupabase();
    const [ratingsRes, purchasesRes] = await Promise.all([
      sb.from("ratings").select("score").eq("route_id", params.route_id),
      sb.from("purchases").select("id").eq("route_id", params.route_id),
    ]);
    const scores = (ratingsRes.data ?? []).map((r: any) => r.score);
    const avg = scores.length ? Math.round((scores.reduce((a: number, b: number) => a + b, 0) / scores.length) * 10) / 10 : 0;
    return jsonContent({ route_id: params.route_id, average_rating: avg, total_ratings: scores.length, total_purchases: purchasesRes.data?.length ?? 0 });
  },
});

mcp.tool("list_route_pois", {
  description: "List Points of Interest for a published route",
  inputSchema: {
    type: "object" as const,
    properties: { route_id: { type: "number" as const, description: "Route ID" } },
    required: ["route_id"],
  },
  handler: async (params: any) => {
    const sb = getSupabase();
    const { data, error } = await sb.from("route_pois").select("name, type, lat, lng, description, fun_fact, sort_order").eq("route_id", params.route_id).order("sort_order");
    if (error) return jsonContent({ error: error.message });
    return jsonContent(data);
  },
});

mcp.tool("search_routes", {
  description: "Search published routes by title or location (case-insensitive)",
  inputSchema: {
    type: "object" as const,
    properties: {
      query: { type: "string" as const, description: "Search term" },
      limit: { type: "number" as const, description: "Max results (default 20, max 100)" },
    },
    required: ["query"],
  },
  handler: async (params: any) => {
    const sb = getSupabase();
    const limit = Math.min(params.limit ?? 20, 100);
    const q = `%${params.query}%`;
    const { data, error } = await sb.from("routes")
      .select("id, title, description, price, location_string, distance_km, difficulty, subcategory, created_at, user_id, categories(name)")
      .eq("status", "published")
      .or(`title.ilike.${q},location_string.ilike.${q},description.ilike.${q}`)
      .order("created_at", { ascending: false })
      .limit(limit);
    if (error) return jsonContent({ error: error.message });
    const profileMap = await enrichWithCreators(sb, data ?? []);
    const routes = (data ?? []).map((r: any) => ({
      id: r.id, title: r.title, description: r.description, price: r.price,
      category_name: r.categories?.name ?? "Unknown", creator_name: profileMap[r.user_id] ?? "Anonymous",
      location: r.location_string, distance_km: r.distance_km, difficulty: r.difficulty,
      subcategory: r.subcategory, created_at: r.created_at,
    }));
    return jsonContent({ data: routes, query: params.query, limit });
  },
});

mcp.tool("list_my_drafts", {
  description: "List all routes (drafts and/or published) owned by the configured MCP creator. Use this to find route IDs by title.",
  inputSchema: {
    type: "object" as const,
    properties: {
      status: { type: "string" as const, description: "Filter by status: draft | published | all (default: all)" },
      limit: { type: "number" as const, description: "Max results (default 50, max 200)" },
      offset: { type: "number" as const, description: "Offset (default 0)" },
    },
  },
  handler: async (params: any) => {
    const userId = getCreatorUserId();
    if (!userId) return jsonContent({ error: "MCP_CREATOR_USER_ID not configured" });
    const sb = getSupabase();
    const limit = Math.min(params.limit ?? 50, 200);
    const offset = params.offset ?? 0;
    let query = sb.from("routes")
      .select("id, title, status, price, location_string, distance_km, difficulty, category_id, created_at, updated_at, categories(name)")
      .eq("user_id", userId)
      .order("updated_at", { ascending: false })
      .range(offset, offset + limit - 1);
    const status = params.status ?? "all";
    if (status === "draft" || status === "published") query = query.eq("status", status);
    const { data, error } = await query;
    if (error) return jsonContent({ error: error.message });
    const routes = (data ?? []).map((r: any) => ({
      id: r.id, title: r.title, status: r.status, price: r.price,
      location: r.location_string, distance_km: r.distance_km, difficulty: r.difficulty,
      category_name: r.categories?.name ?? null,
      created_at: r.created_at, updated_at: r.updated_at,
    }));
    return jsonContent({ data: routes, status, limit, offset, total: routes.length });
  },
});

mcp.tool("find_my_route_by_title", {
  description: "Search YOUR OWN routes (drafts + published) by title fragment. Best way to look up a route_id when you only remember the name.",
  inputSchema: {
    type: "object" as const,
    properties: {
      query: { type: "string" as const, description: "Title fragment (case-insensitive)" },
      status: { type: "string" as const, description: "Optional filter: draft | published | all (default: all)" },
      limit: { type: "number" as const, description: "Max results (default 20, max 100)" },
    },
    required: ["query"],
  },
  handler: async (params: any) => {
    const userId = getCreatorUserId();
    if (!userId) return jsonContent({ error: "MCP_CREATOR_USER_ID not configured" });
    const sb = getSupabase();
    const limit = Math.min(params.limit ?? 20, 100);
    const q = `%${params.query}%`;
    let query = sb.from("routes")
      .select("id, title, status, price, location_string, distance_km, difficulty, created_at, updated_at, categories(name)")
      .eq("user_id", userId)
      .or(`title.ilike.${q},location_string.ilike.${q}`)
      .order("updated_at", { ascending: false })
      .limit(limit);
    const status = params.status ?? "all";
    if (status === "draft" || status === "published") query = query.eq("status", status);
    const { data, error } = await query;
    if (error) return jsonContent({ error: error.message });
    const routes = (data ?? []).map((r: any) => ({
      id: r.id, title: r.title, status: r.status, price: r.price,
      location: r.location_string, distance_km: r.distance_km, difficulty: r.difficulty,
      category_name: r.categories?.name ?? null,
      created_at: r.created_at, updated_at: r.updated_at,
    }));
    return jsonContent({ data: routes, query: params.query, status, total: routes.length });
  },
});

mcp.tool("get_my_route_full", {
  description: "Get ALL fields of a route owned by the MCP creator, including the buyer-only full_description from route_private_details. Works for drafts and published.",
  inputSchema: {
    type: "object" as const,
    properties: { route_id: { type: "number" as const, description: "Route ID" } },
    required: ["route_id"],
  },
  handler: async (params: any) => {
    const userId = getCreatorUserId();
    if (!userId) return jsonContent({ error: "MCP_CREATOR_USER_ID not configured" });
    const sb = getSupabase();
    const { data: route, error } = await sb.from("routes").select("*, categories(name)").eq("id", params.route_id).eq("user_id", userId).maybeSingle();
    if (error) return jsonContent({ error: error.message });
    if (!route) return jsonContent({ error: "Route not found or not owned by MCP creator" });
    const { data: priv } = await sb.from("route_private_details").select("full_description").eq("route_id", params.route_id).maybeSingle();
    const { data: imgs } = await sb.from("route_images").select("image_key, sort_order").eq("route_id", params.route_id).order("sort_order");
    return jsonContent({ ...route, full_description: priv?.full_description ?? "", images: imgs ?? [] });
  },
});

// ── WRITE TOOLS ──

mcp.tool("create_route_draft", {
  description: "Create a new route draft (status='draft'). Assigned to the configured MCP creator. Returns the new route ID.",
  inputSchema: {
    type: "object" as const,
    properties: {
      title: { type: "string" as const, description: "Route title (required)" },
      description: { type: "string" as const, description: "PUBLIC short summary visible on the route card and BEFORE purchase. Max 3000 chars. Keep it concise and enticing." },
      full_description: { type: "string" as const, description: "FULL route description visible only AFTER purchase and inside the generated PDF. Max 30 000 chars. Markdown allowed. Stored in route_private_details." },
      price: { type: "number" as const, description: "Price in route currency (0 for free)" },
      currency: { type: "string" as const, description: "Currency code (PLN, EUR, USD). Default: PLN" },
      category_id: { type: "number" as const, description: "Category ID (use list_categories)" },
      subcategory: { type: "string" as const, description: "Subcategory slug" },
      location_string: { type: "string" as const, description: "Human-readable location (e.g. 'Tatry, Polska')" },
      latitude: { type: "number" as const, description: "Start latitude" },
      longitude: { type: "number" as const, description: "Start longitude" },
      distance_km: { type: "number" as const, description: "Total distance in km" },
      elevation_gain_m: { type: "number" as const, description: "Total elevation gain in meters" },
      estimated_time_h: { type: "number" as const, description: "Estimated time in hours" },
      difficulty: { type: "string" as const, description: "easy | moderate | hard | expert" },
      surface_type: { type: "string" as const, description: "Surface type description" },
      season: { type: "string" as const, description: "Comma-separated seasons (spring,summer,autumn,winter)" },
      loop_type: { type: "string" as const, description: "loop | out_and_back | point_to_point" },
      start_point: { type: "string" as const, description: "Start point description" },
      end_point: { type: "string" as const, description: "End point description" },
      risk_level: { type: "string" as const, description: "low | medium | high | unknown" },
      pets_friendly: { type: "boolean" as const, description: "Pet-friendly route" },
      ai_assisted: { type: "boolean" as const, description: "AI was used to prepare content (transparency)" },
      ai_assisted_scope: { type: "string" as const, description: "Scope of AI assistance (e.g. 'description,poi-text')" },
      ai_assisted_note: { type: "string" as const, description: "Additional note about AI assistance shown to buyers" },
      data_confidence: { type: "string" as const, description: "verified | partially-verified | unverified" },
      last_verified_at: { type: "string" as const, description: "ISO timestamp of last on-the-ground verification" },
      known_hazards: { type: "array" as const, items: { type: "string" as const }, description: "List of known hazards on the route" },
      required_equipment: { type: "array" as const, items: { type: "string" as const }, description: "Required equipment list" },
      audience: { type: "array" as const, items: { type: "string" as const }, description: "Target audience tags (e.g. family, solo, advanced)" },
      route_type: { type: "string" as const, description: "Route type slug (hiking, cycling, motorcycle, etc.)" },
      duration: { type: "string" as const, description: "Duration bucket (short | half-day | full-day | multi-day)" },
      budget: { type: "string" as const, description: "Budget bucket (low | medium | high)" },
      instagram_url: { type: "string" as const, description: "Optional Instagram link (https://...)" },
      youtube_url: { type: "string" as const, description: "Optional YouTube link (https://...)" },
      tags: { type: "array" as const, items: { type: "string" as const }, description: "Tags array" },
    },
    required: ["title"],
  },
  handler: async (params: any) => {
    const userId = getCreatorUserId();
    if (!userId) return jsonContent({ error: "MCP_CREATOR_USER_ID not configured" });
    const sb = getSupabase();
    const payload: any = {
      user_id: userId,
      title: params.title,
      description: (params.description ?? "").slice(0, 3000),
      price: params.price ?? 0,
      currency: params.currency ?? "PLN",
      category_id: params.category_id ?? null,
      subcategory: params.subcategory ?? null,
      location_string: params.location_string ?? "",
      latitude: params.latitude ?? 0,
      longitude: params.longitude ?? 0,
      distance_km: params.distance_km ?? null,
      elevation_gain_m: params.elevation_gain_m ?? null,
      estimated_time_h: params.estimated_time_h ?? null,
      difficulty: params.difficulty ?? null,
      surface_type: params.surface_type ?? null,
      season: params.season ?? null,
      loop_type: params.loop_type ?? null,
      start_point: params.start_point ?? null,
      end_point: params.end_point ?? null,
      risk_level: params.risk_level ?? "unknown",
      pets_friendly: params.pets_friendly ?? false,
      ai_assisted: params.ai_assisted ?? true,
      ai_assisted_scope: params.ai_assisted_scope ?? null,
      ai_assisted_note: params.ai_assisted_note ?? null,
      data_confidence: params.data_confidence ?? "unverified",
      last_verified_at: params.last_verified_at ?? null,
      known_hazards: params.known_hazards ?? [],
      required_equipment: params.required_equipment ?? [],
      audience: params.audience ?? [],
      route_type: params.route_type ?? null,
      duration: params.duration ?? null,
      budget: params.budget ?? null,
      instagram_url: params.instagram_url ?? null,
      youtube_url: params.youtube_url ?? null,
      tags: params.tags ?? [],
      status: "draft",
    };
    const { data, error } = await sb.from("routes").insert(payload).select("id, title, status, created_at").single();
    if (error) return jsonContent({ error: error.message });
    if (params.full_description) {
      await sb.from("route_private_details").upsert(
        { route_id: data.id, full_description: String(params.full_description).slice(0, 30000) },
        { onConflict: "route_id" }
      );
    }
    return jsonContent({ success: true, route: data });
  },
});

mcp.tool("update_route", {
  description: "Update fields of an existing route owned by the MCP creator. Pass only fields you want to change. Note: 'description' is the public short summary (max 3000 chars), 'full_description' is the buyer-only long form (max 30 000 chars, stored in route_private_details). Status cannot be set to 'published' via MCP — publication is UI-only.",
  inputSchema: {
    type: "object" as const,
    properties: {
      route_id: { type: "number" as const, description: "Route ID to update" },
      title: { type: "string" as const },
      description: { type: "string" as const, description: "Public short summary (max 3000)" },
      full_description: { type: "string" as const, description: "Buyer-only full description (max 30 000)" },
      price: { type: "number" as const },
      currency: { type: "string" as const },
      category_id: { type: "number" as const },
      subcategory: { type: "string" as const },
      location_string: { type: "string" as const },
      latitude: { type: "number" as const },
      longitude: { type: "number" as const },
      distance_km: { type: "number" as const },
      elevation_gain_m: { type: "number" as const },
      estimated_time_h: { type: "number" as const },
      difficulty: { type: "string" as const },
      surface_type: { type: "string" as const },
      season: { type: "string" as const },
      loop_type: { type: "string" as const },
      start_point: { type: "string" as const },
      end_point: { type: "string" as const },
      risk_level: { type: "string" as const },
      pets_friendly: { type: "boolean" as const },
      ai_assisted: { type: "boolean" as const },
      ai_assisted_scope: { type: "string" as const },
      ai_assisted_note: { type: "string" as const },
      data_confidence: { type: "string" as const },
      last_verified_at: { type: "string" as const },
      known_hazards: { type: "array" as const, items: { type: "string" as const } },
      required_equipment: { type: "array" as const, items: { type: "string" as const } },
      audience: { type: "array" as const, items: { type: "string" as const } },
      route_type: { type: "string" as const },
      duration: { type: "string" as const },
      budget: { type: "string" as const },
      instagram_url: { type: "string" as const },
      youtube_url: { type: "string" as const },
      tags: { type: "array" as const, items: { type: "string" as const } },
      status: { type: "string" as const, description: "Only 'draft' is allowed via MCP. Publication must be done from the UI after manual review." },
    },
    required: ["route_id"],
  },
  handler: async (params: any) => {
    const userId = getCreatorUserId();
    if (!userId) return jsonContent({ error: "MCP_CREATOR_USER_ID not configured" });
    const sb = getSupabase();
    const { route_id, full_description, ...rest } = params;
    if (rest.status && rest.status !== "draft") {
      return jsonContent({ error: "Publication is UI-only. MCP can only keep status='draft'." });
    }
    if (typeof rest.description === "string") rest.description = rest.description.slice(0, 3000);
    const updates: any = {};
    Object.keys(rest).forEach((k) => { if (rest[k] !== undefined) updates[k] = rest[k]; });
    let routeRow: any = null;
    if (Object.keys(updates).length) {
      const { data, error } = await sb.from("routes").update(updates).eq("id", route_id).eq("user_id", userId).select("id, title, status, updated_at").maybeSingle();
      if (error) return jsonContent({ error: error.message });
      if (!data) return jsonContent({ error: "Route not found or not owned by MCP creator" });
      routeRow = data;
    }
    if (typeof full_description === "string") {
      // Verify ownership before writing private details
      const { data: own } = await sb.from("routes").select("id").eq("id", route_id).eq("user_id", userId).maybeSingle();
      if (!own) return jsonContent({ error: "Route not found or not owned by MCP creator" });
      const { error: pErr } = await sb.from("route_private_details").upsert(
        { route_id, full_description: full_description.slice(0, 30000) },
        { onConflict: "route_id" }
      );
      if (pErr) return jsonContent({ error: `Failed to save full_description: ${pErr.message}` });
    }
    if (!routeRow && typeof full_description !== "string") return jsonContent({ error: "No fields to update" });
    return jsonContent({ success: true, route: routeRow ?? { id: route_id }, full_description_updated: typeof full_description === "string" });
  },
});

mcp.tool("add_route_poi", {
  description: "Add a Point of Interest to a route owned by the MCP creator.",
  inputSchema: {
    type: "object" as const,
    properties: {
      route_id: { type: "number" as const, description: "Route ID" },
      name: { type: "string" as const, description: "POI name" },
      type: { type: "string" as const, description: "POI type: viewpoint | water | food | shelter | landmark | hazard | other" },
      lat: { type: "number" as const, description: "Latitude" },
      lng: { type: "number" as const, description: "Longitude" },
      description: { type: "string" as const, description: "Description" },
      fun_fact: { type: "string" as const, description: "Optional interesting fact" },
      sort_order: { type: "number" as const, description: "Display order (default 0)" },
    },
    required: ["route_id", "name", "lat", "lng"],
  },
  handler: async (params: any) => {
    const userId = getCreatorUserId();
    if (!userId) return jsonContent({ error: "MCP_CREATOR_USER_ID not configured" });
    const sb = getSupabase();
    const { data: route } = await sb.from("routes").select("id").eq("id", params.route_id).eq("user_id", userId).maybeSingle();
    if (!route) return jsonContent({ error: "Route not found or not owned by MCP creator" });
    const { data, error } = await sb.from("route_pois").insert({
      route_id: params.route_id,
      name: params.name,
      type: params.type ?? "other",
      lat: params.lat,
      lng: params.lng,
      description: params.description ?? "",
      fun_fact: params.fun_fact ?? null,
      sort_order: params.sort_order ?? 0,
    }).select("id, name, type, sort_order").single();
    if (error) return jsonContent({ error: error.message });
    return jsonContent({ success: true, poi: data });
  },
});

mcp.tool("add_route_tip", {
  description: "Add a tip to a route owned by the MCP creator. The wizard recognizes specific category keys: 'before_start_fuel', 'before_start_network', 'before_start_weather', 'before_start_permits' (single 'Before You Go' entries — only one row per key is shown in UI) and 'good_tip' (multiple allowed, shown as numbered list).",
  inputSchema: {
    type: "object" as const,
    properties: {
      route_id: { type: "number" as const, description: "Route ID" },
      category: { type: "string" as const, description: "One of: before_start_fuel | before_start_network | before_start_weather | before_start_permits | good_tip" },
      content: { type: "string" as const, description: "Tip content" },
      sort_order: { type: "number" as const, description: "Display order (default 0)" },
    },
    required: ["route_id", "category", "content"],
  },
  handler: async (params: any) => {
    const userId = getCreatorUserId();
    if (!userId) return jsonContent({ error: "MCP_CREATOR_USER_ID not configured" });
    const sb = getSupabase();
    const { data: route } = await sb.from("routes").select("id").eq("id", params.route_id).eq("user_id", userId).maybeSingle();
    if (!route) return jsonContent({ error: "Route not found or not owned by MCP creator" });
    const allowed = ["before_start_fuel","before_start_network","before_start_weather","before_start_permits","good_tip"];
    if (!allowed.includes(params.category)) {
      return jsonContent({ error: `Invalid category. Use one of: ${allowed.join(", ")}` });
    }
    const { data, error } = await sb.from("route_tips").insert({
      route_id: params.route_id,
      category: params.category,
      content: params.content,
      sort_order: params.sort_order ?? 0,
    }).select("id, category, sort_order").single();
    if (error) return jsonContent({ error: error.message });
    return jsonContent({ success: true, tip: data });
  },
});

mcp.tool("list_route_tips", {
  description: "List all tips for a route owned by the MCP creator (drafts included).",
  inputSchema: {
    type: "object" as const,
    properties: { route_id: { type: "number" as const } },
    required: ["route_id"],
  },
  handler: async (params: any) => {
    const userId = getCreatorUserId();
    if (!userId) return jsonContent({ error: "MCP_CREATOR_USER_ID not configured" });
    const sb = getSupabase();
    const { data: route } = await sb.from("routes").select("id").eq("id", params.route_id).eq("user_id", userId).maybeSingle();
    if (!route) return jsonContent({ error: "Route not found or not owned by MCP creator" });
    const { data, error } = await sb.from("route_tips").select("id, category, content, sort_order").eq("route_id", params.route_id).order("sort_order");
    if (error) return jsonContent({ error: error.message });
    return jsonContent({ data });
  },
});

mcp.tool("update_route_tip", {
  description: "Update content/category/sort_order of an existing tip.",
  inputSchema: {
    type: "object" as const,
    properties: {
      tip_id: { type: "string" as const, description: "Tip UUID" },
      content: { type: "string" as const },
      category: { type: "string" as const },
      sort_order: { type: "number" as const },
    },
    required: ["tip_id"],
  },
  handler: async (params: any) => {
    const userId = getCreatorUserId();
    if (!userId) return jsonContent({ error: "MCP_CREATOR_USER_ID not configured" });
    const sb = getSupabase();
    const { data: tip } = await sb.from("route_tips").select("id, route_id, routes!inner(user_id)").eq("id", params.tip_id).maybeSingle();
    if (!tip || (tip as any).routes?.user_id !== userId) return jsonContent({ error: "Tip not found or not owned by MCP creator" });
    const updates: any = {};
    ["content","category","sort_order"].forEach((k) => { if (params[k] !== undefined) updates[k] = params[k]; });
    if (!Object.keys(updates).length) return jsonContent({ error: "No fields to update" });
    const { data, error } = await sb.from("route_tips").update(updates).eq("id", params.tip_id).select("id, category, content, sort_order").single();
    if (error) return jsonContent({ error: error.message });
    return jsonContent({ success: true, tip: data });
  },
});

mcp.tool("delete_route_tip", {
  description: "Delete a tip from a route owned by the MCP creator.",
  inputSchema: {
    type: "object" as const,
    properties: { tip_id: { type: "string" as const } },
    required: ["tip_id"],
  },
  handler: async (params: any) => {
    const userId = getCreatorUserId();
    if (!userId) return jsonContent({ error: "MCP_CREATOR_USER_ID not configured" });
    const sb = getSupabase();
    const { data: tip } = await sb.from("route_tips").select("id, routes!inner(user_id)").eq("id", params.tip_id).maybeSingle();
    if (!tip || (tip as any).routes?.user_id !== userId) return jsonContent({ error: "Tip not found or not owned by MCP creator" });
    const { error } = await sb.from("route_tips").delete().eq("id", params.tip_id);
    if (error) return jsonContent({ error: error.message });
    return jsonContent({ success: true });
  },
});

mcp.tool("add_route_recommendation", {
  description: "Add a recommendation (place to eat/stay/visit) to a route owned by the MCP creator.",
  inputSchema: {
    type: "object" as const,
    properties: {
      route_id: { type: "number" as const, description: "Route ID" },
      name: { type: "string" as const, description: "Place name (required)" },
      description: { type: "string" as const, description: "Short description" },
      what_to_order: { type: "string" as const, description: "What to order / try" },
      price_range: { type: "string" as const, description: "budget | mid-range | premium (default mid-range)" },
      photo_key: { type: "string" as const, description: "Optional storage key" },
      sort_order: { type: "number" as const, description: "Display order (default 0)" },
    },
    required: ["route_id", "name"],
  },
  handler: async (params: any) => {
    const userId = getCreatorUserId();
    if (!userId) return jsonContent({ error: "MCP_CREATOR_USER_ID not configured" });
    const sb = getSupabase();
    const { data: route } = await sb.from("routes").select("id").eq("id", params.route_id).eq("user_id", userId).maybeSingle();
    if (!route) return jsonContent({ error: "Route not found or not owned by MCP creator" });
    const { data, error } = await sb.from("route_recommendations").insert({
      route_id: params.route_id,
      name: params.name,
      description: params.description ?? "",
      what_to_order: params.what_to_order ?? "",
      price_range: params.price_range ?? "mid-range",
      photo_key: params.photo_key ?? null,
      sort_order: params.sort_order ?? 0,
    }).select("id, name, price_range, sort_order").single();
    if (error) return jsonContent({ error: error.message });
    return jsonContent({ success: true, recommendation: data });
  },
});

mcp.tool("list_route_recommendations", {
  description: "List all recommendations for a route owned by the MCP creator.",
  inputSchema: {
    type: "object" as const,
    properties: { route_id: { type: "number" as const } },
    required: ["route_id"],
  },
  handler: async (params: any) => {
    const userId = getCreatorUserId();
    if (!userId) return jsonContent({ error: "MCP_CREATOR_USER_ID not configured" });
    const sb = getSupabase();
    const { data: route } = await sb.from("routes").select("id").eq("id", params.route_id).eq("user_id", userId).maybeSingle();
    if (!route) return jsonContent({ error: "Route not found or not owned by MCP creator" });
    const { data, error } = await sb.from("route_recommendations").select("id, name, description, what_to_order, price_range, photo_key, sort_order").eq("route_id", params.route_id).order("sort_order");
    if (error) return jsonContent({ error: error.message });
    return jsonContent({ data });
  },
});

mcp.tool("update_route_recommendation", {
  description: "Update fields of an existing recommendation.",
  inputSchema: {
    type: "object" as const,
    properties: {
      recommendation_id: { type: "string" as const, description: "Recommendation UUID" },
      name: { type: "string" as const },
      description: { type: "string" as const },
      what_to_order: { type: "string" as const },
      price_range: { type: "string" as const },
      photo_key: { type: "string" as const },
      sort_order: { type: "number" as const },
    },
    required: ["recommendation_id"],
  },
  handler: async (params: any) => {
    const userId = getCreatorUserId();
    if (!userId) return jsonContent({ error: "MCP_CREATOR_USER_ID not configured" });
    const sb = getSupabase();
    const { data: rec } = await sb.from("route_recommendations").select("id, routes!inner(user_id)").eq("id", params.recommendation_id).maybeSingle();
    if (!rec || (rec as any).routes?.user_id !== userId) return jsonContent({ error: "Recommendation not found or not owned by MCP creator" });
    const updates: any = {};
    ["name","description","what_to_order","price_range","photo_key","sort_order"].forEach((k) => { if (params[k] !== undefined) updates[k] = params[k]; });
    if (!Object.keys(updates).length) return jsonContent({ error: "No fields to update" });
    const { data, error } = await sb.from("route_recommendations").update(updates).eq("id", params.recommendation_id).select("id, name, price_range, sort_order").single();
    if (error) return jsonContent({ error: error.message });
    return jsonContent({ success: true, recommendation: data });
  },
});

mcp.tool("delete_route_recommendation", {
  description: "Delete a recommendation from a route owned by the MCP creator.",
  inputSchema: {
    type: "object" as const,
    properties: { recommendation_id: { type: "string" as const } },
    required: ["recommendation_id"],
  },
  handler: async (params: any) => {
    const userId = getCreatorUserId();
    if (!userId) return jsonContent({ error: "MCP_CREATOR_USER_ID not configured" });
    const sb = getSupabase();
    const { data: rec } = await sb.from("route_recommendations").select("id, routes!inner(user_id)").eq("id", params.recommendation_id).maybeSingle();
    if (!rec || (rec as any).routes?.user_id !== userId) return jsonContent({ error: "Recommendation not found or not owned by MCP creator" });
    const { error } = await sb.from("route_recommendations").delete().eq("id", params.recommendation_id);
    if (error) return jsonContent({ error: error.message });
    return jsonContent({ success: true });
  },
});

// ── IMAGE GENERATION HELPERS ──

function pickImageQuality(quality?: string): "high" | "medium" | "low" {
  if (quality === "pro") return "high";
  return "medium";
}

async function callImageModel(opts: {
  prompt: string;
  quality?: string;
  imageDataUrl?: string; // for edits
}): Promise<{ ok: true; bytes: Uint8Array; mime: string } | { ok: false; error: string; status?: number }> {
  const apiKey = Deno.env.get("OPENAI_API_KEY");
  if (!apiKey) return { ok: false, error: "OPENAI_API_KEY not configured" };

  const quality = pickImageQuality(opts.quality);
  let resp: Response;

  if (opts.imageDataUrl) {
    // Edit existing image with gpt-image-1 via multipart /v1/images/edits
    const match = opts.imageDataUrl.match(/^data:([^;]+);base64,(.+)$/);
    if (!match) return { ok: false, error: "Malformed input image data URL" };
    const inMime = match[1];
    const inBin = atob(match[2]);
    const inBytes = new Uint8Array(inBin.length);
    for (let i = 0; i < inBin.length; i++) inBytes[i] = inBin.charCodeAt(i);

    const form = new FormData();
    form.append("model", "gpt-image-1");
    form.append("prompt", opts.prompt);
    form.append("size", "1024x1024");
    form.append("quality", quality);
    form.append("image", new Blob([inBytes], { type: inMime }), "input.png");

    resp = await fetch("https://api.openai.com/v1/images/edits", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}` },
      body: form,
    });
  } else {
    resp = await fetch("https://api.openai.com/v1/images/generations", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "gpt-image-1",
        prompt: opts.prompt,
        size: "1024x1024",
        quality,
        n: 1,
      }),
    });
  }

  if (!resp.ok) {
    const text = await resp.text();
    if (resp.status === 429) return { ok: false, status: 429, error: "Rate limited by OpenAI. Try again shortly." };
    if (resp.status === 402) return { ok: false, status: 402, error: "OpenAI credits exhausted. Top up billing." };
    return { ok: false, status: resp.status, error: `OpenAI error: ${text.slice(0, 300)}` };
  }

  const data = await resp.json();
  const b64: string | undefined = data?.data?.[0]?.b64_json;
  if (!b64) return { ok: false, error: "Model did not return an image" };
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return { ok: true, bytes, mime: "image/png" };
}

function extFromMime(mime: string): string {
  if (mime.includes("png")) return "png";
  if (mime.includes("jpeg") || mime.includes("jpg")) return "jpg";
  if (mime.includes("webp")) return "webp";
  return "png";
}

async function fetchImageAsDataUrl(url: string): Promise<{ ok: true; dataUrl: string } | { ok: false; error: string }> {
  try {
    const r = await fetch(url);
    if (!r.ok) return { ok: false, error: `Failed to fetch source image (${r.status})` };
    const mime = r.headers.get("content-type") ?? "image/png";
    const buf = new Uint8Array(await r.arrayBuffer());
    let bin = "";
    for (let i = 0; i < buf.length; i++) bin += String.fromCharCode(buf[i]);
    return { ok: true, dataUrl: `data:${mime};base64,${btoa(bin)}` };
  } catch (e: any) {
    return { ok: false, error: `Error fetching image: ${e?.message ?? String(e)}` };
  }
}

// ── IMAGE TOOLS ──

mcp.tool("generate_image", {
  description: "Generate a bitmap image with AI (Nano Banana 2 by default, or 'pro' for Nano Banana Pro). Saves to the MCP creator's folder in marketing-assets and returns a public URL + asset_key. Use attach_image_to_route or attach_image_to_poi to wire it into content.",
  inputSchema: {
    type: "object" as const,
    properties: {
      prompt: { type: "string" as const, description: "Detailed description of the image to generate" },
      quality: { type: "string" as const, description: "'fast' (default, Nano Banana 2) | 'pro' (Nano Banana Pro, slower & costlier, best for hero/cover)" },
      filename_hint: { type: "string" as const, description: "Optional short slug used in the file name (e.g. 'tatry-cover'). Spaces/special chars are stripped." },
    },
    required: ["prompt"],
  },
  handler: async (params: any) => {
    const userId = getCreatorUserId();
    if (!userId) return jsonContent({ error: "MCP_CREATOR_USER_ID not configured" });
    const sb = getSupabase();
    const result = await callImageModel({ prompt: params.prompt, quality: params.quality });
    if (!result.ok) return jsonContent({ error: result.error, status: result.status });
    const slug = String(params.filename_hint ?? "img").toLowerCase().replace(/[^a-z0-9-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40) || "img";
    const ext = extFromMime(result.mime);
    const key = `${userId}/${Date.now()}-${slug}.${ext}`;
    const { error: upErr } = await sb.storage.from("marketing-assets").upload(key, result.bytes, { contentType: result.mime, upsert: false });
    if (upErr) return jsonContent({ error: `Upload failed: ${upErr.message}` });
    const publicUrl = sb.storage.from("marketing-assets").getPublicUrl(key).data.publicUrl;
    return jsonContent({
      success: true,
      asset_key: key,
      asset_bucket: "marketing-assets",
      asset_url: publicUrl,
      mime_type: result.mime,
      size_bytes: result.bytes.byteLength,
      model: pickImageModel(params.quality),
      next_steps: "Call attach_image_to_route({ route_id, asset_key, role: 'cover' | 'gallery' }) or attach_image_to_poi({ poi_id, asset_key }).",
    });
  },
});

mcp.tool("edit_image", {
  description: "Edit an existing bitmap image with AI. Provide a source image URL (must be publicly fetchable, e.g. from generate_image or any public route cover). Saves the edited result to marketing-assets and returns its URL + asset_key.",
  inputSchema: {
    type: "object" as const,
    properties: {
      source_url: { type: "string" as const, description: "Public URL of the source image" },
      prompt: { type: "string" as const, description: "Editing instruction (e.g. 'add dramatic golden hour light, keep composition')" },
      quality: { type: "string" as const, description: "'fast' (default) | 'pro'" },
      filename_hint: { type: "string" as const, description: "Optional file-name slug" },
    },
    required: ["source_url", "prompt"],
  },
  handler: async (params: any) => {
    const userId = getCreatorUserId();
    if (!userId) return jsonContent({ error: "MCP_CREATOR_USER_ID not configured" });
    const sb = getSupabase();
    const fetched = await fetchImageAsDataUrl(params.source_url);
    if (!fetched.ok) return jsonContent({ error: fetched.error });
    const result = await callImageModel({ prompt: params.prompt, quality: params.quality, imageDataUrl: fetched.dataUrl });
    if (!result.ok) return jsonContent({ error: result.error, status: result.status });
    const slug = String(params.filename_hint ?? "edit").toLowerCase().replace(/[^a-z0-9-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40) || "edit";
    const ext = extFromMime(result.mime);
    const key = `${userId}/${Date.now()}-${slug}.${ext}`;
    const { error: upErr } = await sb.storage.from("marketing-assets").upload(key, result.bytes, { contentType: result.mime, upsert: false });
    if (upErr) return jsonContent({ error: `Upload failed: ${upErr.message}` });
    const publicUrl = sb.storage.from("marketing-assets").getPublicUrl(key).data.publicUrl;
    return jsonContent({
      success: true,
      asset_key: key,
      asset_bucket: "marketing-assets",
      asset_url: publicUrl,
      mime_type: result.mime,
      model: pickImageModel(params.quality),
    });
  },
});

async function copyAssetToBucket(
  sb: ReturnType<typeof getSupabase>,
  sourceBucket: string,
  sourceKey: string,
  targetBucket: string,
  targetKey: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { data, error } = await sb.storage.from(sourceBucket).download(sourceKey);
  if (error || !data) return { ok: false, error: `Cannot read source asset: ${error?.message ?? "unknown"}` };
  const buf = new Uint8Array(await data.arrayBuffer());
  const mime = data.type || "image/png";
  const { error: upErr } = await sb.storage.from(targetBucket).upload(targetKey, buf, { contentType: mime, upsert: false });
  if (upErr) return { ok: false, error: `Upload to ${targetBucket} failed: ${upErr.message}` };
  return { ok: true };
}

mcp.tool("attach_image_to_route", {
  description: "Attach an image previously generated/uploaded to marketing-assets to a route owned by the MCP creator. Copies it into route-covers and either sets it as the cover (role='cover') or appends it to the gallery (role='gallery').",
  inputSchema: {
    type: "object" as const,
    properties: {
      route_id: { type: "number" as const, description: "Route ID" },
      asset_key: { type: "string" as const, description: "Key returned by generate_image / edit_image (path inside marketing-assets bucket)" },
      role: { type: "string" as const, description: "'cover' (replace cover_image_key) | 'gallery' (append to route_images). Default: cover" },
    },
    required: ["route_id", "asset_key"],
  },
  handler: async (params: any) => {
    const userId = getCreatorUserId();
    if (!userId) return jsonContent({ error: "MCP_CREATOR_USER_ID not configured" });
    const sb = getSupabase();
    const { data: route } = await sb.from("routes").select("id, user_id").eq("id", params.route_id).eq("user_id", userId).maybeSingle();
    if (!route) return jsonContent({ error: "Route not found or not owned by MCP creator" });

    const role = params.role === "gallery" ? "gallery" : "cover";
    const ext = (params.asset_key.split(".").pop() || "png").toLowerCase();
    const targetKey = `${userId}/${Date.now()}-route-${params.route_id}-${role}.${ext}`;
    const copy = await copyAssetToBucket(sb, "marketing-assets", params.asset_key, "route-covers", targetKey);
    if (!copy.ok) return jsonContent({ error: copy.error });
    const publicUrl = sb.storage.from("route-covers").getPublicUrl(targetKey).data.publicUrl;

    if (role === "cover") {
      const { error } = await sb.from("routes").update({ cover_image_key: targetKey }).eq("id", params.route_id).eq("user_id", userId);
      if (error) return jsonContent({ error: `Update cover failed: ${error.message}` });
      return jsonContent({ success: true, role, route_id: params.route_id, image_key: targetKey, image_url: publicUrl });
    }

    const { data: existing } = await sb.from("route_images").select("sort_order").eq("route_id", params.route_id).order("sort_order", { ascending: false }).limit(1);
    const nextOrder = ((existing?.[0]?.sort_order as number | undefined) ?? -1) + 1;
    const { data: row, error } = await sb.from("route_images").insert({
      route_id: params.route_id,
      image_key: targetKey,
      sort_order: nextOrder,
    }).select("id, sort_order").single();
    if (error) return jsonContent({ error: `Insert into route_images failed: ${error.message}` });
    return jsonContent({ success: true, role, route_id: params.route_id, image_key: targetKey, image_url: publicUrl, route_image: row });
  },
});

mcp.tool("attach_image_to_poi", {
  description: "Attach an image previously generated/uploaded to marketing-assets to a POI of a route owned by the MCP creator. Copies it into poi-images and appends the new key to the POI's photo_keys array.",
  inputSchema: {
    type: "object" as const,
    properties: {
      poi_id: { type: "string" as const, description: "POI UUID (from list_route_pois → returned via add_route_poi or DB lookup)" },
      asset_key: { type: "string" as const, description: "Key returned by generate_image / edit_image (path inside marketing-assets bucket)" },
    },
    required: ["poi_id", "asset_key"],
  },
  handler: async (params: any) => {
    const userId = getCreatorUserId();
    if (!userId) return jsonContent({ error: "MCP_CREATOR_USER_ID not configured" });
    const sb = getSupabase();
    const { data: poi, error: poiErr } = await sb.from("route_pois").select("id, route_id, photo_keys, routes!inner(user_id)").eq("id", params.poi_id).maybeSingle();
    if (poiErr) return jsonContent({ error: poiErr.message });
    if (!poi) return jsonContent({ error: "POI not found" });
    if ((poi as any).routes?.user_id !== userId) return jsonContent({ error: "POI does not belong to a route owned by MCP creator" });

    const ext = (params.asset_key.split(".").pop() || "png").toLowerCase();
    const targetKey = `${userId}/${Date.now()}-poi-${params.poi_id}.${ext}`;
    const copy = await copyAssetToBucket(sb, "marketing-assets", params.asset_key, "poi-images", targetKey);
    if (!copy.ok) return jsonContent({ error: copy.error });
    const publicUrl = sb.storage.from("poi-images").getPublicUrl(targetKey).data.publicUrl;

    const current = Array.isArray(poi.photo_keys) ? poi.photo_keys as string[] : [];
    const nextKeys = [...current, targetKey];
    const { error } = await sb.from("route_pois").update({ photo_keys: nextKeys }).eq("id", params.poi_id);
    if (error) return jsonContent({ error: `Update POI failed: ${error.message}` });

    return jsonContent({ success: true, poi_id: params.poi_id, image_key: targetKey, image_url: publicUrl, total_photos: nextKeys.length });
  },
});

function simplifyTrackPoints(points: Array<{ lat: number; lng: number; ele?: number }>, maxPoints = 25) {
  if (!points.length) return [];
  if (points.length <= maxPoints) return points.map((p) => [p.lat, p.lng]);
  const step = Math.max(1, Math.floor(points.length / maxPoints));
  const out: Array<[number, number]> = [];
  for (let i = 0; i < points.length; i += step) out.push([points[i].lat, points[i].lng]);
  const last = points[points.length - 1];
  const currentLast = out[out.length - 1];
  if (!currentLast || currentLast[0] !== last.lat || currentLast[1] !== last.lng) out.push([last.lat, last.lng]);
  return out;
}

function parseGpxXml(xml: string): { points: Array<{ lat: number; lng: number; ele?: number }>; distanceKm: number } {
  const points: Array<{ lat: number; lng: number; ele?: number }> = [];
  const ptRe = /<trkpt\s+[^>]*lat="([\-0-9.]+)"\s+lon="([\-0-9.]+)"[^>]*>([\s\S]*?)<\/trkpt>|<trkpt\s+[^>]*lat="([\-0-9.]+)"\s+lon="([\-0-9.]+)"[^>]*\/>/g;
  let m: RegExpExecArray | null;
  while ((m = ptRe.exec(xml)) !== null) {
    const lat = parseFloat(m[1] ?? m[4]);
    const lng = parseFloat(m[2] ?? m[5]);
    const inner = m[3] ?? "";
    const eleMatch = inner.match(/<ele>([\-0-9.]+)<\/ele>/);
    const ele = eleMatch ? parseFloat(eleMatch[1]) : undefined;
    if (!isNaN(lat) && !isNaN(lng)) points.push({ lat, lng, ele });
  }
  // Haversine total distance
  let dist = 0;
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1], b = points[i];
    const R = 6371;
    const dLat = (b.lat - a.lat) * Math.PI / 180;
    const dLng = (b.lng - a.lng) * Math.PI / 180;
    const lat1 = a.lat * Math.PI / 180, lat2 = b.lat * Math.PI / 180;
    const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
    dist += 2 * R * Math.asin(Math.sqrt(h));
  }
  return { points, distanceKm: dist };
}

mcp.tool("attach_gpx_to_route", {
  description: "Attach a GPX track to a route owned by the MCP creator. Provide either gpx_xml (raw XML content) OR gpx_url (publicly fetchable URL). Uploads to gpx-files bucket, sets gpx_file_key, and refreshes preview_track. Optionally updates distance_km if not already set.",
  inputSchema: {
    type: "object" as const,
    properties: {
      route_id: { type: "number" as const, description: "Route ID" },
      gpx_xml: { type: "string" as const, description: "Raw GPX XML content (preferred)" },
      gpx_url: { type: "string" as const, description: "Public URL to download GPX from (alternative to gpx_xml)" },
      update_distance: { type: "boolean" as const, description: "If true, overwrite distance_km from GPX even if already set. Default: only fill when null." },
    },
    required: ["route_id"],
  },
  handler: async (params: any) => {
    const userId = getCreatorUserId();
    if (!userId) return jsonContent({ error: "MCP_CREATOR_USER_ID not configured" });
    const sb = getSupabase();

    const { data: route } = await sb.from("routes").select("id, user_id, distance_km").eq("id", params.route_id).eq("user_id", userId).maybeSingle();
    if (!route) return jsonContent({ error: "Route not found or not owned by MCP creator" });

    let xml: string | null = params.gpx_xml ?? null;
    if (!xml && params.gpx_url) {
      try {
        const r = await fetch(params.gpx_url);
        if (!r.ok) return jsonContent({ error: `Failed to fetch gpx_url: HTTP ${r.status}` });
        xml = await r.text();
      } catch (e: any) {
        return jsonContent({ error: `Fetch error: ${e?.message ?? "unknown"}` });
      }
    }
    if (!xml) return jsonContent({ error: "Provide either gpx_xml or gpx_url" });
    if (!xml.includes("<gpx")) return jsonContent({ error: "Content does not look like a GPX file" });

    const parsed = parseGpxXml(xml);
    if (parsed.points.length < 2) return jsonContent({ error: "GPX has fewer than 2 trackpoints" });

    const targetKey = `${userId}/${Date.now()}-route-${params.route_id}.gpx`;
    const { error: upErr } = await sb.storage.from("gpx-files").upload(targetKey, new TextEncoder().encode(xml), {
      contentType: "application/gpx+xml",
      upsert: false,
    });
    if (upErr) return jsonContent({ error: `Upload to gpx-files failed: ${upErr.message}` });

    const updates: Record<string, any> = {
      gpx_file_key: targetKey,
      preview_track: simplifyTrackPoints(parsed.points, 25),
    };
    const shouldSetDistance = params.update_distance === true || route.distance_km == null;
    if (shouldSetDistance && parsed.distanceKm > 0) {
      updates.distance_km = Math.round(parsed.distanceKm * 100) / 100;
    }

    const { error: updErr } = await sb.from("routes").update(updates).eq("id", params.route_id).eq("user_id", userId);
    if (updErr) return jsonContent({ error: `Update route failed: ${updErr.message}` });

    return jsonContent({
      success: true,
      route_id: params.route_id,
      gpx_file_key: targetKey,
      points_total: parsed.points.length,
      preview_points: (updates.preview_track as any[]).length,
      distance_km: updates.distance_km ?? route.distance_km,
      distance_updated: shouldSetDistance && parsed.distanceKm > 0,
    });
  },
});

// ── Transport ──

const transport = new StreamableHttpTransport();
const httpHandler = transport.bind(mcp);

mcpApp.get("/", (c) => {
  return c.json({ message: "RouteMarket MCP Server", version: "2.4.1", tools: 26 });
});

mcpApp.get("/whoami", (c) => {
  const denied = authGuard(c.req.raw);
  if (denied) return denied;
  const raw = Deno.env.get("MCP_CREATOR_USER_ID") ?? "";
  const uuidRe = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  return c.json({
    configured: raw.length > 0,
    is_uuid: uuidRe.test(raw),
    length: raw.length,
    prefix: raw.slice(0, 4),
    suffix: raw.slice(-4),
  });
});

mcpApp.all("/mcp", async (c) => {
  const denied = authGuard(c.req.raw);
  if (denied) return denied;
  return await httpHandler(c.req.raw);
});

app.route("/mcp-server", mcpApp);

Deno.serve(app.fetch);
