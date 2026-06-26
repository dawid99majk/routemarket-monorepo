import requests
import logging
from typing import List, Tuple, Optional
import math
import gpxpy

logger = logging.getLogger(__name__)

BROUTER_BASE_URL = "https://brouter.de/brouter"

def decode_polyline(polyline_str: str) -> List[Tuple[float, float]]:
    """Decodes a Google Maps encoded polyline into a list of (lon, lat) tuples."""
    index, len_str = 0, len(polyline_str)
    lat, lng = 0, 0
    coordinates = []

    while index < len_str:
        # Latitude
        shift, result = 0, 0
        while True:
            char = polyline_str[index]
            byte = ord(char) - 63
            index += 1
            result |= (byte & 0x1f) << shift
            shift += 5
            if byte < 0x20:
                break
        d_lat = ~(result >> 1) if (result & 1) else (result >> 1)
        lat += d_lat

        # Longitude
        shift, result = 0, 0
        while True:
            char = polyline_str[index]
            byte = ord(char) - 63
            index += 1
            result |= (byte & 0x1f) << shift
            shift += 5
            if byte < 0x20:
                break
        d_lng = ~(result >> 1) if (result & 1) else (result >> 1)
        lng += d_lng

        # Google polyline coordinates are (lat, lng), we return (lon, lat) for GPX
        coordinates.append((lng / 100000.0, lat / 100000.0))

    return coordinates

def coordinates_to_gpx(coords: List[Tuple[float, float]], title: str = "Trasa Google Maps") -> str:
    points_xml = []
    for lon, lat in coords:
        points_xml.append(f'      <trkpt lat="{lat}" lon="{lon}"></trkpt>')
    points_str = "\n".join(points_xml)
    return f"""<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="RouteMarket" xmlns="http://www.topografix.com/GPX/1/1">
  <trk>
    <name>{title}</name>
    <trkseg>
{points_str}
    </trkseg>
  </trk>
</gpx>"""

def haversine_distance(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Calculate the great circle distance in meters between two points on the earth."""
    R = 6371000  # radius of Earth in meters
    phi1 = math.radians(lat1)
    phi2 = math.radians(lat2)
    delta_phi = math.radians(lat2 - lat1)
    delta_lambda = math.radians(lon2 - lon1)

    a = math.sin(delta_phi / 2.0)**2 + \
        math.cos(phi1) * math.cos(phi2) * math.sin(delta_lambda / 2.0)**2
    c = 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))

    return R * c

def detect_u_turn(gpx_str_1: str, gpx_str_2: str) -> bool:
    """
    Analyzes two GPX strings (A->B and B->C).
    Returns True if B is a dead-end spur (i.e. the start of B->C retraces the end of A->B).
    """
    try:
        gpx1 = gpxpy.parse(gpx_str_1)
        gpx2 = gpxpy.parse(gpx_str_2)
    except Exception as e:
        logger.error(f"Failed to parse GPX for U-turn detection: {e}")
        return False
        
    pts1 = []
    for track in gpx1.tracks:
        for segment in track.segments:
            for point in segment.points:
                pts1.append(point)
                
    pts2 = []
    for track in gpx2.tracks:
        for segment in track.segments:
            for point in segment.points:
                pts2.append(point)
                
    if len(pts1) < 5 or len(pts2) < 5:
        return False
        
    # Last 4 points of segment 1 (excluding the very last point which is the junction B)
    # Reverse so we check backwards from B: pts1[-2], pts1[-3]...
    tail = pts1[-5:-1]
    tail.reverse() 
    
    # First 4 points of segment 2 (excluding the very first point B)
    head = pts2[1:5]
    
    matches = 0
    for p1, p2 in zip(tail, head):
        dist = haversine_distance(p1.latitude, p1.longitude, p2.latitude, p2.longitude)
        if dist < 20: # If the track points are within 20 meters, it's the exact same road
            matches += 1
            
    # If at least 3 consecutive track points retrace the same path, it's a dead-end spur
    return matches >= 3

def generate_gpx_from_points(
    points: List[Tuple[float, float]], 
    profile: str = "trekking", 
    output_file: Optional[str] = None
) -> str:
    """
    Fetches a GPX route for exactly the given points.
    Attempts OpenRouteService first (if key exists), then GraphHopper (if key exists), 
    and falls back to BRouter.
    """
    import os
    if len(points) < 2:
        raise ValueError("At least 2 points are required to generate a route.")

    ors_key = os.getenv("OPENROUTESERVICE_API_KEY")
    gh_key = os.getenv("GRAPHHOPPER_API_KEY")
    google_key = os.getenv("GOOGLE_MAPS_API_KEY")
    
    # 0. Try Google Maps Directions API for car/motorcycle routing
    if (profile.lower() in ["car", "motorcycle"]) and google_key:
        logger.info(f"Trying Google Maps Directions API for {profile} routing with {len(points)} points...")
        try:
            origin = f"{points[0][1]},{points[0][0]}"
            destination = f"{points[-1][1]},{points[-1][0]}"
            waypoints_list = []
            if len(points) > 2:
                for lon, lat in points[1:-1]:
                    waypoints_list.append(f"{lat},{lon}")
            
            params = {
                "origin": origin,
                "destination": destination,
                "mode": "driving",
                "key": google_key
            }
            if waypoints_list:
                params["waypoints"] = "|".join(waypoints_list)
                
            url = "https://maps.googleapis.com/maps/api/directions/json"
            res = requests.get(url, params=params, timeout=25)
            res.raise_for_status()
            data = res.json()
            
            if data.get("status") == "OK" and data.get("routes"):
                encoded_poly = data["routes"][0]["overview_polyline"]["points"]
                decoded_coords = decode_polyline(encoded_poly)
                gpx_data = coordinates_to_gpx(decoded_coords)
                logger.info("Google Maps routing successful.")
                if output_file:
                    with open(output_file, "w", encoding="utf-8") as f:
                        f.write(gpx_data)
                return gpx_data
            else:
                logger.warning(f"Google Maps Directions API returned status: {data.get('status')}. Trying ORS...")
        except Exception as e:
            logger.warning(f"Google Maps routing failed: {e}. Trying ORS...")
            
    # 1. Try OpenRouteService
    if ors_key:
        # Map profiles to ORS
        ors_profile_map = {
            "car": "driving-car",
            "motorcycle": "driving-car",
            "road": "cycling-road",
            "gravel": "cycling-mountain",
            "mtb": "cycling-mountain",
            "hiking": "foot-hiking",
            "city": "foot-walking",
            "city_walk": "foot-walking"
        }
        ors_profile = ors_profile_map.get(profile.lower(), "cycling-mountain")
        
        # Coordinates in ORS are [lng, lat]
        coords = [[lon, lat] for lon, lat in points]
        
        url = f"https://api.openrouteservice.org/v2/directions/{ors_profile}/gpx"
        headers = {
            "Content-Type": "application/json",
            "Authorization": ors_key,
            "Accept": "application/gpx+xml, application/json, application/geo+json"
        }
        body = {
            "coordinates": coords,
            "elevation": True,
            "radiuses": [3000] * len(points)
        }
        
        logger.info(f"Trying ORS routing via profile={ors_profile} for {len(points)} points...")
        try:
            res = requests.post(url, json=body, headers=headers, timeout=25)
            res.raise_for_status()
            gpx_data = res.text
            if gpx_data.strip().startswith("<?xml"):
                logger.info("ORS routing successful.")
                if output_file:
                    with open(output_file, "w", encoding="utf-8") as f:
                        f.write(gpx_data)
                return gpx_data
            else:
                logger.warning("ORS did not return valid XML GPX. Trying GraphHopper...")
        except Exception as e:
            logger.warning(f"ORS routing failed: {e}. Trying GraphHopper...")
            
    # 2. Try GraphHopper
    if gh_key:
        # Map profiles to GraphHopper
        gh_profile_map = {
            "car": "car",
            "motorcycle": "car",
            "road": "bike",
            "gravel": "bike",
            "mtb": "bike",
            "hiking": "foot",
            "city": "foot",
            "city_walk": "foot"
        }
        gh_profile = gh_profile_map.get(profile.lower(), "bike")
        
        # Down-sample points to 5 max points for GraphHopper free tier limit
        gh_points = points
        if len(points) > 5:
            idx_1 = int(round((len(points) - 1) * 0.25))
            idx_2 = int(round((len(points) - 1) * 0.5))
            idx_3 = int(round((len(points) - 1) * 0.75))
            indices = sorted(list(set([0, idx_1, idx_2, idx_3, len(points) - 1])))
            gh_points = [points[i] for i in indices]
            logger.info(f"GraphHopper: Down-sampled {len(points)} points to {len(gh_points)}")

        # Coordinates in GraphHopper GET requests are point=lat,lon
        params = [
            ("profile", gh_profile),
            ("locale", "pl"),
            ("points_encoded", "false"),
            ("instructions", "false"),
            ("elevation", "true"),
            ("type", "gpx"),
            ("key", gh_key)
        ]
        for lon, lat in gh_points:
            params.append(("point", f"{lat},{lon}"))
            
        url = "https://graphhopper.com/api/1/route"
        logger.info(f"Trying GraphHopper routing via profile={gh_profile} for {len(gh_points)} points...")
        try:
            res = requests.get(url, params=params, timeout=25)
            res.raise_for_status()
            gpx_data = res.text
            if gpx_data.strip().startswith("<?xml"):
                logger.info("GraphHopper routing successful.")
                if output_file:
                    with open(output_file, "w", encoding="utf-8") as f:
                        f.write(gpx_data)
                return gpx_data
            else:
                logger.warning("GraphHopper did not return valid XML GPX. Trying BRouter...")
        except Exception as e:
            logger.warning(f"GraphHopper routing failed: {e}. Trying BRouter...")

    # 3. Fallback to BRouter
    lonlats_str = "|".join([f"{lon},{lat}" for lon, lat in points])
    profile_mapping = {
        "car": "car-fast",
        "motorcycle": "car-fast",
        "road": "fastbike",
        "gravel": "trekking",
        "hiking": "shortest",
        "city": "shortest",
        "city_walk": "shortest"
    }
    brouter_profile = profile_mapping.get(profile.lower(), "trekking")

    params = {
        "lonlats": lonlats_str,
        "profile": brouter_profile,
        "alternativeidx": 0,
        "format": "gpx"
    }
    
    logger.info(f"Falling back to BRouter routing via profile={brouter_profile} for {len(points)} points...")
    try:
        response = requests.get(BROUTER_BASE_URL, params=params, timeout=30)
        response.raise_for_status()
    except requests.RequestException as e:
        logger.error(f"BRouter API error: {e}")
        if e.response is not None:
            logger.error(f"Response: {e.response.text}")
        raise RuntimeError(f"Failed to fetch route from BRouter API: {e}")

    gpx_data = response.text
    if not gpx_data.strip().startswith("<?xml"):
        raise RuntimeError(f"BRouter returned an error instead of GPX: {gpx_data[:200]}")

    if output_file:
        with open(output_file, "w", encoding="utf-8") as f:
            f.write(gpx_data)

    return gpx_data

def optimize_and_generate_gpx(
    points: List[Tuple[float, float]], 
    profile: str = "trekking"
) -> str:
    """
    Since we migrated to hard geocoding via Nominatim, we no longer need the U-Turn 
    detector to drop hallucinated points. Out-and-back spurs to real peaks (like Śnieżka) 
    are now legitimate and should be kept.
    """
    logger.info(f"Generating route for {len(points)} verified coordinates without U-Turn dropping.")
    return generate_gpx_from_points(points, profile)

