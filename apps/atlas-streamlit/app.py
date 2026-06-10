import streamlit as st
import os
import re
from dotenv import load_dotenv
import logging
from orchestrator import Orchestrator

# Load environment variables (like GEMINI_API_KEY)
load_dotenv()

# Setup logging
logging.basicConfig(level=logging.INFO)

st.set_page_config(
    page_title="AI GPX Route Generator",
    page_icon="🏔️",
    layout="centered"
)

st.title("🏔️ AI GPX Route Generator")
st.markdown("""
To narzędzie wykorzystuje sztuczną inteligencję (Gemini) do zrozumienia Twojego pomysłu na wycieczkę i silnik BRouter do wyznaczenia bezpiecznej trasy po szlakach turystycznych.
""")

# Sidebar settings
with st.sidebar:
    st.header("Ustawienia")
    api_key = st.text_input("Gemini API Key", type="password", value=os.getenv("GEMINI_API_KEY", ""))
    profile = st.selectbox("Profil trasy", options=["trekking", "hiking-mountain", "fastbike", "car-eco"], index=0)
    
    st.markdown("---")
    st.info("BRouter API wykorzystuje publiczne endpointy do generowania geometrii na podstawie punktów wyznaczonych przez AI.")

if not api_key:
    st.warning("⚠️ Podaj klucz API Gemini w pasku bocznym, aby kontynuować.")
else:
    # Set the key in environment so the backend can pick it up
    os.environ["GEMINI_API_KEY"] = api_key

user_prompt = st.text_area(
    "Opisz swój pomysł na wyprawę", 
    placeholder="np. 2 dni w Karkonoszach z plecakiem, start w Karpaczu, nocleg w schronisku Samotnia, powrót przez Śnieżkę",
    height=150
)

def safe_filename(name: str) -> str:
    # Convert string to safe filename
    return re.sub(r'[^a-zA-Z0-9_\-]', '_', name).strip('_').lower() + ".gpx"

if st.button("Wygeneruj GPX", type="primary"):
    if not user_prompt.strip():
        st.error("Proszę wpisać pomysł na wycieczkę.")
    else:
        with st.spinner("🧠 AI analizuje zapytanie i szuka punktów trasy..."):
            try:
                result = Orchestrator.generate_route(user_prompt, profile=profile)
                
                st.success("✅ Trasa wygenerowana pomyślnie!")
                st.subheader(result["title"])
                st.write(result["description"])
                
                st.markdown("### Punkty Orientacyjne (POI)")
                for idx, pt in enumerate(result["points"]):
                    st.write(f"{idx+1}. **{pt['name']}** (`{pt['latitude']:.5f}, {pt['longitude']:.5f}`)")
                
                # File download
                gpx_data = result["gpx"]
                filename = safe_filename(result["title"])
                
                st.download_button(
                    label="📥 Pobierz plik GPX",
                    data=gpx_data,
                    file_name=filename,
                    mime="application/gpx+xml"
                )
                
            except Exception as e:
                st.error(f"Wystąpił błąd podczas generowania trasy: {str(e)}")
