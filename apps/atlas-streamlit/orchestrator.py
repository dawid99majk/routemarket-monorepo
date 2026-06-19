import logging
import requests
import urllib.parse
import math
from typing import Dict, Any, List, Tuple, Optional
from ai_agent import deep_researcher, route_planner, guide_writer
from brouter_client import optimize_and_generate_gpx

logger = logging.getLogger(__name__)

def geocode_osm(query: str, fallback_name: str, bias_point: Optional[Tuple[float, float]] = None) -> Tuple[float, float]:
    """
    Fetches exact longitude and latitude from OpenStreetMap Nominatim.
    If the precise query fails, falls back to the simple name.
    If bias_point is provided (lon, lat), sorts multiple Nominatim hits by distance and picks the closest one.
    Returns (longitude, latitude) or raises ValueError.
    """
    headers = {"User-Agent": "RouteMarket-AI/1.0"}
    
    def fetch_all_hits(q: str):
        limit = 10 if bias_point else 1
        url = f"https://nominatim.openstreetmap.org/search?q={urllib.parse.quote(q)}&format=json&limit={limit}"
        response = requests.get(url, headers=headers, timeout=10)
        response.raise_for_status()
        return response.json()

    def get_closest_hit(data):
        if not data or len(data) == 0:
            return None
        if not bias_point or len(data) == 1:
            return float(data[0]['lon']), float(data[0]['lat'])
            
        # Haversine distance helper
        bias_lon, bias_lat = bias_point
        
        closest_hit = None
        min_dist = float('inf')
        for hit in data:
            try:
                lon = float(hit['lon'])
                lat = float(hit['lat'])
                
                # Haversine formula
                R = 6371.0 # earth radius in km
                phi1 = math.radians(bias_lat)
                phi2 = math.radians(lat)
                delta_phi = math.radians(lat - bias_lat)
                delta_lambda = math.radians(lon - bias_lon)
                
                a = math.sin(delta_phi / 2.0)**2 + \
                    math.cos(phi1) * math.cos(phi2) * math.sin(delta_lambda / 2.0)**2
                c = 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))
                dist = R * c
                
                if dist < min_dist:
                    min_dist = dist
                    closest_hit = (lon, lat)
            except Exception:
                continue
        return closest_hit if closest_hit else (float(data[0]['lon']), float(data[0]['lat']))

    logger.info(f"Geocoding: {query} (bias: {bias_point})")
    try:
        hits = fetch_all_hits(query)
        coords = get_closest_hit(hits)
        if coords:
            return coords
            
        logger.warning(f"Geocoding failed for '{query}'. Trying fallback: '{fallback_name}'")
        hits = fetch_all_hits(fallback_name)
        coords = get_closest_hit(hits)
        if coords:
            return coords
            
    except Exception as e:
        logger.error(f"Geocoding API error for '{query}': {e}")
        
    raise ValueError(f"Nie udało się odnaleźć na mapie punktu: '{query}'.")

class Orchestrator:
    @staticmethod
    def run_generation_pipeline(chat_history: List[Dict[str, str]], profile: str = "trekking") -> Dict[str, Any]:
        """
        Executes the heavy lifting pipeline once the chat interview is done:
        1. Deep Research
        2. Route Planning (POIs extraction)
        3. GPX Generation
        4. Guidebook Writing
        """
        logger.info("Starting generation pipeline...")
        
        # Step 1: Deep Research
        logger.info("Step 1: Deep Research with Google Search")
        research_context = deep_researcher(chat_history)
        
        # Step 2: Route Planning
        logger.info("Step 2: Route Planning (POIs extraction)")
        route_plan = route_planner(research_context, chat_history)
        
        if len(route_plan.points) < 2:
            raise ValueError("Route Planner nie mógł wyznaczyć minimum 2 punktów na podstawie researchu.")
            
        coords = []
        bias_point = None
        for pt in route_plan.points:
            # Resolving coordinates via Nominatim OSM with fallback
            try:
                lon, lat = geocode_osm(pt.search_query, pt.name, bias_point=bias_point)
                coords.append((lon, lat))
                if not bias_point:
                    bias_point = (lon, lat)
            except ValueError as e:
                logger.warning(f"Dropping point {pt.name} due to geocoding failure: {e}")
                
        if len(coords) < 2:
            raise ValueError("Po weryfikacji geograficznej zostało za mało punktów by wyznaczyć trasę.")
        
        # Safeguard (Filter out points > 120 km from start)
        if len(coords) >= 2:
            start_lon, start_lat = coords[0]
            filtered_coords = [coords[0]]
            for lon, lat in coords[1:]:
                # Calculate distance to start
                R = 6371.0
                phi1 = math.radians(start_lat)
                phi2 = math.radians(lat)
                delta_phi = math.radians(lat - start_lat)
                delta_lambda = math.radians(lon - start_lon)
                a = math.sin(delta_phi / 2.0)**2 + \
                    math.cos(phi1) * math.cos(phi2) * math.sin(delta_lambda / 2.0)**2
                c = 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))
                dist = R * c
                if dist > 120.0:
                    logger.warning(f"Dropping coordinate ({lon}, {lat}) because it is too far from start point ({dist:.1f} km > 120 km)")
                else:
                    filtered_coords.append((lon, lat))
            coords = filtered_coords

        if len(coords) < 2:
            raise ValueError("Po odrzuceniu zbyt odległych punktów zostało za mało lokalizacji by wyznaczyć trasę.")

        # Step 3: GPX Generation (with Optimization loop)
        logger.info("Step 3: BRouter GPX Generation (with Point Optimization)")
        gpx_data = optimize_and_generate_gpx(coords, profile=profile)
        
        # Step 4: Guidebook Writing
        logger.info("Step 4: Guidebook Writing")
        guide_md = guide_writer(research_context, route_plan)
        
        return {
            "title": route_plan.title,
            "description": route_plan.description,
            "points": route_plan.model_dump()["points"],
            "gpx": gpx_data,
            "guide": guide_md
        }
