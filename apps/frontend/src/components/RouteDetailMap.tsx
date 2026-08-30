import { useEffect, useRef, memo } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

interface RouteDetailMapProps {
  track: [number, number][];
  places?: { name: string, lat: number, lng: number }[] | null;
  startPoint?: string | null;
  endPoint?: string | null;
  className?: string;
  alternatives?: { id: string, name: string, color: string, track: [number, number][], pois?: { name: string, lat: number, lng: number }[] }[] | null;
  selectedAlternativeId?: string | null;
  onSelectAlternative?: (id: string) => void;
}

function createCircleIcon(color: string, label: string) {
  return L.divIcon({
    className: 'route-endpoint-marker',
    html: `<div style="
      background:${color};
      color:white;
      border-radius:50%;
      width:28px;height:28px;
      display:flex;align-items:center;justify-content:center;
      font-size:12px;font-weight:700;
      border:3px solid white;
      box-shadow:0 2px 8px rgba(0,0,0,0.3);
    ">${label}</div>`,
    iconSize: [28, 28],
    iconAnchor: [14, 14],
  });
}

/** Kolor z tokenu — Leaflet dostaje wartość, nie klasę, więc czytamy zmienną. */
function tokenKoloru(nazwa: string, zapas: string) {
  if (typeof window === 'undefined') return zapas;
  const v = getComputedStyle(document.documentElement).getPropertyValue(nazwa).trim();
  return v ? `hsl(${v})` : zapas;
}

/**
 * Kontury z lucide, wstawiane jako SVG. Leaflet składa ikonę z surowego HTML-a,
 * więc komponentu Reacta nie da się tu podać — ale to te same kształty, których
 * używa reszta interfejsu, a nie emoji rysowane przez system.
 */
const GLIFY: Record<string, string> = {
  szczyt: '<path d="m8 3 4 8 5-5 5 15H2L8 3z"/>',
  parking: '<path d="M9 17V7h4a3 3 0 0 1 0 6H9"/>',
  widok: '<path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z"/><circle cx="12" cy="13" r="3"/>',
  jedzenie: '<path d="M3 2v7c0 1.1.9 2 2 2h4a2 2 0 0 0 2-2V2"/><path d="M7 2v20"/><path d="M21 15V2a5 5 0 0 0-5 5v6c0 1.1.9 2 2 2h3Zm0 0v7"/>',
  nocleg: '<path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><path d="M9 22V12h6v10"/>',
  meta: '<path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"/><line x1="4" x2="4" y1="22" y2="15"/>',
  punkt: '<circle cx="12" cy="12" r="4"/>',
};

function createPoiIcon(name: string, color?: string) {
  const n = name.toLowerCase();
  let glif = GLIFY.punkt;
  if (n.includes('meta') || n.includes('koniec') || n.includes('end')) glif = GLIFY.meta;
  else if (n.includes('schronisko') || n.includes('nocleg') || n.includes('hotel')) glif = GLIFY.nocleg;
  else if (n.includes('szczyt') || n.includes('góra') || n.includes('giewont') || n.includes('kasprowy')) glif = GLIFY.szczyt;
  else if (n.includes('parking')) glif = GLIFY.parking;
  else if (n.includes('widok')) glif = GLIFY.widok;
  else if (n.includes('restauracja') || n.includes('karczma') || n.includes('bar')) glif = GLIFY.jedzenie;

  const tlo = color || tokenKoloru('--primary', 'hsl(158 28% 32%)');
  const napis = tokenKoloru('--card', 'hsl(40 100% 99%)');

  return L.divIcon({
    className: 'route-poi-marker',
    html: `<div style="
      background:${tlo};
      border-radius:50%;
      width:30px;height:30px;
      display:flex;align-items:center;justify-content:center;
      border:2px solid ${napis};
      box-shadow:0 2px 6px rgba(58,42,34,.3);
    "><svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24"
        fill="none" stroke="${napis}" stroke-width="2" stroke-linecap="round"
        stroke-linejoin="round">${glif}</svg></div>`,
    iconSize: [30, 30],
    iconAnchor: [15, 15],
  });
}

// Szałwia z górnej części skali marki — czytelna na jasnym i ciemnym podkładzie
const startIcon = createCircleIcon('#8FA376', 'S');
const endIcon = createCircleIcon('#ef4444', 'E');

function RouteDetailMapInner({ 
  track, 
  places = [], 
  className = '', 
  alternatives = null,
  selectedAlternativeId = null,
  onSelectAlternative
}: RouteDetailMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const userMarkerRef = useRef<L.CircleMarker | null>(null);
  const watchIdRef = useRef<number | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;
    if (track.length < 2 && (!alternatives || alternatives.length === 0)) return;
    if (mapRef.current) {
      mapRef.current.remove();
      mapRef.current = null;
    }

    const map = L.map(containerRef.current, {
      zoomControl: false,
      scrollWheelZoom: false,
      dragging: true,
      maxZoom: 18,
    });

    L.control.zoom({ position: 'bottomright' }).addTo(map);

    // Outdoor/terrain style tile layer
    L.tileLayer('https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; <a href="https://opentopomap.org">OpenTopoMap</a>',
      maxZoom: 17,
      noWrap: true,
    }).addTo(map);

    const bounds = L.latLngBounds([]);

    // Rysowanie tras alternatywnych, jeśli istnieją
    if (alternatives && alternatives.length > 0) {
      alternatives.forEach((alt) => {
        const isSelected = selectedAlternativeId === alt.id;
        const latLngs = alt.track.map(([lat, lng]) => L.latLng(lat, lng));
        
        const polyline = L.polyline(latLngs, {
          color: alt.color || '#6366f1',
          weight: isSelected ? 6 : 3,
          opacity: isSelected ? 1.0 : 0.45,
          lineCap: 'round',
          lineJoin: 'round',
          interactive: true,
        }).addTo(map);

        if (onSelectAlternative) {
          polyline.on('click', () => {
            onSelectAlternative(alt.id);
          });
        }

        bounds.extend(L.latLngBounds(latLngs));

        // Jeśli to wybrany wariant, dodaj jego dedykowane POI
        if (isSelected && alt.pois && alt.pois.length > 0) {
          alt.pois.forEach((poi: any) => {
            L.marker([poi.lat, poi.lng], { icon: createPoiIcon(poi.name, alt.color) })
              .addTo(map)
              .bindPopup(`<b>${poi.name}</b><br/><span style="color:${alt.color};font-weight:bold;">${alt.name}</span>`);
          });
        }
      });
    } else {
      // Standardowy rysunek pojedynczej trasy
      const latLngs = track.map(([lat, lng]) => L.latLng(lat, lng));
      L.polyline(latLngs, {
        color: '#6366f1', // standardowy fiolet
        weight: 5,
        opacity: 0.9,
        lineCap: 'round',
        lineJoin: 'round',
      }).addTo(map);

      bounds.extend(L.latLngBounds(latLngs));
    }

    // Wyznaczenie punktów startowych i końcowych na podstawie aktywnej trasy
    let activeTrack = track;
    let activeColor = '#6366f1';
    if (alternatives && alternatives.length > 0) {
      const selected = alternatives.find(a => a.id === selectedAlternativeId) || alternatives[0];
      activeTrack = selected.track;
      activeColor = selected.color;
    }

    if (activeTrack && activeTrack.length >= 2) {
      const first = activeTrack[0];
      const last = activeTrack[activeTrack.length - 1];
      L.marker([first[0], first[1]], { icon: createCircleIcon(activeColor, 'S') }).addTo(map).bindPopup('Start');
      L.marker([last[0], last[1]], { icon: createCircleIcon('#dc2626', 'E') }).addTo(map).bindPopup('End');

      // Dodaj ogólne POI
      if (places && places.length > 0) {
        places.forEach(place => {
          const isStartOverlap = Math.abs(place.lat - first[0]) < 0.0001 && Math.abs(place.lng - first[1]) < 0.0001;
          const isMetaOverlap = Math.abs(place.lat - last[0]) < 0.0001 && Math.abs(place.lng - last[1]) < 0.0001;
          
          if (!isStartOverlap && !isMetaOverlap) {
            L.marker([place.lat, place.lng], { icon: createPoiIcon(place.name, activeColor) })
              .addTo(map)
              .bindPopup(`<b>${place.name}</b>`);
          }
        });
      }
    }

    if (bounds.isValid()) {
      map.fitBounds(bounds, { padding: [40, 40], maxZoom: 14, animate: false });
    }
    setTimeout(() => map.invalidateSize(false), 50);

    // Wyłączenie prawego kliku
    const preventContextMenu = (e: MouseEvent) => e.preventDefault();
    containerRef.current.addEventListener('contextmenu', preventContextMenu);

    mapRef.current = map;

    return () => {
      containerRef.current?.removeEventListener('contextmenu', preventContextMenu);
      if (watchIdRef.current) navigator.geolocation.clearWatch(watchIdRef.current);
      map.remove();
      mapRef.current = null;
    };
  }, [track, places, alternatives, selectedAlternativeId]);

  const handleLocateMe = () => {
    if (!mapRef.current) return;
    const map = mapRef.current;
    
    if (!navigator.geolocation) {
      alert("Twoja przeglądarka nie wspiera geolokalizacji.");
      return;
    }

    if (watchIdRef.current) {
      // If already tracking, just center
      if (userMarkerRef.current) {
        map.setView(userMarkerRef.current.getLatLng(), 16);
      }
      return;
    }

    // Custom blue dot
    watchIdRef.current = navigator.geolocation.watchPosition(
      (pos) => {
        const lat = pos.coords.latitude;
        const lng = pos.coords.longitude;
        const latlng = L.latLng(lat, lng);

        if (!userMarkerRef.current) {
          userMarkerRef.current = L.circleMarker(latlng, {
            radius: 8,
            fillColor: '#3b82f6',
            color: '#ffffff',
            weight: 3,
            opacity: 1,
            fillOpacity: 1
          }).addTo(map);
          map.setView(latlng, 16);
        } else {
          userMarkerRef.current.setLatLng(latlng);
        }
      },
      (err) => {
        console.error("Geolocation error:", err);
      },
      { enableHighAccuracy: true, maximumAge: 10000, timeout: 5000 }
    );
  };

  return (
    <div className={`relative w-full h-full ${className}`}>
      <div ref={containerRef} className="w-full h-full" />
      <button 
        onClick={handleLocateMe}
        className="absolute top-4 right-4 z-[400] bg-card border border-border shadow-token-md text-foreground/80 hover:text-primary rounded-full w-10 h-10 flex items-center justify-center transition-colors"
        title="Centruj na mnie (Nawiguj)"
      >
        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="3 11 22 2 13 21 11 13 3 11"/></svg>
      </button>
    </div>
  );
}

const RouteDetailMap = memo(RouteDetailMapInner);
export default RouteDetailMap;
