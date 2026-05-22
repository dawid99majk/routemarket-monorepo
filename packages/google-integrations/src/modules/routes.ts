import { z } from 'zod';

export const RouteSchema = z.object({
  distanceMeters: z.number(),
  duration: z.string(),
  polyline: z.string(),
  legs: z.array(z.any())
});

export type Route = z.infer<typeof RouteSchema>;

export class GoogleRoutesProvider {
  constructor(private readonly apiKey: string) {}

  async calculateRoute(origin: { lat: number, lng: number }, destination: { lat: number, lng: number }): Promise<Route | null> {
    if (!this.apiKey) return null;

    try {
      // Basic mock or real fetch signature
      // Using Routes API v2
      const url = `https://routes.googleapis.com/directions/v2:computeRoutes`;
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Goog-Api-Key': this.apiKey,
          'X-Goog-FieldMask': 'routes.distanceMeters,routes.duration,routes.polyline.encodedPolyline'
        },
        body: JSON.stringify({
          origin: { location: { latLng: origin } },
          destination: { location: { latLng: destination } },
          travelMode: 'DRIVE'
        })
      });

      const data = await response.json() as any;
      if (!data.routes || data.routes.length === 0) return null;

      const route = data.routes[0];
      return {
        distanceMeters: route.distanceMeters,
        duration: route.duration,
        polyline: route.polyline.encodedPolyline,
        legs: []
      };
    } catch (e) {
      console.error('Error calculating route:', e);
      return null;
    }
  }
}
