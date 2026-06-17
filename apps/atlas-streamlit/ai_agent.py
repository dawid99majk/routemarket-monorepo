import os
import logging
import json
from typing import List, Dict, Any
from pydantic import BaseModel, Field
from google import genai
from google.genai import types

logger = logging.getLogger(__name__)

class RoutePoint(BaseModel):
    name: str = Field(description="Nazwa miejsca lub punktu orientacyjnego (np. 'Śnieżka', 'Pielgrzymy')")
    search_query: str = Field(description="Bardzo precyzyjna fraza dla Google Maps/OSM (zawsze dodaj region, np. 'Pielgrzymy, Karkonosze, Polska' albo 'Schronisko Samotnia, Karpacz')")

class RoutePlan(BaseModel):
    title: str = Field(description="Krótki, chwytliwy tytuł trasy")
    description: str = Field(description="Krótki opis wygenerowanej trasy")
    points: List[RoutePoint] = Field(description="Lista waypointów w kolejności od startu do końca")

class InterviewState(BaseModel):
    is_ready: bool = Field(description="True jeśli masz wystarczająco dużo informacji do wygenerowania super trasy (lokalizacja, trudność, dni, preferencje), False jeśli brakuje kluczowych informacji.")
    reply: str = Field(description="Twoja odpowiedź do użytkownika. Dopytaj o to, co ważne (parking, długość, nocleg, atrakcje) lub podsumuj jeśli jest gotowy.")

def get_client() -> genai.Client:
    api_key = os.getenv("GEMINI_API_KEY")
    if not api_key:
        raise ValueError("GEMINI_API_KEY environment variable is not set.")
    return genai.Client(api_key=api_key)

def chat_interviewer(chat_history: List[Dict[str, str]]) -> InterviewState:
    """
    Analyzes the chat history to see if enough information has been gathered.
    If not, it generates the next question.
    """
    client = get_client()
    
    system_instruction = (
        "Jesteś profesjonalnym przewodnikiem i planistą tras. "
        "Twoim zadaniem jest upewnienie się, że masz wystarczająco dużo szczegółów od użytkownika, "
        "aby zaplanować idealną trasę wyprawy (np. wędrówki, roweru). "
        "Dopytaj o kluczowe kwestie, jeśli ich nie podano (np. na ile dni, preferencje trudności, gdzie zacząć, co lubią oglądać, czy potrzebują noclegu/parkingu). "
        "Nie pytaj o wszystko naraz - zadaj 1-2 najważniejsze pytania. "
        "Jeśli użytkownik podał już główne założenia i możesz ułożyć z tego świetny plan (nawet z własną inwencją), ustaw 'is_ready' na true i napisz, że zabierasz się do pracy."
    )
    
    # Format chat history for Gemini
    history_text = "\n".join([f"{msg['role']}: {msg['content']}" for msg in chat_history])
    
    logger.info("Calling Interviewer agent...")
    response = client.models.generate_content(
        model='gemini-2.5-flash',
        contents=history_text,
        config=types.GenerateContentConfig(
            system_instruction=system_instruction,
            response_mime_type="application/json",
            response_schema=InterviewState,
            temperature=0.7,
        ),
    )
    return InterviewState.model_validate_json(response.text)

def deep_researcher(chat_history: List[Dict[str, str]]) -> str:
    """
    Uses Google Search grounding to perform deep research on the route.
    """
    client = get_client()
    
    system_instruction = (
        "Jesteś ekspertem ds. głębokiego reaserchu turystycznego. "
        "Masz dostęp do wyszukiwarki Google. "
        "Na podstawie konwersacji z użytkownikiem, wyszukaj rzetelne i aktualne informacje o szlakach, "
        "rekomendowanych parkingach, miejscach na jedzenie i konkretnych atrakcjach w wybranym regionie. "
        "Twoim zadaniem jest zebranie bazy faktów, z której następnie ułożony zostanie dokładny przewodnik. "
        "Podaj nazwy miejsc, warunki na szlaku, przydatne wskazówki i sugerowane konkretne punkty na mapie."
    )
    
    history_text = "ZAPYTANIE UŻYTKOWNIKA:\n" + "\n".join([f"{msg['role']}: {msg['content']}" for msg in chat_history])
    
    logger.info("Calling Deep Researcher agent (with Google Search)...")
    response = client.models.generate_content(
        model='gemini-2.5-flash',
        contents=history_text,
        config=types.GenerateContentConfig(
            system_instruction=system_instruction,
            temperature=0.4,
            tools=[{"google_search": {}}],
        ),
    )
    
    return response.text

def route_planner(research_context: str, chat_history: List[Dict[str, str]]) -> RoutePlan:
    """
    Extracts the structured JSON POIs from the research.
    """
    client = get_client()
    
    system_instruction = (
        "Jesteś nawigatorem. Na podstawie dostarczonego obszernego researchu z Google ORAZ historii rozmowy, "
        "wyodrębnij konkretne, kluczowe punkty orientacyjne. "
        "UWAGA: Wygeneruj maksymalnie 5 do 8 kluczowych punktów węzłowych (np. Start, główne szczyty/atrakcje, schronisko, Meta). "
        "ABSOLUTNIE KLUCZOWE 1: Punkty MUSZĄ być ułożone w ścisłej chronologii, w fizycznej i geograficznej kolejności, w jakiej turysta będzie je mijał krok po kroku. "
        "ABSOLUTNIE KLUCZOWE 2: Twoim bezwzględnym priorytetem jest umieszczenie w planie wszystkich miejsc, o które wyraźnie prosił użytkownik w historii czatu. "
        "ABSOLUTNIE KLUCZOWE 3: Jeśli trasa ma charakter wycieczki jednodniowej (pętli), to PIERWSZY i OSTATNI punkt na liście muszą być tym samym miejscem (ta sama nazwa), aby pętla się zamknęła. "
        "Dla każdego punktu podaj precyzyjne `search_query` (np. 'Schronisko Samotnia, Karpacz, Polska'), aby serwer satelitarny mógł bezbłędnie znaleźć ten punkt na mapie."
    )
    
    history_text = "HISTORIA CZATU Z UŻYTKOWNIKIEM:\n" + "\n".join([f"{msg['role']}: {msg['content']}" for msg in chat_history])
    content = f"{history_text}\n\nRESEARCH KONTEKSTOWY:\n{research_context}"
    
    logger.info("Calling Route Planner agent...")
    response = client.models.generate_content(
        model='gemini-2.5-flash',
        contents=content,
        config=types.GenerateContentConfig(
            system_instruction=system_instruction,
            response_mime_type="application/json",
            response_schema=RoutePlan,
            temperature=0.1,
        ),
    )
    return RoutePlan.model_validate_json(response.text)

def guide_writer(research_context: str, route_plan: RoutePlan) -> str:
    """
    Writes a comprehensive markdown guidebook based on the research and planned route.
    """
    client = get_client()
    
    system_instruction = (
        "Jesteś wydawcą przewodników premium. "
        "Napisz piękny, szczegółowy przewodnik w formacie Markdown na podstawie dostarczonego researchu i wyznaczonych punktów. "
        "Przewodnik powinien być podzielony na dni (jeśli to wyprawa wielodniowa) lub sekcje trasy. "
        "Dla każdego dnia/sekcji opisz dokładnie: "
        "- Gdzie zacząć i gdzie zaparkować samochód. "
        "- Jakim szlakiem się kierować (kolory szlaków, trudności). "
        "- Gdzie zjeść (konkretne restauracje/schroniska zebrane w researchu). "
        "- Ciekawostki o okolicy. "
        "Pisz językiem angażującym, profesjonalnym i dającym poczucie pewności na szlaku."
    )
    
    points_info = "\n".join([f"- {p.name} ({p.latitude}, {p.longitude})" for p in route_plan.points])
    content = f"RESEARCH:\n{research_context}\n\nZAPLANOWANE PUNKTY:\n{points_info}"
    
    logger.info("Calling Guide Writer agent...")
    response = client.models.generate_content(
        model='gemini-2.5-flash',
        contents=content,
        config=types.GenerateContentConfig(
            system_instruction=system_instruction,
            temperature=0.5,
        ),
    )
    return response.text
