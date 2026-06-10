import streamlit as st
import os
import re
from dotenv import load_dotenv
import logging

from ai_agent import chat_interviewer
from orchestrator import Orchestrator

# Load environment variables
load_dotenv()
logging.basicConfig(level=logging.INFO)

st.set_page_config(
    page_title="AI GPX Route Generator v2",
    page_icon="🗺️",
    layout="wide"
)

st.title("🗺️ AI GPX Route Generator (Interactive)")

# Sidebar
with st.sidebar:
    st.header("Ustawienia")
    api_key = st.text_input("Gemini API Key", type="password", value=os.getenv("GEMINI_API_KEY", ""))
    profile = st.selectbox("Profil trasy", options=["trekking", "hiking-mountain", "fastbike", "car-eco"], index=0)
    if st.button("Zresetuj konwersację"):
        st.session_state.messages = []
        st.session_state.pipeline_done = False
        st.session_state.result = None
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

    # Chat input
    if not st.session_state.pipeline_done:
        user_input = st.chat_input("Napisz tutaj...")
        if user_input and api_key:
            # 1. Add user message
            st.session_state.messages.append({"role": "user", "content": user_input})
            with st.chat_message("user"):
                st.markdown(user_input)
            
            # 2. Let the Interviewer analyze
            with st.chat_message("assistant"):
                with st.spinner("Zastanawiam się..."):
                    try:
                        state = chat_interviewer(st.session_state.messages)
                        st.markdown(state.reply)
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
        st.subheader("📖 Przewodnik Wyprawy")
        st.markdown(res["guide"])
