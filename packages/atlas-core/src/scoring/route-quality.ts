import { Claim } from "../models/claim.js";
import { Evidence } from "../models/evidence.js";

export type RouteCategory =
  | "motorcycle"
  | "cycling"
  | "gravel"
  | "mtb"
  | "hiking"
  | "trekking"
  | "roadtrip"
  | "running"
  | "trail_running"
  | "city_walk"
  | "winter_sports"
  | "water_sports"
  | "city_break"  // legacy
  | "road_trip";  // legacy

export interface QualityScoreResult {
  score: number; // 0-100
  passedQualityGate: boolean; // >= 80
  hardBlockers: string[];
  warnings: string[];
  breakdown: {
    gpxScore: number;
    authorScore: number;
    externalSourceScore: number;
    reviewScore: number;
  };
}

const CATEGORY_WEIGHTS: Record<RouteCategory, { gpx: number; author: number; external: number; review: number }> = {
  motorcycle: { gpx: 35, author: 25, external: 20, review: 20 },
  cycling: { gpx: 35, author: 25, external: 20, review: 20 },
  gravel: { gpx: 35, author: 25, external: 20, review: 20 },
  mtb: { gpx: 35, author: 25, external: 20, review: 20 },
  hiking: { gpx: 35, author: 25, external: 20, review: 20 },
  trekking: { gpx: 35, author: 25, external: 20, review: 20 },
  roadtrip: { gpx: 30, author: 25, external: 25, review: 20 },
  running: { gpx: 35, author: 25, external: 20, review: 20 },
  trail_running: { gpx: 35, author: 25, external: 20, review: 20 },
  city_walk: { gpx: 15, author: 25, external: 35, review: 25 },
  winter_sports: { gpx: 25, author: 25, external: 25, review: 25 },
  water_sports: { gpx: 15, author: 25, external: 35, review: 25 },
  city_break: { gpx: 15, author: 25, external: 35, review: 25 }, // legacy
  road_trip: { gpx: 30, author: 25, external: 25, review: 20 }   // legacy
};

export interface RouteQualityInput {
  category: RouteCategory;
  hasGpx: boolean;
  evidence: Evidence[];
  claims: Claim[];
  curvatureScore?: number;
  surfaceDistribution?: Record<string, number>;
  elevationGainM?: number;
}


export function calculateRouteQuality(input: RouteQualityInput): QualityScoreResult {
  const { category, hasGpx, evidence, claims } = input;
  const weights = CATEGORY_WEIGHTS[category];
  
  const hardBlockers: string[] = [];
  const warnings: string[] = [];

  // GPX Score
  let gpxScore = 0;
  if (hasGpx) {
    gpxScore = weights.gpx;
  } else if (category !== "city_break") {
    hardBlockers.push("Brak pliku GPX w trasie opartej na śladzie (wymagane dla tej kategorii).");
  }

  // Author Materials Score (Images, notes, etc)
  let authorScore = 0;
  const ownEvidence = evidence.filter(e => e.licenseStatus === "own");
  if (ownEvidence.length > 0) {
    authorScore = weights.author;
    const ownImages = ownEvidence.filter(e => e.type === "image");
    if (ownImages.length === 0) {
      warnings.push("Brak autorskich zdjęć.");
      authorScore *= 0.8; // Reduce score if no images
    }
  } else {
    warnings.push("Brak autorskich materiałów jako dowodów.");
  }

  // External Sources Score
  let externalSourceScore = 0;
  const externalEvidence = evidence.filter(e => e.licenseStatus !== "own" && e.type !== "ai_suggestion");
  if (externalEvidence.length >= 3) {
    externalSourceScore = weights.external;
  } else if (externalEvidence.length > 0) {
    externalSourceScore = weights.external * (externalEvidence.length / 3);
    warnings.push("Mniej niż trzy zewnętrzne źródła użyte dla trasy.");
  } else {
    warnings.push("Brak zewnętrznych źródeł weryfikujących fakty.");
  }

  // License blocker check
  const hasInvalidLicenses = evidence.some(e => e.licenseStatus === "blocked" || e.licenseStatus === "unknown");
  if (hasInvalidLicenses) {
    hardBlockers.push("Brak licencji lub nieznana licencja dla dodanych materiałów (Evidence).");
  }

  // Review & Claims Score
  let reviewScore = 0;
  let unverifiedClaims = 0;
  let missingSourceClaims = 0;

  claims.forEach(claim => {
    if (claim.status === "missing_source") {
      missingSourceClaims++;
    } else if (claim.status === "needs_creator_review" || claim.status === "uncertain" || claim.status === "contradicted") {
      unverifiedClaims++;
    }
  });

  if (claims.length > 0) {
    if (missingSourceClaims > 0) {
      warnings.push(`${missingSourceClaims} faktów (claims) nie posiada powiązanego źródła (missing_source).`);
    }
    if (unverifiedClaims > 0) {
      warnings.push(`${unverifiedClaims} faktów wymaga weryfikacji przez człowieka.`);
    }

    const badClaims = missingSourceClaims + unverifiedClaims;
    if (badClaims === 0) {
      reviewScore = weights.review;
    } else {
      const penaltyRatio = Math.max(0, 1 - (badClaims / claims.length));
      reviewScore = weights.review * penaltyRatio;
    }
  } else {
    warnings.push("Brak faktów (claims) wygenerowanych dla tej trasy.");
  }

  // Heuristic warnings and scoring adjustments for Polish Archetypes
  let archetypePenalty = 0;
  const claimsTextLower = claims.map(c => (c.claim ?? "").toLowerCase());

  // Archetype: Szosowy Esteta (motorcycle, roadtrip, road_trip)
  if (category === "motorcycle" || category === "roadtrip" || category === "road_trip") {
    // 1. Surface validation (no dirt/gravel for road beauties)
    const gravelOrDirt = (input.surfaceDistribution?.szuter ?? 0) + (input.surfaceDistribution?.ziemia ?? 0);
    if (gravelOrDirt > 10) {
      warnings.push("Szosowy Esteta: Wykryto nawierzchnię szutrową lub ziemną przekraczającą 10% trasy. Szosowi podróżnicy preferują wyłącznie gładki asfalt.");
      archetypePenalty += 5;
    }
    // 2. Fuel stations verification
    const hasFuelClaim = claimsTextLower.some(t => t.includes("stacja") || t.includes("paliw") || t.includes("benzyn") || t.includes("fuel") || t.includes("petrol"));
    if (!hasFuelClaim) {
      warnings.push("Szosowy Esteta: Brak potwierdzonych stacji paliw na trasie. Zaplanuj tankowanie z wyprzedzeniem.");
      archetypePenalty += 4;
    }
    // 3. Curvature validation
    const curv = input.curvatureScore ?? 10.0;
    if (curv < 5.0) {
      warnings.push(`Szosowy Esteta: Niski wskaźnik krętości trasy (${curv}/10). Szosowi motocykliści wolą bardziej kręte odcinki.`);
      archetypePenalty += 3;
    }
  }

  // Archetype: Górski Wyjadacz (trekking, hiking, mtb, trail_running)
  if (category === "trekking" || category === "hiking" || category === "mtb" || category === "trail_running") {
    // 1. Mountain shelters & resting places
    const hasShelterClaim = claimsTextLower.some(t => t.includes("schronisko") || t.includes("wiata") || t.includes("biwak") || t.includes("nocleg") || t.includes("shelter") || t.includes("camp") || t.includes("nocować"));
    if (!hasShelterClaim) {
      warnings.push("Górski Wyjadacz: Brak informacji o schroniskach turystycznych lub miejscach schronienia na trasie.");
      archetypePenalty += 4;
    }
    // 2. GSM network availability
    const hasGsmClaim = claimsTextLower.some(t => t.includes("gsm") || t.includes("zasięg") || t.includes("telefon") || t.includes("zasięgu") || t.includes("signal") || t.includes("network"));
    if (!hasGsmClaim) {
      warnings.push("Górski Wyjadacz: Brak weryfikacji zasięgu GSM. Pamiętaj, że w górach zasięg bywa ograniczony.");
      archetypePenalty += 3;
    }
    // 3. Drinking water spring
    const hasWaterClaim = claimsTextLower.some(t => t.includes("woda") || t.includes("źródło") || t.includes("potok") || t.includes("water") || t.includes("spring") || t.includes("studnia"));
    if (!hasWaterClaim) {
      warnings.push("Górski Wyjadacz: Brak informacji o dostępności źródeł wody pitnej na trasie.");
      archetypePenalty += 3;
    }
  }

  // Archetype: Miejski Odkrywca (city_walk, city_break)
  if (category === "city_walk" || category === "city_break") {
    // 1. Sightseeing POIs
    const poiCount = claims.filter(c => c.claimType === "poi" || claimsTextLower.some(t => t.includes("muzeum") || t.includes("zabytek") || t.includes("park") || t.includes("rynek") || t.includes("kościół") || t.includes("zamek") || t.includes("pałac") || t.includes("landmark") || t.includes("museum") || t.includes("monument"))).length;
    if (poiCount < 2) {
      warnings.push("Miejski Odkrywca: Zbyt mało punktów orientacyjnych lub zabytków na trasie (wymagane minimum 2).");
      archetypePenalty += 5;
    }
    // 2. Parking space / urban transit
    const hasParkingClaim = claimsTextLower.some(t => t.includes("parking") || t.includes("miejsce parkingowe") || t.includes("parkowanie") || t.includes("parkować"));
    if (!hasParkingClaim) {
      warnings.push("Miejski Odkrywca: Brak informacji o parkingach lub dojeździe komunikacją miejską.");
      archetypePenalty += 3;
    }
  }

  // Archetype: Rodzinny Piknikowicz (cycling, hiking, trekking)
  if (category === "cycling" || category === "hiking" || category === "trekking") {
    // 1. Low elevation check (family friendly)
    const elev = input.elevationGainM ?? 0;
    if (elev > 400) {
      warnings.push(`Rodzinny Piknikowicz: Suma przewyższeń wynosi ${elev}m, co może być zbyt męczące dla małych dzieci.`);
      archetypePenalty += 4;
    }
    // 2. Heavy traffic alerts
    const hasTrafficWarning = claimsTextLower.some(t => t.includes("ruchliwa") || t.includes("duży ruch") || t.includes("samochody") || t.includes("heavy traffic") || t.includes("droga krajowa"));
    if (hasTrafficWarning) {
      warnings.push("Rodzinny Piknikowicz: Uwaga! Wykryto fragmenty o dużym natężeniu ruchu drogowego, niebezpieczne dla dzieci.");
      archetypePenalty += 5;
    }
    // 3. Resting places / playgrounds
    const hasPlaygroundClaim = claimsTextLower.some(t => t.includes("plac zabaw") || t.includes("wiata") || t.includes("piknik") || t.includes("ławka") || t.includes("rest area") || t.includes("playground") || t.includes("picnic"));
    if (!hasPlaygroundClaim) {
      warnings.push("Rodzinny Piknikowicz: Brak oznaczonych wiat rekreacyjnych, placów zabaw lub miejsc przyjaznych rodzinom.");
      archetypePenalty += 3;
    }
  }

  const baseScore = gpxScore + authorScore + externalSourceScore + reviewScore;
  const totalScore = Math.max(0, Math.round(baseScore - Math.min(15, archetypePenalty)));
  const passedQualityGate = totalScore >= 80 && hardBlockers.length === 0;

  return {
    score: totalScore,
    passedQualityGate,
    hardBlockers,
    warnings,
    breakdown: {
      gpxScore,
      authorScore,
      externalSourceScore,
      reviewScore
    }
  };
}
