import { z } from 'zod';

export const GeocodingResultSchema = z.object({
  formattedAddress: z.string(),
  location: z.object({
    lat: z.number(),
    lng: z.number()
  }),
  placeId: z.string(),
  types: z.array(z.string())
});

export type GeocodingResult = z.infer<typeof GeocodingResultSchema>;

export class GoogleGeocodingProvider {
  constructor(private readonly apiKey: string) {}

  async geocode(address: string): Promise<GeocodingResult[]> {
    if (!this.apiKey) return [];

    try {
      const url = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(address)}&key=${this.apiKey}`;
      const response = await fetch(url);
      const data = await response.json() as any;

      if (data.status !== 'OK' || !data.results) {
        return [];
      }

      return data.results.map((item: any) => ({
        formattedAddress: item.formatted_address,
        location: item.geometry.location,
        placeId: item.place_id,
        types: item.types
      }));
    } catch (e) {
      console.error('Error geocoding address:', e);
      return [];
    }
  }

  async reverseGeocode(location: { lat: number, lng: number }): Promise<GeocodingResult[]> {
    if (!this.apiKey) return [];

    try {
      const url = `https://maps.googleapis.com/maps/api/geocode/json?latlng=${location.lat},${location.lng}&key=${this.apiKey}`;
      const response = await fetch(url);
      const data = await response.json() as any;

      if (data.status !== 'OK' || !data.results) {
        return [];
      }

      return data.results.map((item: any) => ({
        formattedAddress: item.formatted_address,
        location: item.geometry.location,
        placeId: item.place_id,
        types: item.types
      }));
    } catch (e) {
      console.error('Error reverse geocoding:', e);
      return [];
    }
  }
}
