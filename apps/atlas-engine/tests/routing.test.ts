import { describe, it, expect } from 'vitest';
import { GraphHopperRoutingProvider } from '@routemarket/atlas-gis';

describe('Routing Module', () => {
  describe('GraphHopperRoutingProvider', () => {
    it.skipIf(!process.env.GRAPHHOPPER_API_KEY)('generates a real route between two waypoints', async () => {
      const provider = new GraphHopperRoutingProvider();
      const waypoints = [
        { lat: 52.2297, lng: 21.0122 }, // Warsaw
        { lat: 50.0647, lng: 19.9450 }  // Krakow
      ];

      const result = await provider.getRoute(waypoints, 'motorcycle');

      expect(result.points.length).toBeGreaterThan(2);
      expect(result.distanceKm).toBeGreaterThan(200);
      expect(result.distanceKm).toBeLessThan(400);
      expect(result.estimatedTimeH).toBeGreaterThan(0);
      expect(result.geometryGeoJson.type).toBe('LineString');
      expect(result.geometryGeoJson.coordinates.length).toBeGreaterThan(2);
    });

    it.skipIf(!process.env.GRAPHHOPPER_API_KEY)('calculates different estimated times for different profiles', async () => {
      const provider = new GraphHopperRoutingProvider();
      const waypoints = [
        { lat: 52.2297, lng: 21.0122 },
        { lat: 50.0647, lng: 19.9450 }
      ];

      const motorcycleResult = await provider.getRoute(waypoints, 'motorcycle');
      const hikingResult = await provider.getRoute(waypoints, 'hiking');

      expect(hikingResult.estimatedTimeH).toBeGreaterThan(motorcycleResult.estimatedTimeH);
    });

    it('throws error if less than 2 waypoints are provided', async () => {
      const provider = new GraphHopperRoutingProvider('dummy-key');
      const waypoints = [{ lat: 52.2297, lng: 21.0122 }];

      await expect(provider.getRoute(waypoints, 'bike')).rejects.toThrow('At least two waypoints are required');
    });
    
    it('throws error if API key is missing', async () => {
      const originalKey = process.env.GRAPHHOPPER_API_KEY;
      delete process.env.GRAPHHOPPER_API_KEY;
      
      const provider = new GraphHopperRoutingProvider('');
      const waypoints = [
        { lat: 52.2297, lng: 21.0122 },
        { lat: 50.0647, lng: 19.9450 }
      ];
      
      await expect(provider.getRoute(waypoints, 'bike')).rejects.toThrow('GraphHopper API key is missing');
      
      if (originalKey) {
        process.env.GRAPHHOPPER_API_KEY = originalKey;
      }
    });
  });
});
