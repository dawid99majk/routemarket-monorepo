import { readFile } from 'node:fs/promises';
/**
 * BRouter (brouter.de) — darmowy routing OSM bez limitu punktów pośrednich,
 * z profilami zoptymalizowanymi pod szlaki piesze i rowerowe (w przeciwieństwie
 * do "najkrótszej drogi" z darmowego GraphHoppera).
 */

const USER_AGENT = 'RouteMarketBuilderV3/1.0 (routemarket.io)';

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

/**
 * Motocykl to jedyny typ trasy, dla którego żaden gotowy profil BRoutera nie
 * pasuje: wszystkie samochodowe minimalizują czas, więc prowadzą krajową zamiast
 * wojewódzką przez przełęcz. Własny profil (car-eco + kara za klasę drogi)
 * wgrywamy na serwer przy pierwszym użyciu i trzymamy zwrócony identyfikator.
 * BRouter kasuje wgrane profile po pewnym czasie, więc przy odmowie wgrywamy
 * ponownie, zamiast raz na zawsze uznać motocykl za zepsuty.
 */
const MOTO_PROFILE_FILE = new URL('../../profiles/moto-twisty.brf', import.meta.url);
let motoProfileId: string | null = null;
let motoProfilePromise: Promise<string> | null = null;

async function uploadMotoProfile(): Promise<string> {
  const body = await readFile(MOTO_PROFILE_FILE, 'utf8');
  const res = await fetch(`${BROUTER_BASE_URL}/profile`, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain', 'User-Agent': USER_AGENT },
    body,
    signal: AbortSignal.timeout(20000)
  });
  const data = await res.json() as { profileid?: string; error?: string };
  if (!res.ok || data.error || !data.profileid) {
    throw new Error(`BRouter profile upload failed: ${data.error || res.status}`);
  }
  console.log(`[BRouter] Profil motocyklowy wgrany jako ${data.profileid}`);
  return data.profileid;
}

/** Jedno wgranie na proces — równoległe trasy nie mnożą kopii profilu na serwerze. */
async function getMotoProfileId(force = false): Promise<string> {
  if (force) { motoProfileId = null; motoProfilePromise = null; }
  if (motoProfileId) return motoProfileId;
  if (!motoProfilePromise) {
    motoProfilePromise = uploadMotoProfile()
      .then((id) => { motoProfileId = id; return id; })
      .catch((err) => { motoProfilePromise = null; throw err; });
  }
  return motoProfilePromise;
}

// Mapowanie typów tras aplikacji na profile BRouter
const PROFILE_MAP: Record<string, string> = {
  hiking: 'hiking-mountain',
  city_walk: 'shortest',
  city: 'shortest',
  cycling: 'fastbike',
  road: 'fastbike',
  gravel: 'trekking',
  mtb: 'trekking',
  bicycle: 'trekking',
  motorcycle: 'moto-twisty'
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

    if (profile === 'moto-twisty') {
      try {
        return await this.request(waypoints, await getMotoProfileId());
      } catch (err: any) {
        console.warn(`[BRouter] Profil motocyklowy odrzucony (${err.message}) — wgrywam ponownie.`);
        return await this.request(waypoints, await getMotoProfileId(true));
      }
    }

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
      headers: { 'User-Agent': USER_AGENT },
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
