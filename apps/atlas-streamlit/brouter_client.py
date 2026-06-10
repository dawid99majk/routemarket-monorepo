import requests
import json
import logging
from typing import List, Tuple, Optional

logger = logging.getLogger(__name__)

BROUTER_BASE_URL = "https://brouter.de/brouter"

def generate_gpx_from_points(
    points: List[Tuple[float, float]], 
    profile: str = "trekking", 
    output_file: Optional[str] = None
) -> str:
    """
    Fetches a GPX route from BRouter API based on a list of (longitude, latitude) points.
    
    Args:
        points: List of tuples (longitude, latitude)
        profile: BRouter profile name (e.g., 'trekking', 'hiking-mountain', 'fastbike')
        output_file: Optional path to save the .gpx file.
        
    Returns:
        String containing the GPX XML data.
        
    Raises:
        RuntimeError: If the API request fails.
    """
    if len(points) < 2:
        raise ValueError("At least 2 points are required to generate a route.")

    # Format points for the API: lon1,lat1|lon2,lat2|...
    lonlats_str = "|".join([f"{lon},{lat}" for lon, lat in points])

    params = {
        "lonlats": lonlats_str,
        "profile": profile,
        "alternativeidx": 0,
        "format": "gpx"
    }

    logger.info(f"Requesting BRouter route with profile: {profile} for {len(points)} points.")
    
    try:
        response = requests.get(BROUTER_BASE_URL, params=params, timeout=30)
        response.raise_for_status()
    except requests.RequestException as e:
        logger.error(f"BRouter API error: {e}")
        if e.response is not None:
            logger.error(f"Response: {e.response.text}")
        raise RuntimeError(f"Failed to fetch route from BRouter API: {e}")

    gpx_data = response.text
    
    # BRouter sometimes returns errors as plain text instead of HTTP error codes
    if not gpx_data.strip().startswith("<?xml"):
        raise RuntimeError(f"BRouter returned an error instead of GPX: {gpx_data[:200]}")

    if output_file:
        with open(output_file, "w", encoding="utf-8") as f:
            f.write(gpx_data)
        logger.info(f"GPX route saved to {output_file}")

    return gpx_data

# Example usage:
# if __name__ == "__main__":
#     # Karpacz to Śnieżka
#     pts = [(15.7533, 50.7765), (15.7396, 50.7359)]
#     print(generate_gpx_from_points(pts, output_file="test.gpx"))
