import { useEffect, useRef, memo } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

export interface PinPlace {
  id: string;
  name: string;
  lat: number;
  lng: number;
  visit_minutes?: number | null;
}

interface DiscoverMapProps {
  places: PinPlace[];
  /** Miejsce pod kursorem albo wybrane na liście — jego pinezka jest wyróżniona. */
  aktywne?: string | null;
  onPinClick?: (id: string) => void;
  onPinHover?: (id: string | null) => void;
  className?: string;
}

const kolorTla = (wyroznione: boolean) =>
  wyroznione ? 'hsl(158 28% 32%)' : 'hsl(60 6% 14%)';

function pinIcon(numer: number, wyroznione: boolean) {
  const rozmiar = wyroznione ? 34 : 26;
  return L.divIcon({
    className: '',
    html: `<div style="width:${rozmiar}px;height:${rozmiar}px;border-radius:50%;
      background:${kolorTla(wyroznione)};color:hsl(60 12% 97%);
      display:flex;align-items:center;justify-content:center;
      font:500 ${wyroznione ? 13 : 11}px/1 ui-sans-serif,system-ui;
      border:2px solid hsl(60 12% 97%);
      box-shadow:0 ${wyroznione ? 3 : 1}px ${wyroznione ? 10 : 4}px rgba(0,0,0,.3);
      transition:all .15s">${numer}</div>`,
    iconSize: [rozmiar, rozmiar],
    iconAnchor: [rozmiar / 2, rozmiar / 2],
  });
}

/**
 * Mapa obok listy. Pinezki są ponumerowane tak samo jak karty, więc jedno
 * spojrzenie wystarczy, żeby powiązać kafelek z punktem na mapie — bez tego
 * mapa jest ozdobą, a nie narzędziem.
 */
function DiscoverMapInner({ places, aktywne, onPinClick, onPinHover, className = '' }: DiscoverMapProps) {
  const boxRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const warstwa = useRef<L.LayerGroup | null>(null);
  const markery = useRef<Map<string, L.Marker>>(new Map());
  const dopasowane = useRef<string>('');

  useEffect(() => {
    if (!boxRef.current || mapRef.current) return;
    const map = L.map(boxRef.current, { zoomControl: true, attributionControl: false });
    L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', { maxZoom: 19 }).addTo(map);
    mapRef.current = map;
    warstwa.current = L.layerGroup().addTo(map);

    // Leaflet zapamiętuje rozmiar kontenera przy tworzeniu. Tutaj mapa powstaje
    // w kolumnie obok listy, której wysokość ustala się dopiero po ułożeniu treści,
    // więc bez przeliczenia mapa zostaje przy rozmiarze sprzed układu: dociąga
    // garść kafelków i trzyma widok świata zamiast dopasować się do pinezek.
    const ro = new ResizeObserver(() => map.invalidateSize());
    ro.observe(boxRef.current!);
    const t = setTimeout(() => map.invalidateSize(), 250);

    return () => { ro.disconnect(); clearTimeout(t); map.remove(); mapRef.current = null; };
  }, []);

  useEffect(() => {
    const map = mapRef.current, w = warstwa.current;
    if (!map || !w) return;
    w.clearLayers();
    markery.current.clear();

    const zPolozeniem = places.filter((p) => Number.isFinite(p.lat) && Number.isFinite(p.lng));
    if (zPolozeniem.length === 0) return;

    zPolozeniem.forEach((p, i) => {
      const m = L.marker([p.lat, p.lng], { icon: pinIcon(i + 1, p.id === aktywne) })
        .addTo(w)
        .bindTooltip(p.name, { direction: 'top', offset: [0, -16] });
      m.on('click', () => onPinClick?.(p.id));
      m.on('mouseover', () => onPinHover?.(p.id));
      m.on('mouseout', () => onPinHover?.(null));
      markery.current.set(p.id, m);
    });

    // Kadrujemy tylko wtedy, gdy zmienił się zestaw miejsc. Przy samym najechaniu
    // na kartę mapa nie ma prawa uciekać spod kursora.
    const podpis = zPolozeniem.map((p) => p.id).join(',');
    if (podpis !== dopasowane.current) {
      dopasowane.current = podpis;
      map.invalidateSize();
      map.fitBounds(L.latLngBounds(zPolozeniem.map((p) => [p.lat, p.lng] as [number, number])).pad(0.15),
        { animate: false });
    }
  }, [places, aktywne, onPinClick, onPinHover]);

  return <div ref={boxRef} className={className} />;
}

export default memo(DiscoverMapInner);
