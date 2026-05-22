export type TrackPointTuple = [number, number];

export function normalizePreviewTrack(raw: unknown): TrackPointTuple[] {
  if (!Array.isArray(raw)) return [];

  return raw
    .map((point): TrackPointTuple | null => {
      if (Array.isArray(point) && point.length >= 2) {
        const lat = Number(point[0]);
        const lng = Number(point[1]);
        return Number.isFinite(lat) && Number.isFinite(lng) ? [lat, lng] : null;
      }

      if (point && typeof point === 'object') {
        const value = point as { lat?: unknown; lng?: unknown; lon?: unknown };
        const lat = Number(value.lat);
        const lng = Number(value.lng ?? value.lon);
        return Number.isFinite(lat) && Number.isFinite(lng) ? [lat, lng] : null;
      }

      return null;
    })
    .filter((point): point is TrackPointTuple => point !== null);
}