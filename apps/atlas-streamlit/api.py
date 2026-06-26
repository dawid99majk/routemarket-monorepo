import os
import logging
from typing import List, Dict, Any, Optional
from fastapi import FastAPI, HTTPException, APIRouter
from pydantic import BaseModel
from fastapi.middleware.cors import CORSMiddleware

from ai_agent import chat_interviewer
from orchestrator import Orchestrator

# Initialize environment
from dotenv import load_dotenv
load_dotenv()

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI(title="Atlas Routing API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

class ChatMessage(BaseModel):
    role: str
    content: str

class ChatRequest(BaseModel):
    messages: List[ChatMessage]

class GenerateRequest(BaseModel):
    messages: List[ChatMessage]
    profile: Optional[str] = "trekking"

router = APIRouter(prefix="/atlas")

@router.get("/health")
def health():
    return {"status": "ok", "service": "atlas-fastapi"}

@router.post("/api/chat")
def chat(req: ChatRequest):
    if not os.getenv("GEMINI_API_KEY"):
        raise HTTPException(status_code=500, detail="GEMINI_API_KEY not set")
    
    chat_history = [{"role": m.role, "content": m.content} for m in req.messages]
    try:
        state = chat_interviewer(chat_history)
        return {
            "reply": state.reply,
            "is_ready": state.is_ready
        }
    except Exception as e:
        logger.error(f"Chat error: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/api/generate")
def generate_route(req: GenerateRequest):
    if not os.getenv("GEMINI_API_KEY"):
        raise HTTPException(status_code=500, detail="GEMINI_API_KEY not set")
        
    chat_history = [{"role": m.role, "content": m.content} for m in req.messages]
    try:
        result = Orchestrator.run_generation_pipeline(chat_history, profile=req.profile)
        
        # Parse GPX to get trackPoints
        import gpxpy
        gpx = gpxpy.parse(result["gpx"])
        trackPoints = []
        for track in gpx.tracks:
            for segment in track.segments:
                for point in segment.points:
                    trackPoints.append([point.latitude, point.longitude])
        
        # Fallback to routes (e.g. OpenRouteService GPX returns <rte> instead of <trk>)
        if not trackPoints:
            for route in gpx.routes:
                for point in route.points:
                    trackPoints.append([point.latitude, point.longitude])
        
        result["trackPoints"] = trackPoints
        return result
    except Exception as e:
        logger.error(f"Generation error: {e}")
        raise HTTPException(status_code=500, detail=str(e))

app.include_router(router)
