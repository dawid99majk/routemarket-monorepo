import os
import logging
from typing import List
from pydantic import BaseModel, Field
from google import genai
from google.genai import types

logger = logging.getLogger(__name__)

class RoutePoint(BaseModel):
    name: str = Field(description="Name of the landmark or point")
    longitude: float = Field(description="Longitude coordinate")
    latitude: float = Field(description="Latitude coordinate")

class RoutePlan(BaseModel):
    title: str = Field(description="A short, catchy title for the route")
    description: str = Field(description="A brief description of the generated route")
    points: List[RoutePoint] = Field(description="List of waypoints in order from start to end")

def analyze_route_request(user_prompt: str) -> RoutePlan:
    """
    Uses Gemini to parse a user's loose route request and return structured waypoints.
    """
    api_key = os.getenv("GEMINI_API_KEY")
    if not api_key:
        raise ValueError("GEMINI_API_KEY environment variable is not set.")

    # Initialize the genai client
    client = genai.Client(api_key=api_key)

    system_instruction = (
        "You are an expert outdoor guide and route planner. "
        "The user will give you a loose idea for a hiking, trekking, or biking trip. "
        "Your task is to find the best, most logical route using popular trails. "
        "You must extract at least 4 key landmarks/waypoints (start, via points, end) "
        "that accurately represent the route. "
        "Provide exact GPS coordinates (longitude and latitude) for each point. "
        "The points MUST be in the correct geographical order."
    )

    logger.info("Sending request to Gemini model...")
    
    response = client.models.generate_content(
        model='gemini-2.5-flash',
        contents=user_prompt,
        config=types.GenerateContentConfig(
            system_instruction=system_instruction,
            response_mime_type="application/json",
            response_schema=RoutePlan,
            temperature=0.2,
        ),
    )
    
    if not response.text:
         raise RuntimeError("Gemini returned an empty response.")
         
    # Parse the returned JSON text into our Pydantic model
    plan = RoutePlan.model_validate_json(response.text)
    logger.info(f"Generated route: {plan.title} with {len(plan.points)} points.")
    
    return plan

# Example usage:
# if __name__ == "__main__":
#     import os
#     from dotenv import load_dotenv
#     load_dotenv()
#     plan = analyze_route_request("2 dni w Karkonoszach z plecakiem, start w Karpaczu, nocleg w schronisku Samotnia, powrót przez Śnieżkę")
#     print(plan.model_dump_json(indent=2))
