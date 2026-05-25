import { readFile } from "node:fs/promises";

export type GpxValidationResult = {
  valid: boolean;
  errors: string[];
  warnings: string[];
  trackPointCount: number;
  stats?: {
    distanceKm: number;
    elevationGainM: number;
  };
};

export async function validateGpxFile(path: string): Promise<GpxValidationResult> {
  const xml = await readFile(path, "utf8");
  return validateGpxXml(xml);
}

export function validateGpxXml(xml: string): GpxValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  
  if (!xml.includes("<gpx")) errors.push("Brak elementu głównego <gpx>.");
  if (!xml.includes("</gpx>")) errors.push("Brak zamknięcia </gpx>.");
  
  const coords = extractRouteCoordinates(xml);
  const trackPointCount = coords.length;
  
  if (trackPointCount < 2) {
    errors.push("Zbyt mało punktów trasy (wymagane min. 2).");
  }

  for (let i = 1; i < coords.length; i++) {
    const dist = haversineDistance(coords[i-1][0], coords[i-1][1], coords[i][0], coords[i][1]);
    if (dist > 50) { // Jump larger than 50km between consecutive points
      errors.push(`Wykryto nienaturalny skok trasy (${dist.toFixed(1)} km) między punktem ${i} a ${i+1}.`);
      break;
    }
  }

  if (!xml.includes("<ele>")) {
    warnings.push("Brak danych o wysokości n.p.m. (<ele>).");
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    trackPointCount
  };
}

function extractRouteCoordinates(xml: string): Array<[number, number]> {
  const coords: Array<[number, number]> = [];
  const routePointRegex = /<(?:trkpt|rtept)\b([^>]*)>/gi;
  let match: RegExpExecArray | null;

  while ((match = routePointRegex.exec(xml)) !== null) {
    const attrs = match[1] ?? "";
    const lat = Number(attrs.match(/\blat="([-0-9.]+)"/i)?.[1]);
    const lon = Number(attrs.match(/\blon="([-0-9.]+)"/i)?.[1]);
    if (Number.isFinite(lat) && Number.isFinite(lon)) {
      coords.push([lat, lon]);
    }
  }

  if (coords.length > 0) return coords;

  const fallbackRegex = /\blat="([-0-9.]+)"\s+\blon="([-0-9.]+)"/gi;
  while ((match = fallbackRegex.exec(xml)) !== null) {
    const lat = Number(match[1]);
    const lon = Number(match[2]);
    if (Number.isFinite(lat) && Number.isFinite(lon)) {
      coords.push([lat, lon]);
    }
  }

  return coords;
}

function haversineDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371; // km
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}
