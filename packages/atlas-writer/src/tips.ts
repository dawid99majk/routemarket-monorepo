import { join } from "node:path";
import type { RouteProject, RouteTip, ProjectRepository } from "../../atlas-core/src/index.js";

export async function generateRouteTips(project: RouteProject, repository?: ProjectRepository): Promise<RouteTip[]> {
  let summary: any = {};
  let claims: any[] = [];

  if (repository) {
    try {
      summary = await repository.loadArtifact(project.id, "route_summary.json") ?? {};
    } catch {}
    try {
      const claimsData = await repository.loadArtifact(project.id, "claims") as any;
      claims = Array.isArray(claimsData) ? claimsData : (claimsData?.claims ?? []);
    } catch {}
  } else {
    try {
      const { readJsonFile } = await import("../../atlas-core/src/index.js");
      summary = await readJsonFile(join(project.folderPath, "route_summary.json")) ?? {};
    } catch {}
    try {
      const { readJsonFile } = await import("../../atlas-core/src/index.js");
      claims = await readJsonFile(join(project.folderPath, "claims.json")) ?? [];
    } catch {}
  }

  const category = project.category;
  const regionName = project.region === "unknown" ? "wybranym regionie" : project.region;

  // 1. Weather Tip
  let weatherTipContent = `Upewnij się, że pogoda w regionie ${regionName} sprzyja aktywnościom na świeżym powietrzu. Unikaj startu podczas silnego wiatru lub burz.`;
  if (category === "motorcycle" || category === "roadtrip" || category === "road_trip") {
    weatherTipContent = `Przed wyruszeniem w region ${regionName} koniecznie sprawdź prognozę pogody dla wyższych partii górskich. Temperatura w zakrętach i na przełęczach może być o kilkanaście stopni niższa niż w dolinach!`;
  } else if (["hiking", "trekking", "mtb", "trail_running"].includes(category)) {
    weatherTipContent = `Górskie warunki w regionie ${regionName} potrafią zmienić się w kilkanaście minut. Sprawdź radar burzowy i spakuj nieprzemakalną kurtkę – bezpieczeństwo na szlaku jest najważniejsze!`;
  } else if (["city_walk", "city_break"].includes(category)) {
    weatherTipContent = `Region ${regionName} najlepiej zwiedza się przy stabilnej pogodzie. W przypadku deszczu, zaplanuj wcześniej wizytę w lokalnych muzeach lub kawiarniach.`;
  }

  // Safe normalization of claims array to handle empty files, legacy shapes, or database results
  const claimsArray = Array.isArray(claims)
    ? claims
    : (claims && typeof claims === "object" && Array.isArray((claims as any).claims)
        ? (claims as any).claims
        : []);
  const claimsTextLower: string[] = claimsArray
    .filter((c: any) => c && typeof c.claim === "string")
    .map((c: any) => c.claim.toLowerCase());

  // 2. Logistics / Fuel / Network Tip
  const isMotorVehicle = ["motorcycle", "roadtrip", "road_trip"].includes(category);
  let logisticsTipContent = "";
  let logisticsCategory: "before_start_fuel" | "before_start_network" = "before_start_network";

  if (isMotorVehicle) {
    logisticsCategory = "before_start_fuel";
    const hasFuelClaim = claimsTextLower.some((t: string) => t.includes("stacja") || t.includes("paliw") || t.includes("benzyn") || t.includes("fuel") || t.includes("petrol"));
    if (hasFuelClaim) {
      logisticsTipContent = `Trasa w regionie ${regionName} liczy ${summary.distanceKm ?? 'wiele'} km. Na trasie znajdują się zweryfikowane punkty tankowania, ale nie czekaj z tankowaniem na ostatnią chwilę!`;
    } else {
      logisticsTipContent = `Uwaga! Na górskich i odległych odcinkach w regionie ${regionName} dostęp do stacji paliw może być ograniczony. Zatankuj pojazd do pełna przed samym startem!`;
    }
  } else {
    logisticsTipContent = `Zasięg sieci komórkowej w regionie ${regionName} bywa zmienny. Koniecznie pobierz mapę offline GPX na telefon oraz naładuj baterię (lub weź powerbank) przed wyjściem ze strefy miejskiej.`;
  }

  // 3. Permits / Cost Tip
  let permitsTipContent = `Przed startem upewnij się, czy trasa nie przebiega przez tereny prywatne lub rezerwaty o ograniczonym dostępie. Szanuj przyrodę i lokalną własność.`;
  const mentionsPark = claimsTextLower.some((t: string) => t.includes("park narodowy") || t.includes("rezerwat") || t.includes("parku") || t.includes("national park"));
  const mentionsFees = claimsTextLower.some((t: string) => t.includes("opłata") || t.includes("bilet") || t.includes("płatny") || t.includes("wstęp") || t.includes("fee") || t.includes("ticket"));

  if (mentionsFees) {
    permitsTipContent = `Wstęp na wybrane atrakcje lub parki narodowe w regionie ${regionName} może być płatny. Przygotuj gotówkę (najlepiej w lokalnej walucie) lub kup bilet online.`;
  } else if (mentionsPark) {
    permitsTipContent = `Trasa przecina chroniony obszar ochrony przyrody w regionie ${regionName}. Pamiętaj o przestrzeganiu lokalnego regulaminu parku narodowego oraz zakazie schodzenia z wyznaczonych szlaków.`;
  }

  // 4. Good Tip (Złota rada)
  let goodTipContent = `Złota rada: Zapytaj lokalnych mieszkańców o aktualny stan drogi lub szlaku – to najbardziej aktualne źródło informacji, którego nie znajdziesz na standardowych mapach.`;
  if (isMotorVehicle) {
    const curv = summary.curvatureScore ?? 5.0;
    if (curv >= 6.0) {
      goodTipContent = `Złota rada: Wskaźnik krętości tej trasy to aż ${curv}/10! To prawdziwy raj dla pasjonatów zakrętów. Zachowaj szczególną ostrożność na ciasnych agrafkach.`;
    } else {
      goodTipContent = `Złota rada: Najlepsze widoki na tej trasie złapiesz o poranku lub tuż przed zachodem słońca, gdy ruch na drogach jest minimalny.`;
    }
  } else {
    const elev = summary.elevationGainM ?? 0;
    if (elev > 500) {
      goodTipContent = `Złota rada: Suma przewyższeń to aż ${elev}m. Rób regularne przerwy na regenerację w punktach widokowych i dbaj o odpowiednie nawodnienie.`;
    }
  }

  const tips: RouteTip[] = [
    {
      id: "tip_001",
      category: "before_start_weather",
      content: weatherTipContent,
      sortOrder: 1
    },
    {
      id: "tip_002",
      category: logisticsCategory,
      content: logisticsTipContent,
      sortOrder: 2
    },
    {
      id: "tip_003",
      category: "before_start_permits",
      content: permitsTipContent,
      sortOrder: 3
    },
    {
      id: "tip_004",
      category: "good_tip",
      content: goodTipContent,
      sortOrder: 4
    }
  ];

  if (repository) {
    await repository.saveArtifact(project.id, "tips", tips);
  } else {
    const { writeJsonFile } = await import("../../atlas-core/src/index.js");
    await writeJsonFile(join(project.folderPath, "tips.json"), tips);
  }
  return tips;
}
