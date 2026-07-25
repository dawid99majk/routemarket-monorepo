/**
 * BRouter (brouter.de) — darmowy routing OSM bez limitu punktów pośrednich,
 * z profilami zoptymalizowanymi pod szlaki piesze i rowerowe (w przeciwieństwie
 * do "najkrótszej drogi" z darmowego GraphHoppera).
 */

export interface BRouterWaypoint {
  lat: number;
  lng: number;
}

export interface BRouterResult {
  points: { lat: number; lng: number; ele?: number }[];
  distanceKm: number;
  estimatedTimeH: number;
  geometryGeoJson: {
    type: 'LineString';
    coordinates: number[][];
  };
}

const BROUTER_BASE_URL = process.env.BROUTER_BASE_URL || 'https://brouter.de/brouter';

// Mapowanie typów tras aplikacji na profile BRouter
const PROFILE_MAP: Record<string, string> = {
  hiking: 'hiking-mountain',
  city_walk: 'shortest',
  city: 'shortest',
  cycling: 'fastbike',
  road: 'fastbike',
  gravel: 'trekking',
  mtb: 'trekking',
  bicycle: 'trekking'
};

// Awaryjne profile, gdyby serwer nie znał podstawowego
const PROFILE_FALLBACK: Record<string, string> = {
  'hiking-mountain': 'shortest',
  'fastbike': 'trekking'
};

export class BRouterProvider {
  supportsRouteType(routeType: string): boolean {
    return routeType in PROFILE_MAP;
  }

  async getRoute(waypoints: BRouterWaypoint[], routeType: string): Promise<BRouterResult> {
    if (waypoints.length < 2) {
      throw new Error('At least two waypoints are required.');
    }

    const profile = PROFILE_MAP[routeType] || 'trekking';
    try {
      return await this.request(waypoints, profile);
    } catch (err: any) {
      const fallback = PROFILE_FALLBACK[profile];
      if (fallback) {
        console.warn(`[BRouter] Profile ${profile} failed (${err.message}), retrying with ${fallback}...`);
        return await this.request(waypoints, fallback);
      }
      throw err;
    }
  }

  private async request(waypoints: BRouterWaypoint[], profile: string): Promise<BRouterResult> {
    const lonlats = waypoints.map((w) => `${w.lng.toFixed(6)},${w.lat.toFixed(6)}`).join('|');
    const url = `${BROUTER_BASE_URL}?lonlats=${lonlats}&profile=${profile}&alternativeidx=0&format=geojson`;

    const res = await fetch(url, {
      headers: { 'User-Agent': 'RouteMarketBuilderV3/1.0 (routemarket.io)' },
      signal: AbortSignal.timeout(45000)
    });
    const text = await res.text();
    if (!res.ok || !text.trim().startsWith('{')) {
      throw new Error(`BRouter error (${res.status}): ${text.slice(0, 200)}`);
    }

    const data = JSON.parse(text);
    const feature = data.features?.[0];
    const coordinates: number[][] = feature?.geometry?.coordinates;
    if (!feature || !coordinates || coordinates.length < 2) {
      throw new Error('BRouter returned no route geometry.');
    }

    const props = feature.properties || {};
    const distanceKm = Number(props['track-length']) / 1000;
    const timeH = Number(props['total-time']) / 3600;

    return {
      points: coordinates.map((c) => ({ lat: c[1], lng: c[0], ele: c[2] })),
      distanceKm: Math.round(distanceKm * 100) / 100,
      estimatedTimeH: Math.round(timeH * 100) / 100,
      geometryGeoJson: {
        type: 'LineString',
        coordinates: coordinates.map((c) => [c[0], c[1]])
      }
    };
  }
}

export const brouterProvider = new BRouterProvider();
