import { GooglePlacesProvider, Place } from './places.js';

export interface PracticalPoi extends Place {
  distanceFromRoute?: number;
  verifiedStatus: 'verified' | 'likely' | 'needs_review';
  suitabilityForPublic: boolean;
}

export type PracticalPoiCategory = 
  | 'parking'
  | 'restaurant'
  | 'lodging'
  | 'gas_station'
  | 'store'
  | 'bicycle_store'
  | 'shelter'
  | 'evacuation_point';

export class NearbyPracticalPois {
  constructor(private readonly placesProvider: GooglePlacesProvider) {}

  async findForRoutePoint(location: { lat: number, lng: number }, categories: PracticalPoiCategory[]): Promise<PracticalPoi[]> {
    const results: PracticalPoi[] = [];

    const categoryMap: Record<PracticalPoiCategory, string[]> = {
      parking: ['parking'],
      restaurant: ['restaurant', 'cafe'],
      lodging: ['lodging', 'hotel', 'campground'],
      gas_station: ['gas_station'],
      store: ['store', 'supermarket'],
      bicycle_store: ['bicycle_store'],
      shelter: ['lodging'], // Fallback
      evacuation_point: ['hospital', 'police']
    };

    for (const category of categories) {
      const types = categoryMap[category];
      for (const type of types) {
        const places = await this.placesProvider.searchNearby(location, 2000, type);
        results.push(...places.map(p => ({
          ...p,
          verifiedStatus: 'likely' as const,
          suitabilityForPublic: p.rating ? p.rating >= 3.5 : true
        })));
      }
    }

    // Deduplicate
    return Array.from(new Map(results.map(p => [p.id, p])).values());
  }
}
