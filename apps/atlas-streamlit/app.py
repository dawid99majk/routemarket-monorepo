import streamlit as st
import os
import re
import logging
from dotenv import load_dotenv

import gpxpy
import folium
from streamlit_folium import st_folium
import pandas as pd
import altair as alt

from ai_agent import chat_interviewer
from orchestrator import Orchestrator
from database import init_db, save_route, get_user_routes

# Initialize DB
init_db()

# Load environment variables
load_dotenv()
logging.basicConfig(level=logging.INFO)

st.set_page_config(
    page_title="AI GPX Route Generator v3",
    page_icon="🗺️",
    layout="wide"
)

st.title("🗺️ AI GPX Route Generator (Interactive)")

# Sidebar
with st.sidebar:
    st.header("Ustawienia")
    api_key = st.text_input("Gemini API Key", type="password", value=os.getenv("GEMINI_API_KEY", ""))
    username = st.text_input("Twoja nazwa (Nick)", value="")
    profile = st.selectbox("Profil trasy", options=["trekking", "hiking-mountain", "fastbike", "car-eco"], index=0)
    if st.button("Zresetuj konwersację"):
        st.session_state.messages = []
        st.session_state.pipeline_done = False
        st.session_state.result = None
        st.rerun()
        
    if username:
        st.divider()
        st.subheader("Twoje Zapisane Trasy")
        user_routes = get_user_routes(username)
        if not user_routes:
            st.info("Brak zapisanych tras.")
        else:
            for r in user_routes:
                if st.button(f"🗺️ {r['title']} ({r['created_at'][:10]})", key=f"route_{r['id']}"):
                    from database import get_route_by_id
                    full_route = get_route_by_id(r['id'])
                    if full_route:
                        st.session_state.result = {
                            "title": full_route["title"],
                            "gpx": full_route["gpx_data"],
                            "guide": full_route["guide_data"]
                        }
                        st.session_state.pipeline_done = True
                        st.rerun()

if not api_key:
    st.warning("⚠️ Brak klucza API Gemini w środowisku ani w pasku bocznym.")
else:
    os.environ["GEMINI_API_KEY"] = api_key

# Initialize session state
if "messages" not in st.session_state:
    st.session_state.messages = [{"role": "model", "content": "Cześć! O jakiej wyprawie marzysz? Podaj mi wstępny zarys, a ja dopytam Cię o szczegóły, by ułożyć idealną trasę."}]
if "pipeline_done" not in st.session_state:
    st.session_state.pipeline_done = False
if "result" not in st.session_state:
    st.session_state.result = None

def safe_filename(name: str, ext: str) -> str:
    return re.sub(r'[^a-zA-Z0-9_\-]', '_', name).strip('_').lower() + ext

# Layout: 2 columns (Chat on left, Result on right)
col_chat, col_result = st.columns([1, 1])

with col_chat:
    st.subheader("Czat z Asystentem")
    # Display chat messages
    for msg in st.session_state.messages:
        with st.chat_message("user" if msg["role"] == "user" else "assistant"):
            st.markdown(msg["content"])

    # Chat input (zawsze dostępne)
    user_input = st.chat_input("Napisz tutaj (np. poprawkę do trasy)...")
    if user_input and api_key:
        # Jeśli użytkownik pisze po wygenerowaniu, resetujemy status
        if st.session_state.pipeline_done:
            st.session_state.pipeline_done = False
            st.session_state.result = None
            
        # 1. Add user message
        st.session_state.messages.append({"role": "user", "content": user_input})
        
        # 2. Let the Interviewer analyze
        with st.spinner("Zastanawiam się..."):
            try:
                state = chat_interviewer(st.session_state.messages)
                st.session_state.messages.append({"role": "model", "content": state.reply})
                
                # 3. If ready, move to pipeline
                if state.is_ready:
                    st.session_state.pipeline_done = True
                st.rerun()
            except Exception as e:
                st.error(f"Błąd komunikacji z AI: {e}")

with col_result:
    if st.session_state.pipeline_done and not st.session_state.result:
        st.subheader("Generowanie Trasy i Przewodnika")
        with st.status("🚀 Procesuję Twój plan...", expanded=True) as status:
            try:
                st.write("🔍 Przeszukuję internet (Google Search) w poszukiwaniu parkingów, szlaków i jedzenia...")
                # The orchestrator logs to stdout, but we just call it directly here
                res = Orchestrator.run_generation_pipeline(st.session_state.messages, profile=profile)
                st.session_state.result = res
                
                # Zapis do bazy danych jeśli podano nick
                if username:
                    save_route(username, res["title"], profile, res["gpx"], res["guide"])
                
                # Update agent's memory with the generated route so it has context
                summary_msg = f"Ukończyłem planowanie! Trasa **{res['title']}** została wygenerowana i naniesiona na mapę po prawej. Zobacz czy Ci odpowiada i napisz tutaj, jeśli mam nanieść jakieś poprawki (np. zmienić przebieg lub zahaczyć o inny punkt)."
                st.session_state.messages.append({"role": "model", "content": summary_msg})
                
                status.update(label="✅ Gotowe!", state="complete", expanded=True)
                st.rerun()
            except Exception as e:
                status.update(label=f"❌ Błąd: {e}", state="error")
    
    if st.session_state.result:
        res = st.session_state.result
        st.success(f"Trasa: **{res['title']}** została wygenerowana.")
        
        # Action Buttons
        btn_col1, btn_col2 = st.columns(2)
        with btn_col1:
            st.download_button(
                label="📥 Pobierz GPX",
                data=res["gpx"],
                file_name=safe_filename(res["title"], ".gpx"),
                mime="application/gpx+xml",
                use_container_width=True
            )
        with btn_col2:
            st.download_button(
                label="📥 Pobierz Przewodnik (.md)",
                data=res["guide"],
                file_name=safe_filename(res["title"], "_przewodnik.md"),
                mime="text/markdown",
                use_container_width=True
            )
            
        st.divider()
        st.subheader("🗺️ Podgląd Mapy i Profilu")
        
        # Parse GPX
        try:
            gpx = gpxpy.parse(res["gpx"])
            
            # Extract points
            points_data = []
            cumulative_distance = 0.0
            previous_point = None
            
            for track in gpx.tracks:
                for segment in track.segments:
                    for point in segment.points:
                        if previous_point:
                            cumulative_distance += point.distance_2d(previous_point) / 1000.0 # w kilometrach
                        points_data.append({
                            "lat": point.latitude,
                            "lon": point.longitude,
                            "ele": point.elevation or 0.0,
                            "distance_km": cumulative_distance
                        })
                        previous_point = point

            if points_data:
                df = pd.DataFrame(points_data)
                
                # Render Map (Folium)
                # Calculate center
                center_lat = df['lat'].mean()
                center_lon = df['lon'].mean()
                m = folium.Map(location=[center_lat, center_lon], zoom_start=11)
                
                # Add route line
                route_coords = list(zip(df['lat'], df['lon']))
                folium.PolyLine(route_coords, color="blue", weight=4, opacity=0.8).add_to(m)
                
                # Add start/end markers
                folium.Marker(route_coords[0], popup="Start", icon=folium.Icon(color="green")).add_to(m)
                folium.Marker(route_coords[-1], popup="Meta", icon=folium.Icon(color="red")).add_to(m)
                
                st_folium(m, width=700, height=400)
                
                # Render Elevation Chart
                st.write("**Profil Wysokości (m n.p.m)**")
                chart = alt.Chart(df).mark_area(opacity=0.5, color='orange').encode(
                    x=alt.X('distance_km:Q', title='Dystans (km)'),
                    y=alt.Y('ele:Q', title='Wysokość (m)', scale=alt.Scale(domain=[df['ele'].min()*0.9, df['ele'].max()*1.1])),
                    tooltip=['distance_km', 'ele']
                ).properties(height=200)
                st.altair_chart(chart, use_container_width=True)
                
            else:
                st.warning("Nie znaleziono danych śladu w wygenerowanym GPX.")
        except Exception as e:
            st.error(f"Błąd podczas renderowania mapy: {e}")
            
        st.divider()
        st.subheader("📖 Przewodnik Wyprawy")
        st.markdown(res["guide"])
