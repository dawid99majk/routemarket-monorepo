import logging
from typing import Optional, Dict, Any
from ai_agent import analyze_route_request
from brouter_client import generate_gpx_from_points

logger = logging.getLogger(__name__)

class Orchestrator:
    @staticmethod
    def generate_route(user_prompt: str, profile: str = "trekking") -> Dict[str, Any]:
        """
        Coordinates the workflow:
        1. AI Agent: Parse user prompt into POIs
        2. BRouter Client: Fetch GPX path through POIs
        
        Returns a dictionary with the route plan and the raw GPX data.
        """
        logger.info(f"Starting orchestration for request: '{user_prompt}'")
        
        # Step 1: AI Analysis
        logger.info("Step 1: Extracting waypoints via AI")
        route_plan = analyze_route_request(user_prompt)
        
        if len(route_plan.points) < 2:
            raise ValueError("AI could not extract at least 2 distinct waypoints from the request.")
            
        # Extract coordinates as a list of tuples
        coords = [(pt.longitude, pt.latitude) for pt in route_plan.points]
        
        # Step 2: Routing via BRouter
        logger.info("Step 2: Requesting GPX from BRouter")
        gpx_data = generate_gpx_from_points(coords, profile=profile)
        
        return {
            "title": route_plan.title,
            "description": route_plan.description,
            "points": route_plan.model_dump()["points"],
            "gpx": gpx_data
        }
