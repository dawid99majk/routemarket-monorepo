import { GeometryBodySchema } from "../schemas.js";
import { readJson } from "../http.js";
import { GoogleRoutesRoutingProvider } from "@routemarket/atlas-gis/src/routing/google-routes-provider.js";
import { buildGpxXml } from "@routemarket/atlas-gis/src/gpx-builder.js";

function calculateDistance(lat1: number, lon1: number, lat2: number, lon2: number) {
  const p = 0.017453292519943295;
  const c = Math.cos;
  const a = 0.5 - c((lat2 - lat1) * p)/2 + c(lat1 * p) * c(lat2 * p) * (1 - c((lon2 - lon1) * p))/2;
  return 12742 * Math.asin(Math.sqrt(a)); 
}

function expandWaypoints(waypoints: {lat: number, lng: number}[], targetDistanceKm: number) {
  if (waypoints.length < 2) return waypoints;
  let totalDirect = 0;
  for (let i = 0; i < waypoints.length - 1; i++) {
    totalDirect += calculateDistance(waypoints[i].lat, waypoints[i].lng, waypoints[i+1].lat, waypoints[i+1].lng);
  }
  if (totalDirect >= targetDistanceKm * 0.9) return waypoints;

  const expanded = [waypoints[0]];
  for (let i = 0; i < waypoints.length - 1; i++) {
    const start = waypoints[i];
    const end = waypoints[i+1];
    const midLat = (start.lat + end.lat) / 2;
    const midLng = (start.lng + end.lng) / 2;
    const dx = end.lng - start.lng;
    const dy = end.lat - start.lat;
    const length = Math.sqrt(dx*dx + dy*dy);
    
    if (length > 0) {
      const nx = -dy / length;
      const ny = dx / length;
      const segmentTarget = targetDistanceKm * (calculateDistance(start.lat, start.lng, end.lat, end.lng) / totalDirect);
      const segmentDirect = calculateDistance(start.lat, start.lng, end.lat, end.lng);
      const requiredHeightKm = Math.sqrt(Math.max(0, Math.pow(segmentTarget/2, 2) - Math.pow(segmentDirect/2, 2)));
      
      const latRatio = 111;
      const lngRatio = 111 * Math.cos((midLat * Math.PI) / 180);
      const offsetLat = (ny * requiredHeightKm) / latRatio;
      const offsetLng = (nx * requiredHeightKm) / lngRatio;
      
      expanded.push({ lat: midLat + offsetLat, lng: midLng + offsetLng });
    }
    expanded.push(end);
  }
  return expanded;
}

export const geometryHandler = async ({ req }: any) => {
  const body = GeometryBodySchema.parse(await readJson(req));
  const expandedWaypoints = expandWaypoints(body.waypoints, body.targetDistance);
  
  const provider = new GoogleRoutesRoutingProvider();
  const result = await provider.getRoute(expandedWaypoints as any, body.category as any);
  const gpx = buildGpxXml(result);

  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !supabaseKey) throw new Error("Missing Supabase credentials");

  const fileName = `generated-${Date.now()}.gpx`;
  let response = await fetch(`${supabaseUrl}/storage/v1/object/routes-gpx/${fileName}`, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${supabaseKey}`,
      "Content-Type": "application/gpx+xml",
    },
    body: gpx
  });

  if (response.status === 404) {
    // Create bucket if it doesn't exist
    await fetch(`${supabaseUrl}/storage/v1/bucket`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${supabaseKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ id: "routes-gpx", name: "routes-gpx", public: true })
    });
    
    // Retry upload
    response = await fetch(`${supabaseUrl}/storage/v1/object/routes-gpx/${fileName}`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${supabaseKey}`,
        "Content-Type": "application/gpx+xml",
      },
      body: gpx
    });
  }

  if (!response.ok) throw new Error("Supabase upload failed: " + await response.text());

  return {
    url: `${supabaseUrl}/storage/v1/object/public/routes-gpx/${fileName}`,
    distanceKm: result.distanceKm,
    geometry: result.geometryGeoJson
  };
};
