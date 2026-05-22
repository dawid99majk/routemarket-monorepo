/**
 * Geographic utilities for in-app navigation.
 * All distances are returned in meters unless noted otherwise.
 */

export type LatLng = { lat: number; lng: number };
export type Polyline = [number, number][]; // [lat, lng][]

const EARTH_RADIUS_M = 6_371_000;

export function haversine(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const toRad = (v: number) => (v * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return EARTH_RADIUS_M * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/** Equirectangular projection to local meters around a reference point. */
function projectToMeters(point: LatLng, ref: LatLng): { x: number; y: number } {
  const toRad = (v: number) => (v * Math.PI) / 180;
  const x = toRad(point.lng - ref.lng) * Math.cos(toRad(ref.lat)) * EARTH_RADIUS_M;
  const y = toRad(point.lat - ref.lat) * EARTH_RADIUS_M;
  return { x, y };
}

interface SegmentResult {
  distanceM: number;
  segmentIndex: number; // index of segment start vertex
  t: number; // 0..1 along segment
}

/** Distance from `point` to nearest point on the polyline (meters), plus position along path. */
export function distanceToPolyline(point: LatLng, polyline: Polyline): SegmentResult {
  if (polyline.length === 0) {
    return { distanceM: Infinity, segmentIndex: 0, t: 0 };
  }
  if (polyline.length === 1) {
    return { distanceM: haversine(point.lat, point.lng, polyline[0][0], polyline[0][1]), segmentIndex: 0, t: 0 };
  }

  let best: SegmentResult = { distanceM: Infinity, segmentIndex: 0, t: 0 };

  for (let i = 0; i < polyline.length - 1; i++) {
    const a = { lat: polyline[i][0], lng: polyline[i][1] };
    const b = { lat: polyline[i + 1][0], lng: polyline[i + 1][1] };
    const ref = a;
    const A = projectToMeters(a, ref);
    const B = projectToMeters(b, ref);
    const P = projectToMeters(point, ref);

    const dx = B.x - A.x;
    const dy = B.y - A.y;
    const lenSq = dx * dx + dy * dy;
    let t = lenSq === 0 ? 0 : ((P.x - A.x) * dx + (P.y - A.y) * dy) / lenSq;
    t = Math.max(0, Math.min(1, t));
    const px = A.x + t * dx;
    const py = A.y + t * dy;
    const distSq = (P.x - px) ** 2 + (P.y - py) ** 2;
    const dist = Math.sqrt(distSq);
    if (dist < best.distanceM) {
      best = { distanceM: dist, segmentIndex: i, t };
    }
  }
  return best;
}

/** Total length of a polyline in meters. */
export function polylineLength(polyline: Polyline): number {
  let total = 0;
  for (let i = 1; i < polyline.length; i++) {
    total += haversine(polyline[i - 1][0], polyline[i - 1][1], polyline[i][0], polyline[i][1]);
  }
  return total;
}

/** Distance walked from start of polyline to projected point (meters). */
export function distanceAlongTrack(polyline: Polyline, segmentIndex: number, t: number): number {
  let total = 0;
  for (let i = 0; i < segmentIndex && i < polyline.length - 1; i++) {
    total += haversine(polyline[i][0], polyline[i][1], polyline[i + 1][0], polyline[i + 1][1]);
  }
  if (segmentIndex < polyline.length - 1) {
    const segLen = haversine(
      polyline[segmentIndex][0],
      polyline[segmentIndex][1],
      polyline[segmentIndex + 1][0],
      polyline[segmentIndex + 1][1],
    );
    total += segLen * t;
  }
  return total;
}

/** 0..1 progress along the track. */
export function progressAlongTrack(point: LatLng, polyline: Polyline): number {
  if (polyline.length < 2) return 0;
  const { segmentIndex, t } = distanceToPolyline(point, polyline);
  const traveled = distanceAlongTrack(polyline, segmentIndex, t);
  const total = polylineLength(polyline);
  if (total === 0) return 0;
  return Math.max(0, Math.min(1, traveled / total));
}

export function formatDistance(meters: number): string {
  if (!Number.isFinite(meters)) return '—';
  if (meters < 1000) return `${Math.round(meters)} m`;
  return `${(meters / 1000).toFixed(meters < 10_000 ? 2 : 1)} km`;
}
