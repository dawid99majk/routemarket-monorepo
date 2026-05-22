import { z } from 'zod';

export const PlaceSchema = z.object({
  id: z.string(),
  name: z.string(),
  address: z.string().optional(),
  location: z.object({
    lat: z.number(),
    lng: z.number()
  }),
  types: z.array(z.string()).optional(),
  rating: z.number().optional(),
  userRatingCount: z.number().optional(),
  website: z.string().optional(),
  phone: z.string().optional()
});

export type Place = z.infer<typeof PlaceSchema>;

export class GooglePlacesProvider {
  constructor(private readonly apiKey: string) {}

  async searchNearby(location: { lat: number, lng: number }, radius: number, type: string): Promise<Place[]> {
    if (!this.apiKey) return [];
    
    try {
      const url = `https://maps.googleapis.com/maps/api/place/nearbysearch/json?location=${location.lat},${location.lng}&radius=${radius}&type=${type}&key=${this.apiKey}`;
      const response = await fetch(url);
      const data = await response.json() as any;

      if (data.status !== 'OK') {
        console.warn(`Google Places Search failed: ${data.status}`, data.error_message);
        return [];
      }

      return data.results.map((item: any) => ({
        id: item.place_id,
        name: item.name,
        address: item.vicinity,
        location: item.geometry.location,
        types: item.types,
        rating: item.rating,
        userRatingCount: item.user_ratings_total
      }));
    } catch (e) {
      console.error('Error searching nearby places:', e);
      return [];
    }
  }

  async getDetails(placeId: string): Promise<Place | null> {
    if (!this.apiKey) return null;

    try {
      const url = `https://maps.googleapis.com/maps/api/place/details/json?place_id=${placeId}&fields=name,formatted_address,geometry,type,rating,user_ratings_total,website,formatted_phone_number&key=${this.apiKey}`;
      const response = await fetch(url);
      const data = await response.json() as any;

      if (data.status !== 'OK') return null;

      const item = data.result;
      return {
        id: placeId,
        name: item.name,
        address: item.formatted_address,
        location: item.geometry.location,
        types: item.types,
        rating: item.rating,
        userRatingCount: item.user_ratings_total,
        website: item.website,
        phone: item.formatted_phone_number
      };
    } catch (e) {
      console.error('Error getting place details:', e);
      return null;
    }
  }
}
