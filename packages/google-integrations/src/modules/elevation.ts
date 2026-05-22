import { z } from 'zod';

export const ElevationSchema = z.object({
  elevation: z.number(),
  location: z.object({
    lat: z.number(),
    lng: z.number()
  }),
  resolution: z.number()
});

export type Elevation = z.infer<typeof ElevationSchema>;

export class GoogleElevationProvider {
  constructor(private readonly apiKey: string) {}

  async getElevation(location: { lat: number, lng: number }): Promise<Elevation | null> {
    if (!this.apiKey) return null;

    try {
      const url = `https://maps.googleapis.com/maps/api/elevation/json?locations=${location.lat},${location.lng}&key=${this.apiKey}`;
      const response = await fetch(url);
      const data = await response.json() as any;

      if (data.status !== 'OK' || !data.results || data.results.length === 0) {
        return null;
      }

      return data.results[0];
    } catch (e) {
      console.error('Error getting elevation:', e);
      return null;
    }
  }

  async getElevationPath(path: { lat: number, lng: number }[], samples: number): Promise<Elevation[]> {
    if (!this.apiKey || path.length < 2) return [];

    try {
      const pathStr = path.map(p => `${p.lat},${p.lng}`).join('|');
      const url = `https://maps.googleapis.com/maps/api/elevation/json?path=${pathStr}&samples=${samples}&key=${this.apiKey}`;
      const response = await fetch(url);
      const data = await response.json() as any;

      if (data.status !== 'OK' || !data.results) {
        return [];
      }

      return data.results;
    } catch (e) {
      console.error('Error getting elevation path:', e);
      return [];
    }
  }
}
