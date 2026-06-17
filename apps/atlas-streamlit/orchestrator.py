import logging
import requests
import urllib.parse
from typing import Dict, Any, List, Tuple
from ai_agent import deep_researcher, route_planner, guide_writer
from brouter_client import optimize_and_generate_gpx

logger = logging.getLogger(__name__)

def geocode_osm(query: str, fallback_name: str) -> Tuple[float, float]:
    """
    Fetches exact longitude and latitude from OpenStreetMap Nominatim.
    If the precise query fails, falls back to the simple name.
    Returns (longitude, latitude) or raises ValueError.
    """
    headers = {"User-Agent": "RouteMarket-AI/1.0"}
    
    def fetch(q: str):
        url = f"https://nominatim.openstreetmap.org/search?q={urllib.parse.quote(q)}&format=json&limit=1"
        response = requests.get(url, headers=headers, timeout=10)
        response.raise_for_status()
        data = response.json()
        if data and len(data) > 0:
            return float(data[0]['lon']), float(data[0]['lat'])
        return None

    logger.info(f"Geocoding: {query}")
    try:
        coords = fetch(query)
        if coords:
            return coords
            
        logger.warning(f"Geocoding failed for '{query}'. Trying fallback: '{fallback_name}'")
        coords = fetch(fallback_name)
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
        for pt in route_plan.points:
            # Resolving coordinates via Nominatim OSM with fallback
            try:
                lon, lat = geocode_osm(pt.search_query, pt.name)
                coords.append((lon, lat))
            except ValueError as e:
                logger.warning(f"Dropping point {pt.name} due to geocoding failure: {e}")
                
        if len(coords) < 2:
            raise ValueError("Po weryfikacji geograficznej zostało za mało punktów by wyznaczyć trasę.")
        
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
