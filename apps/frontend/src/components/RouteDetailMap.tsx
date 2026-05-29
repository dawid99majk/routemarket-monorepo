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

function createPoiIcon(name: string, color: string = '#6366f1') {
  let emoji = '📍';
  const lowercase = name.toLowerCase();
  if (lowercase.includes('start')) emoji = '🏁';
  else if (lowercase.includes('meta') || lowercase.includes('koniec') || lowercase.includes('end')) emoji = '🏆';
  else if (lowercase.includes('schronisko')) emoji = '🏡';
  else if (lowercase.includes('szczyt') || lowercase.includes('góra') || lowercase.includes('giewont') || lowercase.includes('kasprowy')) emoji = '🏔️';
  else if (lowercase.includes('parking')) emoji = '🅿️';
  else if (lowercase.includes('widok') || lowercase.includes('punkt widokowy')) emoji = '📷';
  else if (lowercase.includes('restauracja') || lowercase.includes('karczma') || lowercase.includes('bar')) emoji = '🍽️';

  return L.divIcon({
    className: 'route-poi-marker',
    html: `<div style="
      background:${color};
      color:white;
      border-radius:50%;
      width:30px;height:30px;
      display:flex;align-items:center;justify-content:center;
      font-size:14px;
      border:2px solid white;
      box-shadow:0 2px 6px rgba(0,0,0,0.3);
    ">${emoji}</div>`,
    iconSize: [30, 30],
    iconAnchor: [15, 15],
  });
}

const startIcon = createCircleIcon('#10b981', 'S');
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

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    if (track.length < 2 && (!alternatives || alternatives.length === 0)) return;

    const map = L.map(containerRef.current, {
      zoomControl: true,
      scrollWheelZoom: false,
      dragging: true,
      maxZoom: 15,
    });

    // Outdoor/terrain style tile layer
    L.tileLayer('https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; <a href="https://opentopomap.org">OpenTopoMap</a>',
      maxZoom: 17,
      noWrap: true,
    }).addTo(map);

    let bounds = L.latLngBounds([]);

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

        bounds.extend(latLngs);

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
        weight: 4,
        opacity: 0.9,
        lineCap: 'round',
        lineJoin: 'round',
      }).addTo(map);

      bounds.extend(latLngs);
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
      map.fitBounds(bounds, { padding: [40, 40], maxZoom: 13, animate: false });
    }

    // Wyłączenie prawego kliku
    containerRef.current.addEventListener('contextmenu', (e) => e.preventDefault());

    mapRef.current = map;

    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, [track, places, alternatives, selectedAlternativeId]);

  return <div ref={containerRef} className={`w-full h-full ${className}`} />;
}

const RouteDetailMap = memo(RouteDetailMapInner);
export default RouteDetailMap;
