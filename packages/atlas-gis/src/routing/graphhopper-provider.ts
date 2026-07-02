import type { RoutingProvider, RoutingProfile, RoutingResult, Waypoint } from './types.js';

export class GraphHopperRoutingProvider implements RoutingProvider {
  private readonly apiKey: string;
  private readonly baseUrl = 'https://graphhopper.com/api/1/route';

  constructor(apiKey?: string) {
    this.apiKey = apiKey || process.env.GRAPHHOPPER_API_KEY || '';
  }

  async getRoute(waypoints: Waypoint[], profile: RoutingProfile): Promise<RoutingResult> {
    if (!this.apiKey) {
      throw new Error('GraphHopper API key is missing. Please provide it in constructor or set GRAPHHOPPER_API_KEY env variable.');
    }

    if (waypoints.length < 2) {
      throw new Error('At least two waypoints are required to generate a route.');
    }

    const maxPointsPerRequest = 5;
    
    // Chunking logic to bypass GraphHopper's 5-location free tier limit
    // We need to overlap by 1 point so the segments connect smoothly
    const chunks: Waypoint[][] = [];
    const step = maxPointsPerRequest - 1;
    for (let i = 0; i < waypoints.length - 1; i += step) {
        chunks.push(waypoints.slice(i, i + maxPointsPerRequest));
    }

    let totalDistanceKm = 0;
    let totalEstimatedTimeH = 0;
    let allCoordinates: number[][] = [];
    let allResultPoints: Waypoint[] = [];

    for (let chunkIndex = 0; chunkIndex < chunks.length; chunkIndex++) {
        const chunk = chunks[chunkIndex];
        const ghProfile = this.mapProfile(profile);
        
        const url = new URL(this.baseUrl);
        url.searchParams.set('key', this.apiKey);

        const body = {
          points: chunk.map(w => [w.lng, w.lat]),
          profile: ghProfile,
          locale: 'en',
          points_encoded: false,
          instructions: false,
          elevation: true
        };

        const response = await fetch(url.toString(), {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(body)
        });

        if (!response.ok) {
          const errorText = await response.text();
          throw new Error(`GraphHopper API error (${response.status}): ${errorText}`);
        }

        const data = await response.json() as any;
        
        if (!data.paths || data.paths.length === 0) {
          throw new Error('GraphHopper returned no paths for the given waypoints.');
        }

        const path = data.paths[0];
        const coordinates = path.points.coordinates as number[][];
        
        const resultPoints: Waypoint[] = coordinates.map(coord => {
          const wp: Waypoint & { ele?: number } = {
            lng: coord[0],
            lat: coord[1]
          };
          if (coord.length > 2) {
            wp.ele = coord[2];
          }
          return wp;
        });

        // To avoid duplicate coordinates at the stitch points
        if (chunkIndex > 0) {
            allCoordinates.push(...coordinates.slice(1));
            allResultPoints.push(...resultPoints.slice(1));
        } else {
            allCoordinates.push(...coordinates);
            allResultPoints.push(...resultPoints);
        }

        totalDistanceKm += Math.round((path.distance / 1000) * 100) / 100;
        totalEstimatedTimeH += Math.round((path.time / 3600000) * 100) / 100;
    }

    return {
      points: allResultPoints,
      distanceKm: Math.round(totalDistanceKm * 100) / 100,
      estimatedTimeH: Math.round(totalEstimatedTimeH * 100) / 100,
      geometryGeoJson: {
        type: 'LineString',
        coordinates: allCoordinates
      }
    };
  }

  private mapProfile(profile: RoutingProfile): string {
    switch (profile) {
      case 'motorcycle': return 'motorcycle';
      case 'bike': return 'bike';
      case 'hiking': return 'foot';
      default: return 'foot';
    }
  }

}
