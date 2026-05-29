import type { RoutingProfile, RoutingProvider, RoutingResult, Waypoint } from './types.js';

type GoogleRoutesProviderOptions = {
  apiKey?: string;
  motorcycleTravelMode?: 'DRIVE' | 'TWO_WHEELER';
};

export class GoogleRoutesRoutingProvider implements RoutingProvider {
  private readonly apiKey: string;
  private readonly motorcycleTravelMode: 'DRIVE' | 'TWO_WHEELER';
  private readonly baseUrl = 'https://routes.googleapis.com/directions/v2:computeRoutes';

  constructor(options: GoogleRoutesProviderOptions = {}) {
    this.apiKey = options.apiKey || process.env.GOOGLE_MAPS_API_KEY || process.env.GOOGLE_API_KEY || '';
    this.motorcycleTravelMode = options.motorcycleTravelMode || (process.env.GOOGLE_ROUTES_MOTORCYCLE_MODE === 'TWO_WHEELER' ? 'TWO_WHEELER' : 'DRIVE');
  }

  async getRoute(waypoints: Waypoint[], profile: RoutingProfile): Promise<RoutingResult> {
    if (!this.apiKey) {
      throw new Error('GOOGLE_MAPS_API_KEY is missing.');
    }
    if (waypoints.length < 2) {
      throw new Error('At least two waypoints are required to generate a route.');
    }

    const normalized = waypoints.filter(isValidWaypoint).slice(0, 25);
    if (normalized.length < 2) {
      throw new Error('At least two valid waypoints are required to generate a route.');
    }

    const body: Record<string, unknown> = {
      origin: toRouteLocation(normalized[0]),
      destination: toRouteLocation(normalized[normalized.length - 1]),
      travelMode: this.mapProfile(profile),
      computeAlternativeRoutes: false,
      polylineEncoding: 'ENCODED_POLYLINE',
      polylineQuality: 'HIGH_QUALITY',
      intermediates: normalized.slice(1, -1).map(toRouteLocation)
    };

    const response = await fetch(this.baseUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': this.apiKey,
        'X-Goog-FieldMask': 'routes.distanceMeters,routes.duration,routes.polyline.encodedPolyline'
      },
      body: JSON.stringify(body)
    });

    const data = await response.json().catch(() => ({})) as any;
    if (!response.ok) {
      throw new Error(`Google Routes API error (${response.status}): ${JSON.stringify(data)}`);
    }

    const route = data.routes?.[0];
    if (!route) {
      throw new Error('Google Routes API returned no route for the selected waypoints.');
    }

    const points = route.polyline?.encodedPolyline
      ? decodePolyline(route.polyline.encodedPolyline)
      : normalized;

    if (points.length < 2) {
      throw new Error('Google Routes API returned an empty route geometry.');
    }

    const distanceKm = typeof route.distanceMeters === 'number'
      ? route.distanceMeters / 1000
      : calculateDistance(points);

    return {
      points,
      distanceKm: Math.round(distanceKm * 100) / 100,
      estimatedTimeH: durationToHours(route.duration) ?? estimateTime(profile, distanceKm),
      geometryGeoJson: {
        type: 'LineString',
        coordinates: points.map((point) => [point.lng, point.lat])
      }
    };
  }

  private mapProfile(profile: RoutingProfile): 'DRIVE' | 'BICYCLE' | 'WALK' | 'TWO_WHEELER' {
    switch (profile) {
      case 'bike':
        return 'BICYCLE';
      case 'hiking':
        return 'WALK';
      case 'motorcycle':
        return this.motorcycleTravelMode;
      default:
        return 'DRIVE';
    }
  }
}

function toRouteLocation(point: Waypoint) {
  return {
    location: {
      latLng: {
        latitude: point.lat,
        longitude: point.lng
      }
    }
  };
}

function isValidWaypoint(point: Waypoint): boolean {
  return Number.isFinite(point.lat)
    && Number.isFinite(point.lng)
    && Math.abs(point.lat) <= 90
    && Math.abs(point.lng) <= 180
    && !(point.lat === 0 && point.lng === 0);
}

function decodePolyline(encoded: string): Waypoint[] {
  let index = 0;
  let lat = 0;
  let lng = 0;
  const coordinates: Waypoint[] = [];

  while (index < encoded.length) {
    const latResult = decodeValue(encoded, index);
    lat += latResult.value;
    index = latResult.nextIndex;

    const lngResult = decodeValue(encoded, index);
    lng += lngResult.value;
    index = lngResult.nextIndex;

    coordinates.push({
      lat: lat / 1e5,
      lng: lng / 1e5
    });
  }

  return coordinates;
}

function decodeValue(encoded: string, startIndex: number): { value: number; nextIndex: number } {
  let result = 0;
  let shift = 0;
  let index = startIndex;
  let byte: number;

  do {
    byte = encoded.charCodeAt(index++) - 63;
    result |= (byte & 0x1f) << shift;
    shift += 5;
  } while (byte >= 0x20 && index < encoded.length);

  return {
    value: (result & 1) ? ~(result >> 1) : (result >> 1),
    nextIndex: index
  };
}

function durationToHours(duration?: string): number | undefined {
  const seconds = duration?.match(/^(\d+(?:\.\d+)?)s$/)?.[1];
  return seconds ? Math.round((Number(seconds) / 3600) * 100) / 100 : undefined;
}

function estimateTime(profile: RoutingProfile, distanceKm: number): number {
  const speed = profile === 'hiking' ? 4 : profile === 'bike' ? 18 : 45;
  return Math.round((distanceKm / speed) * 100) / 100;
}

function calculateDistance(points: Waypoint[]): number {
  let distance = 0;
  for (let i = 1; i < points.length; i += 1) {
    distance += haversine(points[i - 1], points[i]);
  }
  return distance;
}

function haversine(a: Waypoint, b: Waypoint): number {
  const radiusKm = 6371;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * radiusKm * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

function toRad(value: number): number {
  return value * Math.PI / 180;
}
