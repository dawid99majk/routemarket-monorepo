import { describe, expect, it } from 'vitest';
import { buildGpxFromCoordinates, buildRouteDraftFromDescription } from '@/lib/route-description-importer';
import { parseGpx } from '@/lib/gpx-parser';

describe('route description importer', () => {
  it('extracts product fields and a GPX-ready coordinate list', () => {
    const draft = buildRouteDraftFromDescription(`
Petla widokowa przez Przelecz Przyslop
Dystans: 28 km, przewyzszenie: 760 m, czas: 5 h.
Gravel i lesna droga, trudnosc umiarkowana, petla na lato i jesien.
Start: 49.59214, 19.53440
Punkt widokowy: 49.60410, 19.55720
Meta: 49.59214, 19.53440
Uwaga: po deszczu odcinek lesny jest sliski.
Wez offline mapy, wode i powerbank.
`);

    expect(draft.title).toBe('Petla widokowa przez Przelecz Przyslop');
    expect(draft.distanceKm).toBe('28');
    expect(draft.elevationGain).toBe('760');
    expect(draft.estimatedTime).toBe('5');
    expect(draft.difficulty).toBe('moderate');
    expect(draft.loopType).toBe('loop');
    expect(draft.surfaceType).toContain('gravel');
    expect(draft.surfaceType).toContain('dirt');
    expect(draft.season).toEqual(['summer', 'autumn']);
    expect(draft.coordinates).toHaveLength(3);
    expect(draft.dataConfidence).toBe('medium');
    expect(draft.tips.length).toBeGreaterThan(0);
  });

  it('creates parseable GPX from extracted coordinates', () => {
    const coordinates = [
      { lat: 49.59214, lng: 19.5344 },
      { lat: 49.6041, lng: 19.5572 },
      { lat: 49.59214, lng: 19.5344 },
    ];

    const gpx = buildGpxFromCoordinates('Test route', coordinates);
    const parsed = parseGpx(gpx);

    expect(parsed.trackPoints).toHaveLength(3);
    expect(parsed.start_point).toBe('49.59214, 19.53440');
    expect(parsed.end_point).toBe('49.59214, 19.53440');
    expect(parsed.distance_km).toBeGreaterThan(0);
  });
});
