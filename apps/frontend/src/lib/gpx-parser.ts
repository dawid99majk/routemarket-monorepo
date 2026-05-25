/**
 * Parses a GPX file and extracts route metadata:
 * - total distance (km)
 * - elevation gain (m)
 * - estimated time (h)
 * - center coordinates (lat/lng)
 * - start/end points as lat,lng strings
 */
export interface GpxParseResult {
  distance_km: number;
  elevation_gain_m: number;
  estimated_time_h: number;
  latitude: number;
  longitude: number;
  start_point: string;
  end_point: string;
  bounds: { minLat: number; maxLat: number; minLng: number; maxLng: number };
  trackPoints: [number, number][]; // [lat, lng][]
}

interface TrackPoint {
  lat: number;
  lon: number;
  ele: number;
}

function haversine(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/**
 * Simplify a track to a maximum number of points using Ramer-Douglas-Peucker-like even sampling.
 * Used for preview maps — enough for visual shape, not useful for navigation.
 */
export function simplifyTrack(points: [number, number][], maxPoints = 12): [number, number][] {
  if (points.length <= maxPoints) return points;
  const step = (points.length - 1) / (maxPoints - 1);
  const result: [number, number][] = [];
  for (let i = 0; i < maxPoints - 1; i++) {
    result.push(points[Math.round(i * step)]);
  }
  result.push(points[points.length - 1]); // always include last
  return result;
}

export function parseGpx(xmlString: string): GpxParseResult {
  const parser = new DOMParser();
  const doc = parser.parseFromString(xmlString, 'application/xml');

  const points: TrackPoint[] = [];

  // Collect trkpt and rtept
  const trkpts = doc.querySelectorAll('trkpt');
  const rtepts = doc.querySelectorAll('rtept');
  const allPts = trkpts.length > 0 ? trkpts : rtepts;

  allPts.forEach((pt) => {
    const lat = parseFloat(pt.getAttribute('lat') || '0');
    const lon = parseFloat(pt.getAttribute('lon') || '0');
    const eleEl = pt.querySelector('ele');
    const ele = eleEl ? parseFloat(eleEl.textContent || '0') : 0;
    if (lat !== 0 || lon !== 0) {
      points.push({ lat, lon, ele });
    }
  });

  if (points.length === 0) {
    throw new Error('No track points found in GPX file');
  }

  let totalDistance = 0;
  let elevationGain = 0;

  for (let i = 1; i < points.length; i++) {
    totalDistance += haversine(points[i - 1].lat, points[i - 1].lon, points[i].lat, points[i].lon);
    const eleDiff = points[i].ele - points[i - 1].ele;
    if (eleDiff > 0) elevationGain += eleDiff;
  }

  // Estimate time: ~4 km/h hiking + 1h per 600m elevation gain (Naismith's rule)
  const estimatedTime = totalDistance / 4 + elevationGain / 600;

  const lats = points.map((p) => p.lat);
  const lngs = points.map((p) => p.lon);

  // Safe min/max calculation that avoids exceeding the call stack limit on large arrays
  const minLat = lats.reduce((min, val) => val < min ? val : min, lats[0]);
  const maxLat = lats.reduce((max, val) => val > max ? val : max, lats[0]);
  const minLng = lngs.reduce((min, val) => val < min ? val : min, lngs[0]);
  const maxLng = lngs.reduce((max, val) => val > max ? val : max, lngs[0]);

  const centerLat = (minLat + maxLat) / 2;
  const centerLng = (minLng + maxLng) / 2;

  const first = points[0];
  const last = points[points.length - 1];

  // Downsample for preview (max 500 points)
  const step = Math.max(1, Math.floor(points.length / 500));
  const trackPoints: [number, number][] = points
    .filter((_, i) => i % step === 0 || i === points.length - 1)
    .map((p) => [p.lat, p.lon]);

  return {
    distance_km: Math.round(totalDistance * 10) / 10,
    elevation_gain_m: Math.round(elevationGain),
    estimated_time_h: Math.round(estimatedTime * 10) / 10,
    latitude: centerLat,
    longitude: centerLng,
    start_point: `${first.lat.toFixed(5)}, ${first.lon.toFixed(5)}`,
    end_point: `${last.lat.toFixed(5)}, ${last.lon.toFixed(5)}`,
    bounds: {
      minLat,
      maxLat,
      minLng,
      maxLng,
    },
    trackPoints,
  };
}
