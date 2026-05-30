export class GpxParserService {
  parseGpx(gpxXml: string): { trackPoints: [number, number][]; distance_km: number; name: string } {
    const trackPoints = this.extractPoints(gpxXml);

    const nameRegex = /<name[^>]*>([\s\S]*?)<\/name>/i;
    const nameMatch = gpxXml.match(nameRegex);
    const name = nameMatch ? this.decodeXml(nameMatch[1].trim()) : 'Wgrana trasa';

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

  private extractPoints(gpxXml: string): [number, number][] {
    const points: [number, number][] = [];
    const tagRegex = /<(?:(?:\w+:)?)(trkpt|rtept|wpt)\b([^>]*)>/gi;
    let match: RegExpExecArray | null;

    while ((match = tagRegex.exec(gpxXml)) !== null) {
      const attrs = match[2] || '';
      const lat = this.readNumericAttribute(attrs, 'lat');
      const lon = this.readNumericAttribute(attrs, 'lon') ?? this.readNumericAttribute(attrs, 'lng');
      if (lat === null || lon === null) continue;
      if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;
      if (Math.abs(lat) > 90 || Math.abs(lon) > 180) continue;

      const previous = points[points.length - 1];
      if (!previous || previous[0] !== lat || previous[1] !== lon) {
        points.push([lat, lon]);
      }
    }

    return points;
  }

  private readNumericAttribute(attrs: string, attrName: string): number | null {
    const regex = new RegExp(`\\b${attrName}\\s*=\\s*["']([^"']+)["']`, 'i');
    const match = attrs.match(regex);
    if (!match) return null;
    const value = Number.parseFloat(match[1].replace(',', '.'));
    return Number.isFinite(value) ? value : null;
  }

  private decodeXml(value: string): string {
    return value
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&apos;/g, "'");
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
