import logging
from typing import Dict, Any, List
from ai_agent import deep_researcher, route_planner, guide_writer
from brouter_client import generate_gpx_from_points

logger = logging.getLogger(__name__)

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
        route_plan = route_planner(research_context)
        
        if len(route_plan.points) < 2:
            raise ValueError("Route Planner nie mógł wyznaczyć minimum 2 punktów na podstawie researchu.")
            
        coords = [(pt.longitude, pt.latitude) for pt in route_plan.points]
        
        # Step 3: GPX Generation
        logger.info("Step 3: BRouter GPX Generation")
        gpx_data = generate_gpx_from_points(coords, profile=profile)
        
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
