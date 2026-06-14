import requests
import logging
from typing import List, Tuple, Optional
import math
import gpxpy

logger = logging.getLogger(__name__)

BROUTER_BASE_URL = "https://brouter.de/brouter"

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
    Fetches a GPX route from BRouter API for exactly the given points (1 API call).
    """
    if len(points) < 2:
        raise ValueError("At least 2 points are required to generate a route.")

    lonlats_str = "|".join([f"{lon},{lat}" for lon, lat in points])

    params = {
        "lonlats": lonlats_str,
        "profile": profile,
        "alternativeidx": 0,
        "format": "gpx"
    }
    
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
    Iteratively evaluates the route point-by-point. 
    Drops points that cause "out-and-back" spurs (U-turns).
    Returns the final, cleaned GPX by fetching the combined route of valid points.
    """
    if len(points) < 3:
        # Cannot form a U-turn with less than 3 points (Start -> End)
        return generate_gpx_from_points(points, profile)
        
    valid_points = [points[0]]
    current_idx = 1
    
    # We maintain the GPX of the "last valid segment" to compare with the "next segment"
    # To start, we generate A -> B
    last_gpx = generate_gpx_from_points([valid_points[-1], points[current_idx]], profile)
    
    while current_idx < len(points) - 1:
        next_idx = current_idx + 1
        # Generate B -> C
        next_gpx = generate_gpx_from_points([points[current_idx], points[next_idx]], profile)
        
        if detect_u_turn(last_gpx, next_gpx):
            # U-turn detected! The current point (B) is a spur.
            logger.warning(f"Spaghetti routing detected at point {points[current_idx]}. Dropping point.")
            # We don't add current_idx to valid_points.
            # Now we must recalculate A -> C to serve as the new "last_gpx" for the next iteration
            last_gpx = generate_gpx_from_points([valid_points[-1], points[next_idx]], profile)
        else:
            # Valid point! Add it to the list.
            valid_points.append(points[current_idx])
            last_gpx = next_gpx
            
        current_idx += 1
        
    # Add the final endpoint
    valid_points.append(points[-1])
    
    logger.info(f"Optimization complete. Route reduced from {len(points)} to {len(valid_points)} points.")
    
    # Generate the final continuous GPX from the cleaned valid points
    return generate_gpx_from_points(valid_points, profile)

