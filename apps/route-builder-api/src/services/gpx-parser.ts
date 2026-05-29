export class GpxParserService {
  parseGpx(gpxXml: string): { trackPoints: [number, number][]; distance_km: number; name: string } {
    const trackPoints: [number, number][] = [];
    // Obsługa różnych wariantów spacji i kolejności lat/lon
    const trkptRegex = /<trkpt\s+[^>]*lat=["']([^"']+)["']\s+[^>]*lon=["']([^"']+)["']|<trkpt\s+[^>]*lon=["']([^"']+)["']\s+[^>]*lat=["']([^"']+)["']/g;
    
    let match;
    while ((match = trkptRegex.exec(gpxXml)) !== null) {
      if (match[1] && match[2]) {
        trackPoints.push([parseFloat(match[1]), parseFloat(match[2])]);
      } else if (match[3] && match[4]) {
        trackPoints.push([parseFloat(match[4]), parseFloat(match[3])]);
      }
    }

    const nameRegex = /<name>(.*?)<\/name>/;
    const nameMatch = gpxXml.match(nameRegex);
    const name = nameMatch ? nameMatch[1] : 'Wgrana trasa';

    let totalDistance = 0;
    for (let i = 0; i < trackPoints.length - 1; i++) {
      totalDistance += this.haversine(trackPoints[i], trackPoints[i + 1]);
    }

    return {
      trackPoints,
      distance_km: parseFloat(totalDistance.toFixed(2)),
      name
    };
  }

  private haversine(p1: [number, number], p2: [number, number]): number {
    const R = 6371; // km
    const dLat = this.toRad(p2[0] - p1[0]);
    const dLon = this.toRad(p2[1] - p1[1]);
    const lat1 = this.toRad(p1[0]);
    const lat2 = this.toRad(p2[0]);

    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.sin(dLon / 2) * Math.sin(dLon / 2) * Math.cos(lat1) * Math.cos(lat2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  }

  private toRad(value: number): number {
    return (value * Math.PI) / 180;
  }
}

export const gpxParserService = new GpxParserService();
