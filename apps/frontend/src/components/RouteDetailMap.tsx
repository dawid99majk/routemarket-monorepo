import { useEffect, useRef, memo } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

// Fix for Leaflet default icons in React/Vite/Build environments
// @ts-ignore
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
});

interface RouteDetailMapProps {
  track: [number, number][];
  startPoint?: string | null;
  endPoint?: string | null;
  className?: string;
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

const startIcon = createCircleIcon('#16a34a', 'S');
const endIcon = createCircleIcon('#dc2626', 'E');

function RouteDetailMapInner({ track, className = '' }: RouteDetailMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);

  useEffect(() => {
    if (!containerRef.current || mapRef.current || track.length < 2) return;

    // Initialize map with a higher maxZoom and better defaults
    const map = L.map(containerRef.current, {
      zoomControl: true,
      scrollWheelZoom: false,
      dragging: true,
      maxZoom: 18,
    });

    // Standard OpenStreetMap tiles - most reliable
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
      maxZoom: 19,
    }).addTo(map);

    const latLngs = track.map(([lat, lng]) => L.latLng(lat, lng));
    
    // Draw route with an outer white glow/border for high contrast on any terrain
    L.polyline(latLngs, {
      color: '#ffffff',
      weight: 8,
      opacity: 0.5,
    }).addTo(map);

    L.polyline(latLngs, {
      color: '#16a34a',
      weight: 5,
      opacity: 1.0,
      lineCap: 'round',
      lineJoin: 'round',
    }).addTo(map);

    // Start & end markers
    const first = track[0];
    const last = track[track.length - 1];
    L.marker([first[0], first[1]], { icon: startIcon }).addTo(map).bindPopup('Start');
    L.marker([last[0], last[1]], { icon: endIcon }).addTo(map).bindPopup('End');

    const bounds = L.latLngBounds(latLngs);
    map.fitBounds(bounds, { padding: [40, 40], maxZoom: 14, animate: false });
    
    // Crucial for React: ensure map is fully rendered and sized
    const timer = setTimeout(() => {
      map.invalidateSize();
    }, 300);

    // Disable context menu on map to protect data
    containerRef.current.addEventListener('contextmenu', (e) => e.preventDefault());

    mapRef.current = map;

    return () => {
      clearTimeout(timer);
      map.remove();
      mapRef.current = null;
    };
  }, [track]);

  if (track.length < 2) return null;

  return <div ref={containerRef} className={`w-full h-full min-h-[350px] bg-muted/20 ${className}`} />;
}

const RouteDetailMap = memo(RouteDetailMapInner);
export default RouteDetailMap;
