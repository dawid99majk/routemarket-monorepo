export interface GpxAnalysis {
  distanceKm: number;
  elevationGainM: number;
  elevationLossM: number;
  maxElevationM: number;
  minElevationM: number;
  averageSlopePercent: number;
  maxSlopePercent: number;
  points: { lat: number, lng: number, ele?: number }[];
}

export function analyzeGpxXml(xml: string): GpxAnalysis {
  const points: { lat: number, lng: number, ele?: number }[] = [];
  
  // Basic parsing
  const trkptRegex = /<trkpt lat="([-0-9.]+)" lon="([-0-9.]+)">([\s\S]*?)<\/trkpt>/g;
  let match;
  while ((match = trkptRegex.exec(xml)) !== null) {
    const lat = parseFloat(match[1]);
    const lng = parseFloat(match[2]);
    const eleMatch = match[3].match(/<ele>([-0-9.]+)<\/ele>/);
    const ele = eleMatch ? parseFloat(eleMatch[1]) : undefined;
    points.push({ lat, lng, ele });
  }

  let distanceKm = 0;
  let elevationGainM = 0;
  let elevationLossM = 0;
  let maxElevationM = -Infinity;
  let minElevationM = Infinity;

  for (let i = 1; i < points.length; i++) {
    const p1 = points[i-1];
    const p2 = points[i];
    
    distanceKm += haversineDistance(p1.lat, p1.lng, p2.lat, p2.lng);
    
    if (p1.ele !== undefined && p2.ele !== undefined) {
      const diff = p2.ele - p1.ele;
      if (diff > 0) elevationGainM += diff;
      else elevationLossM += Math.abs(diff);
      
      maxElevationM = Math.max(maxElevationM, p1.ele, p2.ele);
      minElevationM = Math.min(minElevationM, p1.ele, p2.ele);
    }
  }

  return {
    distanceKm,
    elevationGainM,
    elevationLossM,
    maxElevationM: maxElevationM === -Infinity ? 0 : maxElevationM,
    minElevationM: minElevationM === Infinity ? 0 : minElevationM,
    averageSlopePercent: distanceKm > 0 ? (elevationGainM / (distanceKm * 1000)) * 100 : 0,
    maxSlopePercent: 0, // Simplified
    points
  };
}

function haversineDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}
