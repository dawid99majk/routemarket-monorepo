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

    # Map frontend profiles to BRouter profiles
    profile_mapping = {
        "road": "fastbike",
        "gravel": "trekking",
        "hiking": "shortest"
    }
    brouter_profile = profile_mapping.get(profile.lower(), "trekking")

    params = {
        "lonlats": lonlats_str,
        "profile": brouter_profile,
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
    Since we migrated to hard geocoding via Nominatim, we no longer need the U-Turn 
    detector to drop hallucinated points. Out-and-back spurs to real peaks (like Śnieżka) 
    are now legitimate and should be kept.
    """
    logger.info(f"Generating route for {len(points)} verified coordinates without U-Turn dropping.")
    return generate_gpx_from_points(points, profile)

