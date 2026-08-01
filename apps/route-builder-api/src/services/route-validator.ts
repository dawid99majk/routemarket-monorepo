export interface RouteValidationResult {
  ok: boolean;
  warnings: string[];
  missed_waypoints: { name: string; distance_m: number }[];
  distance_deviation_pct: number | null;
}

function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// Korytarz tolerancji: jak daleko od śladu może leżeć obiecany waypoint [m].
// Routing dociąga punkty do najbliższej drogi/szlaku, więc np. szczyt może być
// kilkaset metrów od śladu drogowego.
const CORRIDOR_M: Record<string, number> = {
  hiking: 600,
  city_walk: 400,
  city: 400,
  cycling: 1200,
  gravel: 1200,
  mtb: 1200,
  motorcycle: 2500,
  car: 2500
};

export class RouteValidatorService {
  /** Odległość w linii prostej między dwoma punktami [km]. */
  distanceKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
    return haversineKm(a.lat, a.lng, b.lat, b.lng);
  }

  /**
   * Sprawdza, czy wyznaczony ślad faktycznie realizuje obietnice:
   * przechodzi przy zadanych waypointach, ma sensowny dystans, domyka pętlę.
   */
  validate(
    trackPoints: [number, number, number?][],
    waypoints: { name: string; lat: number; lng: number }[],
    options: { routeType?: string; distanceTargetKm?: number | null; actualDistanceKm?: number; isLoop?: boolean } = {}
  ): RouteValidationResult {
    const warnings: string[] = [];
    const missed: { name: string; distance_m: number }[] = [];
    const corridorM = CORRIDOR_M[options.routeType || 'hiking'] || 1000;

    if (!trackPoints || trackPoints.length < 2) {
      return { ok: false, warnings: ['Ślad trasy jest pusty lub zdegenerowany.'], missed_waypoints: [], distance_deviation_pct: null };
    }

    // 1. Każdy waypoint musi leżeć w korytarzu śladu
    for (const wp of waypoints) {
      let minKm = Infinity;
      // Próbkujemy co kilka punktów — wystarczająca dokładność, mniejszy koszt
      const step = Math.max(1, Math.floor(trackPoints.length / 2000));
      for (let i = 0; i < trackPoints.length; i += step) {
        const d = haversineKm(wp.lat, wp.lng, trackPoints[i][0], trackPoints[i][1]);
        if (d < minKm) minKm = d;
      }
      const distM = Math.round(minKm * 1000);
      if (distM > corridorM) {
        missed.push({ name: wp.name, distance_m: distM });
      }
    }
    if (missed.length > 0) {
      warnings.push(
        `Trasa omija punkty: ${missed.map((m) => `${m.name} (${(m.distance_m / 1000).toFixed(1)} km od śladu)`).join(', ')}.`
      );
    }

    // 2. Dystans vs cel
    let deviationPct: number | null = null;
    if (options.distanceTargetKm && options.actualDistanceKm) {
      deviationPct = Math.round(((options.actualDistanceKm - options.distanceTargetKm) / options.distanceTargetKm) * 100);
      if (Math.abs(deviationPct) > 40) {
        warnings.push(
          `Dystans trasy (${options.actualDistanceKm.toFixed(1)} km) odbiega o ${deviationPct}% od celu (${options.distanceTargetKm} km).`
        );
      }
    }

    // 3. Domknięcie pętli
    if (options.isLoop) {
      const first = trackPoints[0];
      const last = trackPoints[trackPoints.length - 1];
      const gapM = haversineKm(first[0], first[1], last[0], last[1]) * 1000;
      if (gapM > 500) {
        warnings.push(`Pętla nie jest domknięta — start i meta oddalone o ${(gapM / 1000).toFixed(1)} km.`);
      }
    }

    return { ok: warnings.length === 0, warnings, missed_waypoints: missed, distance_deviation_pct: deviationPct };
  }

  /**
   * Szacuje długość trasy po sekwencji waypointów (łańcuch haversine × współczynnik
   * krętości dróg). Służy do wychwycenia rażąco złego doboru punktów PRZED routingiem.
   */
  estimateChainKm(waypoints: { lat: number; lng: number }[], routeType: string): number {
    let chain = 0;
    for (let i = 1; i < waypoints.length; i++) {
      chain += haversineKm(waypoints[i - 1].lat, waypoints[i - 1].lng, waypoints[i].lat, waypoints[i].lng);
    }
    const circuity = routeType === 'hiking' || routeType === 'city' || routeType === 'city_walk' ? 1.3 : 1.25;
    return chain * circuity;
  }

  /**
   * Filtruje punkty absurdalnie oddalone od startu (pomyłki geokodera —
   * np. wieś o tej samej nazwie w innej części kraju).
   */
  filterOutliers<T extends { name: string; lat: number; lng: number }>(
    start: { lat: number; lng: number },
    waypoints: T[],
    routeType: string
  ): { kept: T[]; dropped: T[] } {
    const maxKm: Record<string, number> = {
      hiking: 30, city_walk: 8, city: 8,
      cycling: 80, gravel: 80, mtb: 80,
      motorcycle: 250, car: 250
    };
    const limit = maxKm[routeType] || 60;
    const kept: T[] = [];
    const dropped: T[] = [];
    for (const wp of waypoints) {
      if (haversineKm(start.lat, start.lng, wp.lat, wp.lng) <= limit) kept.push(wp);
      else dropped.push(wp);
    }
    return { kept, dropped };
  }
}

export const routeValidatorService = new RouteValidatorService();
