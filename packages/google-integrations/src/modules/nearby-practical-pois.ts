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
  | 'evacuation_point'
  | 'viewpoint'
  | 'drinking_water'
  | 'campground'
  | 'dangerous_area';

export type VehicleType = 'motorcycle' | 'bicycle' | 'trekking';

export class NearbyPracticalPois {
  constructor(private readonly placesProvider: GooglePlacesProvider) {}

  async findForVehicle(location: { lat: number, lng: number }, vehicleType: VehicleType): Promise<PracticalPoi[]> {
    let categories: PracticalPoiCategory[] = [];

    if (vehicleType === 'motorcycle') {
      categories = ['parking', 'gas_station', 'viewpoint', 'restaurant', 'lodging'];
    } else if (vehicleType === 'bicycle') {
      categories = ['drinking_water', 'store', 'bicycle_store', 'dangerous_area'];
    } else if (vehicleType === 'trekking') {
      categories = ['drinking_water', 'lodging', 'campground'];
    }

    return this.findForRoutePoint(location, categories);
  }

  async findForRoutePoint(location: { lat: number, lng: number }, categories: PracticalPoiCategory[]): Promise<PracticalPoi[]> {
    const results: PracticalPoi[] = [];

    const categoryMap: Record<PracticalPoiCategory, string[]> = {
      parking: ['parking'],
      restaurant: ['restaurant', 'cafe'],
      lodging: ['lodging', 'hotel'],
      gas_station: ['gas_station'],
      store: ['store', 'supermarket'],
      bicycle_store: ['bicycle_store'],
      shelter: ['lodging'], 
      evacuation_point: ['hospital', 'police'],
      viewpoint: ['tourist_attraction'],
      drinking_water: ['cafe'], // Fallback for drinking water
      campground: ['campground'],
      dangerous_area: ['police'] // Fallback/Mock for dangerous areas
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
