import { useEffect, useRef, memo } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

export interface PlanPoint { name: string; lat: number; lng: number }

interface PlanDayMapProps {
  points: PlanPoint[];
  /** Przebieg po chodnikach z przeliczenia dnia. Bez niego rysujemy odcinki proste. */
  track?: [number, number][] | null;
  className?: string;
}

/**
 * Mapa jednego dnia planu z ponumerowanymi pinezkami w kolejności zwiedzania.
 * Numer jest tu treścią, nie ozdobą: po lewej stronie widać oś godzinową, a na
 * mapie ten sam numer, więc od razu wiadomo, w którą stronę idzie dzień.
 */
function PlanDayMapInner({ points, track, className = '' }: PlanDayMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const layerRef = useRef<L.LayerGroup | null>(null);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    const map = L.map(containerRef.current, { zoomControl: false, attributionControl: false });
    L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', { maxZoom: 19 }).addTo(map);
    mapRef.current = map;
    layerRef.current = L.layerGroup().addTo(map);
    return () => { map.remove(); mapRef.current = null; };
  }, []);

  useEffect(() => {
    const map = mapRef.current, layer = layerRef.current;
    if (!map || !layer) return;
    layer.clearLayers();

    const valid = points.filter((p) => Number.isFinite(p.lat) && Number.isFinite(p.lng));
    if (valid.length === 0) return;

    const latLngs = valid.map((p) => L.latLng(p.lat, p.lng));

    // Przerywana linia prosta to uczciwe "tędy mniej więcej". Kiedy dzień zostanie
    // przeliczony, zastępuje ją ciągły przebieg po chodnikach — i wtedy ciągłość
    // linii sama mówi, że to już pomiar, a nie szacunek.
    if (track && track.length > 1) {
      L.polyline(track.map(([lat, lng]) => L.latLng(lat, lng)), {
        color: 'hsl(158 28% 32%)', weight: 3.5, opacity: 0.85
      }).addTo(layer);
    } else if (latLngs.length > 1) {
      L.polyline(latLngs, {
        color: 'hsl(158 28% 32%)', weight: 2, opacity: 0.5, dashArray: '5 5'
      }).addTo(layer);
    }

    valid.forEach((p, i) => {
      L.marker(latLngs[i], {
        icon: L.divIcon({
          className: '',
          html: `<div style="width:26px;height:26px;border-radius:50%;background:hsl(60 6% 14%);
                 color:hsl(60 12% 97%);display:flex;align-items:center;justify-content:center;
                 font:500 12px/1 ui-sans-serif,system-ui;box-shadow:0 1px 4px rgba(0,0,0,.3)">${i + 1}</div>`,
          iconSize: [26, 26], iconAnchor: [13, 13]
        })
      }).addTo(layer).bindTooltip(p.name, { direction: 'top', offset: [0, -14] });
    });

    const bounds = track && track.length > 1
      ? L.latLngBounds(track.map(([lat, lng]) => L.latLng(lat, lng)))
      : L.latLngBounds(latLngs);
    map.fitBounds(bounds.pad(0.2), { animate: false });
    if (valid.length === 1 && !track) map.setZoom(15);
  }, [points, track]);

  return <div ref={containerRef} className={className} />;
}

export default memo(PlanDayMapInner);
