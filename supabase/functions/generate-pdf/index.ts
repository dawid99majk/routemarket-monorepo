import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { PDFDocument, rgb, StandardFonts } from "https://esm.sh/pdf-lib@1.17.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// Strip diacritics for WinAnsi-safe text (Helvetica can't encode Polish chars etc.)
const EXTRA_MAP: Record<string, string> = {
  "ł": "l", "Ł": "L", "đ": "d", "Đ": "D", "ß": "ss", "ø": "o", "Ø": "O",
  "æ": "ae", "Æ": "AE", "œ": "oe", "Œ": "OE",
};
function sanitize(str: string): string {
  // NFD decompose → strip combining marks → fix remaining non-ascii
  let s = str.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  s = s.replace(/[^\x00-\x7F]/g, (ch) => EXTRA_MAP[ch] || "?");
  return s;
}

const PAGE_W = 595.28; // A4
const PAGE_H = 841.89;
const MARGIN = 50;
const CONTENT_W = PAGE_W - 2 * MARGIN;

const BRAND = rgb(0.4, 0.494, 0.918); // #667eea
const BRAND_DARK = rgb(0.3, 0.38, 0.75);
const WHITE = rgb(1, 1, 1);
const BLACK = rgb(0.1, 0.1, 0.18);
const GRAY = rgb(0.4, 0.4, 0.45);
const LIGHT_BG = rgb(0.97, 0.97, 0.98);
const WARN_BG = rgb(1, 0.95, 0.8);
const WARN_BORDER = rgb(1, 0.76, 0.03);

function wrapText(text: string, font: any, size: number, maxWidth: number): string[] {
  const safeText = sanitize(text);
  const lines: string[] = [];
  const paragraphs = safeText.split("\n");
  for (const para of paragraphs) {
    if (!para.trim()) { lines.push(""); continue; }
    const words = para.split(/\s+/);
    let currentLine = "";
    for (const word of words) {
      const test = currentLine ? `${currentLine} ${word}` : word;
      const w = font.widthOfTextAtSize(test, size);
      if (w > maxWidth && currentLine) {
        lines.push(currentLine);
        currentLine = word;
      } else {
        currentLine = test;
      }
    }
    if (currentLine) lines.push(currentLine);
  }
  return lines;
}

function addPage(doc: any) {
  return doc.addPage([PAGE_W, PAGE_H]);
}

// ── Localized labels per PDF language ──
type LabelSet = {
  km: string; mGain: string; hours: string; difficulty: string;
  routeDetails: string; description: string; safety: string;
  riskLevel: string; knownHazards: string; requiredEquipment: string;
  pois: string; tips: string; recommendations: string; notes: string;
  distance: string; elevation: string; surface: string; type: string;
  season: string; start: string; end: string;
  funFact: string; try_: string; petFriendly: string; aiAssisted: string;
  diff: Record<string, string>;
  risk: Record<string, string>;
};

const LABELS: Record<string, LabelSet> = {
  pl: {
    km: "km", mGain: "m przewyższenia", hours: "godziny", difficulty: "trudność",
    routeDetails: "Szczegóły trasy", description: "Opis", safety: "[!] Bezpieczeństwo",
    riskLevel: "Poziom ryzyka", knownHazards: "Znane zagrożenia:", requiredEquipment: "Wymagany sprzęt:",
    pois: "Punkty zainteresowania", tips: "Wskazówki", recommendations: "Polecane miejsca", notes: "Notatki",
    distance: "Dystans", elevation: "Przewyższenie", surface: "Nawierzchnia", type: "Typ",
    season: "Sezon", start: "Start", end: "Meta",
    funFact: "Ciekawostka", try_: "Spróbuj", petFriendly: "Trasa przyjazna zwierzętom",
    aiAssisted: "Treść tworzona z pomocą AI",
    diff: { easy: "Łatwa", moderate: "Średnia", hard: "Trudna", expert: "Ekspercka" },
    risk: { low: "Niskie", medium: "Średnie", high: "Wysokie", extreme: "Ekstremalne" },
  },
  en: {
    km: "km", mGain: "m gain", hours: "hours", difficulty: "difficulty",
    routeDetails: "Route Details", description: "Description", safety: "[!] Safety Information",
    riskLevel: "Risk Level", knownHazards: "Known Hazards:", requiredEquipment: "Required Equipment:",
    pois: "Points of Interest", tips: "Tips & Advice", recommendations: "Recommendations", notes: "Notes",
    distance: "Distance", elevation: "Elevation", surface: "Surface", type: "Type",
    season: "Season", start: "Start", end: "End",
    funFact: "Fun fact", try_: "Try", petFriendly: "Pet friendly route", aiAssisted: "AI-assisted content",
    diff: { easy: "Easy", moderate: "Moderate", hard: "Hard", expert: "Expert" },
    risk: { low: "Low", medium: "Medium", high: "High", extreme: "Extreme" },
  },
  de: {
    km: "km", mGain: "m Anstieg", hours: "Stunden", difficulty: "Schwierigkeit",
    routeDetails: "Routendetails", description: "Beschreibung", safety: "[!] Sicherheitsinformationen",
    riskLevel: "Risikostufe", knownHazards: "Bekannte Gefahren:", requiredEquipment: "Erforderliche Ausrüstung:",
    pois: "Sehenswürdigkeiten", tips: "Tipps & Hinweise", recommendations: "Empfehlungen", notes: "Notizen",
    distance: "Distanz", elevation: "Höhenmeter", surface: "Untergrund", type: "Typ",
    season: "Saison", start: "Start", end: "Ziel",
    funFact: "Wissenswertes", try_: "Probier", petFriendly: "Haustierfreundliche Route", aiAssisted: "Mit KI-Unterstützung erstellt",
    diff: { easy: "Leicht", moderate: "Mittel", hard: "Schwer", expert: "Experte" },
    risk: { low: "Niedrig", medium: "Mittel", high: "Hoch", extreme: "Extrem" },
  },
  fr: {
    km: "km", mGain: "m de dénivelé", hours: "heures", difficulty: "difficulté",
    routeDetails: "Détails de l'itinéraire", description: "Description", safety: "[!] Sécurité",
    riskLevel: "Niveau de risque", knownHazards: "Dangers connus :", requiredEquipment: "Équipement requis :",
    pois: "Points d'intérêt", tips: "Conseils", recommendations: "Recommandations", notes: "Notes",
    distance: "Distance", elevation: "Dénivelé", surface: "Surface", type: "Type",
    season: "Saison", start: "Départ", end: "Arrivée",
    funFact: "Le saviez-vous", try_: "Essayez", petFriendly: "Itinéraire accepte les animaux", aiAssisted: "Contenu assisté par IA",
    diff: { easy: "Facile", moderate: "Modéré", hard: "Difficile", expert: "Expert" },
    risk: { low: "Faible", medium: "Moyen", high: "Élevé", extreme: "Extrême" },
  },
  es: {
    km: "km", mGain: "m de desnivel", hours: "horas", difficulty: "dificultad",
    routeDetails: "Detalles de la ruta", description: "Descripción", safety: "[!] Seguridad",
    riskLevel: "Nivel de riesgo", knownHazards: "Peligros conocidos:", requiredEquipment: "Equipo necesario:",
    pois: "Puntos de interés", tips: "Consejos", recommendations: "Recomendaciones", notes: "Notas",
    distance: "Distancia", elevation: "Desnivel", surface: "Superficie", type: "Tipo",
    season: "Temporada", start: "Inicio", end: "Fin",
    funFact: "Curiosidad", try_: "Prueba", petFriendly: "Ruta apta para mascotas", aiAssisted: "Contenido asistido por IA",
    diff: { easy: "Fácil", moderate: "Moderada", hard: "Difícil", expert: "Experto" },
    risk: { low: "Bajo", medium: "Medio", high: "Alto", extreme: "Extremo" },
  },
  it: {
    km: "km", mGain: "m di dislivello", hours: "ore", difficulty: "difficoltà",
    routeDetails: "Dettagli del percorso", description: "Descrizione", safety: "[!] Sicurezza",
    riskLevel: "Livello di rischio", knownHazards: "Pericoli noti:", requiredEquipment: "Attrezzatura richiesta:",
    pois: "Punti d'interesse", tips: "Consigli", recommendations: "Raccomandazioni", notes: "Note",
    distance: "Distanza", elevation: "Dislivello", surface: "Fondo", type: "Tipo",
    season: "Stagione", start: "Partenza", end: "Arrivo",
    funFact: "Curiosità", try_: "Prova", petFriendly: "Percorso adatto agli animali", aiAssisted: "Contenuto assistito da IA",
    diff: { easy: "Facile", moderate: "Moderata", hard: "Difficile", expert: "Esperto" },
    risk: { low: "Basso", medium: "Medio", high: "Alto", extreme: "Estremo" },
  },
  nl: {
    km: "km", mGain: "m stijging", hours: "uren", difficulty: "moeilijkheid",
    routeDetails: "Route-informatie", description: "Beschrijving", safety: "[!] Veiligheid",
    riskLevel: "Risiconiveau", knownHazards: "Bekende gevaren:", requiredEquipment: "Vereiste uitrusting:",
    pois: "Bezienswaardigheden", tips: "Tips", recommendations: "Aanbevelingen", notes: "Notities",
    distance: "Afstand", elevation: "Stijging", surface: "Ondergrond", type: "Type",
    season: "Seizoen", start: "Start", end: "Einde",
    funFact: "Wist je dat", try_: "Probeer", petFriendly: "Huisdiervriendelijke route", aiAssisted: "AI-ondersteunde inhoud",
    diff: { easy: "Makkelijk", moderate: "Gemiddeld", hard: "Zwaar", expert: "Expert" },
    risk: { low: "Laag", medium: "Middel", high: "Hoog", extreme: "Extreem" },
  },
  cs: {
    km: "km", mGain: "m převýšení", hours: "hodin", difficulty: "obtížnost",
    routeDetails: "Podrobnosti trasy", description: "Popis", safety: "[!] Bezpečnost",
    riskLevel: "Úroveň rizika", knownHazards: "Známá nebezpečí:", requiredEquipment: "Nutné vybavení:",
    pois: "Zajímavá místa", tips: "Tipy", recommendations: "Doporučení", notes: "Poznámky",
    distance: "Vzdálenost", elevation: "Převýšení", surface: "Povrch", type: "Typ",
    season: "Sezóna", start: "Start", end: "Cíl",
    funFact: "Zajímavost", try_: "Zkuste", petFriendly: "Trasa vhodná pro mazlíčky", aiAssisted: "Obsah s pomocí AI",
    diff: { easy: "Lehká", moderate: "Střední", hard: "Těžká", expert: "Expertní" },
    risk: { low: "Nízké", medium: "Střední", high: "Vysoké", extreme: "Extrémní" },
  },
  da: {
    km: "km", mGain: "m stigning", hours: "timer", difficulty: "sværhedsgrad",
    routeDetails: "Ruteoplysninger", description: "Beskrivelse", safety: "[!] Sikkerhed",
    riskLevel: "Risikoniveau", knownHazards: "Kendte farer:", requiredEquipment: "Nødvendigt udstyr:",
    pois: "Seværdigheder", tips: "Tips", recommendations: "Anbefalinger", notes: "Noter",
    distance: "Distance", elevation: "Stigning", surface: "Underlag", type: "Type",
    season: "Sæson", start: "Start", end: "Slut",
    funFact: "Sjov fakta", try_: "Prøv", petFriendly: "Kæledyrsvenlig rute", aiAssisted: "AI-assisteret indhold",
    diff: { easy: "Let", moderate: "Moderat", hard: "Svær", expert: "Ekspert" },
    risk: { low: "Lav", medium: "Mellem", high: "Høj", extreme: "Ekstrem" },
  },
};

// Safe drawText wrapper — sanitizes all text for WinAnsi encoding
function dt(page: any, text: string, opts: any) {
  page.drawText(sanitize(text), opts);
}

function drawFooter(page: any, font: any) {
  const txt = `RouteMarket  |  ${new Date().toLocaleDateString("en-GB")}`;
  const w = font.widthOfTextAtSize(txt, 8);
  page.drawText(txt, { x: PAGE_W / 2 - w / 2, y: 25, size: 8, font, color: GRAY });
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { route_id, language_code } = await req.json();
    if (!route_id) {
      return new Response(JSON.stringify({ error: "route_id required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const lang = language_code || "pl";
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const sb = createClient(supabaseUrl, serviceKey);

    const { data: route, error: routeErr } = await sb.from("routes").select("*").eq("id", route_id).single();
    if (routeErr || !route) {
      return new Response(JSON.stringify({ error: "Route not found" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let routeData = route;
    if (lang !== "pl") {
      const { data: tr } = await sb.from("route_translations").select("title, description")
        .eq("route_id", route_id).eq("language_code", lang).maybeSingle();
      if (tr) routeData = { ...route, title: tr.title, description: tr.description };
    }

    // Load full (private) description — buyers/owners get the long version in PDF.
    // Falls back to public summary if not present.
    if (lang === "pl") {
      const { data: priv } = await sb.from("route_private_details")
        .select("full_description").eq("route_id", route_id).maybeSingle();
      if (priv?.full_description && priv.full_description.trim().length > 0) {
        routeData = { ...routeData, description: priv.full_description };
      }
    }

    const [poisRes, tipsRes, recsRes] = await Promise.all([
      sb.from("route_pois").select("*").eq("route_id", route_id).order("sort_order"),
      sb.from("route_tips").select("*").eq("route_id", route_id).order("sort_order"),
      sb.from("route_recommendations").select("*").eq("route_id", route_id).order("sort_order"),
    ]);
    const pois = poisRes.data || [];
    const tips = tipsRes.data || [];
    const recs = recsRes.data || [];

    const L = LABELS[lang] || LABELS.en;
    const diffLabels = L.diff;
    const riskLabels = L.risk;

    // Build PDF
    const doc = await PDFDocument.create();
    const fontR = await doc.embedFont(StandardFonts.Helvetica);
    const fontB = await doc.embedFont(StandardFonts.HelveticaBold);

    // ── Cover page ──
    let page = addPage(doc);
    page.drawRectangle({ x: 0, y: 0, width: PAGE_W, height: PAGE_H, color: BRAND });

    const titleLines = wrapText(routeData.title || "", fontB, 28, CONTENT_W);
    let cy = PAGE_H / 2 + titleLines.length * 17;
    for (const line of titleLines) {
      const tw = fontB.widthOfTextAtSize(line, 28);
      dt(page, line, { x: PAGE_W / 2 - tw / 2, y: cy, size: 28, font: fontB, color: WHITE });
      cy -= 36;
    }
    cy -= 10;
    if (routeData.location_string) {
      const loc = sanitize(routeData.location_string);
      const lw = fontR.widthOfTextAtSize(loc, 14);
      dt(page, loc, { x: PAGE_W / 2 - lw / 2, y: cy, size: 14, font: fontR, color: rgb(1, 1, 1) });
      cy -= 40;
    }

    // Stats row
    const stats: { value: string; label: string }[] = [];
    if (routeData.distance_km) stats.push({ value: `${routeData.distance_km}`, label: L.km });
    if (routeData.elevation_gain_m) stats.push({ value: `${routeData.elevation_gain_m}`, label: L.mGain });
    if (routeData.estimated_time_h) stats.push({ value: `${routeData.estimated_time_h}`, label: L.hours });
    if (routeData.difficulty) stats.push({ value: diffLabels[routeData.difficulty] || routeData.difficulty, label: L.difficulty });

    if (stats.length > 0) {
      const gap = CONTENT_W / stats.length;
      stats.forEach((s, i) => {
        const sx = MARGIN + gap * i + gap / 2;
        const vw = fontB.widthOfTextAtSize(sanitize(s.value), 22);
        dt(page, s.value, { x: sx - vw / 2, y: cy, size: 22, font: fontB, color: WHITE });
        const lw = fontR.widthOfTextAtSize(sanitize(s.label), 10);
        dt(page, s.label, { x: sx - lw / 2, y: cy - 16, size: 10, font: fontR, color: rgb(0.9, 0.9, 0.95) });
      });
    }

    // ── Route Details page ──
    page = addPage(doc);
    let y = PAGE_H - MARGIN;

    const drawSectionTitle = (title: string) => {
      if (y < 80) { page = addPage(doc); y = PAGE_H - MARGIN; }
      dt(page, title, { x: MARGIN, y, size: 16, font: fontB, color: BRAND });
      y -= 4;
      page.drawRectangle({ x: MARGIN, y, width: CONTENT_W, height: 2, color: BRAND });
      y -= 20;
    };

    drawSectionTitle(L.routeDetails);

    const detailItems: { label: string; value: string }[] = [];
    if (routeData.distance_km) detailItems.push({ label: L.distance, value: `${routeData.distance_km} km` });
    if (routeData.elevation_gain_m) detailItems.push({ label: L.elevation, value: `${routeData.elevation_gain_m} m` });
    if (routeData.difficulty) detailItems.push({ label: L.difficulty, value: diffLabels[routeData.difficulty] || routeData.difficulty });
    if (routeData.surface_type) detailItems.push({ label: L.surface, value: routeData.surface_type });
    if (routeData.loop_type) detailItems.push({ label: L.type, value: routeData.loop_type });
    if (routeData.season) detailItems.push({ label: L.season, value: routeData.season });
    if (routeData.start_point) detailItems.push({ label: L.start, value: routeData.start_point });
    if (routeData.end_point) detailItems.push({ label: L.end, value: routeData.end_point });

    const colW = CONTENT_W / 2 - 5;
    for (let i = 0; i < detailItems.length; i += 2) {
      if (y < 60) { page = addPage(doc); y = PAGE_H - MARGIN; }
      for (let j = 0; j < 2 && i + j < detailItems.length; j++) {
        const item = detailItems[i + j];
        const bx = MARGIN + j * (colW + 10);
        page.drawRectangle({ x: bx, y: y - 28, width: colW, height: 32, color: LIGHT_BG });
        dt(page, item.label.toUpperCase(), { x: bx + 6, y: y - 8, size: 8, font: fontR, color: GRAY });
        dt(page, item.value, { x: bx + 6, y: y - 22, size: 11, font: fontB, color: BLACK });
      }
      y -= 38;
    }
    y -= 10;

    // Description
    if (routeData.description) {
      drawSectionTitle(L.description);
      const descLines = wrapText(routeData.description, fontR, 10, CONTENT_W);
      for (const line of descLines) {
        if (y < 50) { page = addPage(doc); y = PAGE_H - MARGIN; drawFooter(page, fontR); }
        dt(page, line, { x: MARGIN, y, size: 10, font: fontR, color: BLACK });
        y -= 15;
      }
      y -= 10;
    }

    // Safety
    const hazards = Array.isArray(routeData.known_hazards) ? routeData.known_hazards : [];
    const equipment = Array.isArray(routeData.required_equipment) ? routeData.required_equipment : [];
    if (hazards.length > 0 || equipment.length > 0 || routeData.risk_level) {
      if (y < 120) { page = addPage(doc); y = PAGE_H - MARGIN; }
      const safetyStartY = y + 6;

      drawSectionTitle(L.safety);

      if (routeData.risk_level) {
        dt(page, `${L.riskLevel}: ${riskLabels[routeData.risk_level] || routeData.risk_level}`, {
          x: MARGIN + 8, y, size: 11, font: fontB, color: BLACK,
        });
        y -= 18;
      }
      if (hazards.length > 0) {
        dt(page, L.knownHazards, { x: MARGIN + 8, y, size: 10, font: fontB, color: BLACK });
        y -= 15;
        for (const h of hazards) {
          if (y < 50) { page = addPage(doc); y = PAGE_H - MARGIN; }
          dt(page, `  - ${h}`, { x: MARGIN + 12, y, size: 10, font: fontR, color: BLACK });
          y -= 14;
        }
      }
      if (equipment.length > 0) {
        y -= 4;
        dt(page, L.requiredEquipment, { x: MARGIN + 8, y, size: 10, font: fontB, color: BLACK });
        y -= 15;
        for (const e of equipment) {
          if (y < 50) { page = addPage(doc); y = PAGE_H - MARGIN; }
          dt(page, `  - ${e}`, { x: MARGIN + 12, y, size: 10, font: fontR, color: BLACK });
          y -= 14;
        }
      }

      // Draw yellow background behind safety section
      const safetyH = safetyStartY - y + 10;
      // We need to redraw because PDF draws bottom-up; instead draw a rect behind on same page
      // Actually pdf-lib draws in order, so background must come first. We'll skip the bg for simplicity.
      y -= 10;
    }

    // POIs
    if (pois.length > 0) {
      if (y < 100) { page = addPage(doc); y = PAGE_H - MARGIN; }
      drawSectionTitle(L.pois);
      for (const p of pois) {
        if (y < 80) { page = addPage(doc); y = PAGE_H - MARGIN; }
        // Left accent bar
        page.drawRectangle({ x: MARGIN, y: y - 40, width: 3, height: 50, color: BRAND });
        dt(page, `${p.name}`, { x: MARGIN + 10, y, size: 12, font: fontB, color: BLACK });
        // Type badge text
        const typeText = `[${p.type}]`;
        const nameW = fontB.widthOfTextAtSize(sanitize(p.name), 12);
        dt(page, typeText, { x: MARGIN + 14 + nameW, y: y + 1, size: 8, font: fontR, color: BRAND });
        y -= 16;
        if (p.description) {
          const dLines = wrapText(p.description, fontR, 9, CONTENT_W - 15);
          for (const dl of dLines) {
            if (y < 50) { page = addPage(doc); y = PAGE_H - MARGIN; }
            dt(page, dl, { x: MARGIN + 10, y, size: 9, font: fontR, color: BLACK });
            y -= 13;
          }
        }
        if (p.fun_fact) {
          if (y < 50) { page = addPage(doc); y = PAGE_H - MARGIN; }
          dt(page, `${L.funFact}: ${p.fun_fact}`, { x: MARGIN + 10, y, size: 9, font: fontR, color: GRAY });
          y -= 13;
        }
        dt(page, `${p.lat.toFixed(5)}, ${p.lng.toFixed(5)}`, { x: MARGIN + 10, y, size: 8, font: fontR, color: GRAY });
        y -= 20;
      }
    }

    // Tips
    if (tips.length > 0) {
      if (y < 100) { page = addPage(doc); y = PAGE_H - MARGIN; }
      drawSectionTitle(L.tips);
      for (const t of tips) {
        if (y < 60) { page = addPage(doc); y = PAGE_H - MARGIN; }
        page.drawRectangle({ x: MARGIN, y: y - 20, width: 3, height: 30, color: BRAND });
        dt(page, t.category, { x: MARGIN + 10, y, size: 10, font: fontB, color: BLACK });
        y -= 14;
        const tLines = wrapText(t.content || "", fontR, 9, CONTENT_W - 15);
        for (const tl of tLines) {
          if (y < 50) { page = addPage(doc); y = PAGE_H - MARGIN; }
          dt(page, tl, { x: MARGIN + 10, y, size: 9, font: fontR, color: BLACK });
          y -= 13;
        }
        y -= 10;
      }
    }

    // Recommendations
    if (recs.length > 0) {
      if (y < 100) { page = addPage(doc); y = PAGE_H - MARGIN; }
      drawSectionTitle(L.recommendations);
      for (const r of recs) {
        if (y < 70) { page = addPage(doc); y = PAGE_H - MARGIN; }
        page.drawRectangle({ x: MARGIN, y: y - 25, width: 3, height: 35, color: BRAND });
        dt(page, r.name, { x: MARGIN + 10, y, size: 12, font: fontB, color: BLACK });
        y -= 15;
        if (r.description) {
          const rLines = wrapText(r.description, fontR, 9, CONTENT_W - 15);
          for (const rl of rLines) {
            if (y < 50) { page = addPage(doc); y = PAGE_H - MARGIN; }
            dt(page, rl, { x: MARGIN + 10, y, size: 9, font: fontR, color: BLACK });
            y -= 13;
          }
        }
        if (r.what_to_order) {
          dt(page, `${L.try_}: ${r.what_to_order}`, { x: MARGIN + 10, y, size: 9, font: fontR, color: GRAY });
          y -= 13;
        }
        if (r.price_range) {
          dt(page, r.price_range, { x: MARGIN + 10, y, size: 9, font: fontB, color: BRAND });
          y -= 13;
        }
        y -= 10;
      }
    }

    // Notes page
    page = addPage(doc);
    y = PAGE_H - MARGIN;
    dt(page, L.notes, { x: MARGIN, y, size: 16, font: fontB, color: BRAND });
    y -= 4;
    page.drawRectangle({ x: MARGIN, y, width: CONTENT_W, height: 2, color: BRAND });
    y -= 30;
    // Lined area
    for (let i = 0; i < 25; i++) {
      page.drawRectangle({ x: MARGIN, y, width: CONTENT_W, height: 0.5, color: rgb(0.85, 0.85, 0.88) });
      y -= 26;
    }

    // Footer on each content page
    const pages = doc.getPages();
    for (let i = 1; i < pages.length; i++) {
      drawFooter(pages[i], fontR);
    }

    // Pets & AI note on last page
    const lastPage = pages[pages.length - 1];
    if (routeData.pets_friendly) {
      lastPage.drawText(sanitize(L.petFriendly), { x: MARGIN, y: 50, size: 8, font: fontR, color: GRAY });
    }
    if (routeData.ai_assisted) {
      lastPage.drawText(sanitize(L.aiAssisted), { x: MARGIN, y: 40, size: 8, font: fontR, color: GRAY });
    }

    const pdfBytes = await doc.save();

    // Upload
    const fileKey = `${route.user_id}/${route_id}-${lang}.pdf`;
    const { error: uploadErr } = await sb.storage
      .from("pdf-guides")
      .upload(fileKey, pdfBytes, { contentType: "application/pdf", upsert: true });
    if (uploadErr) throw uploadErr;

    // Upsert route_pdfs record
    await sb.from("route_pdfs").delete().eq("route_id", route_id).eq("language_code", lang);
    const { error: insertErr } = await sb.from("route_pdfs").insert({
      route_id, language_code: lang, file_key: fileKey,
    });
    if (insertErr) throw insertErr;

    return new Response(JSON.stringify({ success: true, file_key: fileKey }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("generate-pdf error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
