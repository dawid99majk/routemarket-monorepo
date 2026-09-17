import { useEffect, useRef, memo } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

export interface PlanPoint {
  name: string;
  lat: number;
  lng: number;
  /** Numer przystanku, ten sam co na osi dnia. `null` — punkt w noclegu, bez numeru. */
  nr?: number | null;
  propozycja?: boolean;
}

interface PlanDayMapProps {
  /** Kolejne punkty dnia — linia idzie przez nie w tej kolejności. */
  points: PlanPoint[];
  /** Nocleg z ustawień wyjazdu. Rysowany zawsze, także gdy plan dnia go nie wymienia. */
  baza?: { name: string; lat: number; lng: number } | null;
  /** Przebieg po chodnikach z przeliczenia dnia. Bez niego rysujemy odcinki proste. */
  track?: [number, number][] | null;
  /** Kliknięcie pinezki. Bez tego mapa była tylko obrazkiem: kartę miejsca dało
   *  się otworzyć wyłącznie z listy po lewej, choć pinezka wygląda na klikalną. */
  onPunkt?: (index: number) => void;
  className?: string;
}

// Ikona domu z lucide, wpisana ręcznie: divIcon przyjmuje HTML, nie komponent.
const IKONA_DOMU = '<svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" '
  + 'stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">'
  + '<path d="M15 21v-8a1 1 0 0 0-1-1h-4a1 1 0 0 0-1 1v8"/>'
  + '<path d="M3 10a2 2 0 0 1 .709-1.528l7-5.999a2 2 0 0 1 2.582 0l7 5.999A2 2 0 0 1 21 10v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/></svg>';

/**
 * Kolor z tokenu motywu jako gotowa wartość. Styl inline w divIcon rozwiąże
 * `var(--x)` sam, ale linia Leafleta trafia do atrybutu SVG `stroke`, a tam
 * zmienne CSS nie działają we wszystkich przeglądarkach.
 */
function kolorTokenu(nazwa: string): string {
  const v = getComputedStyle(document.documentElement).getPropertyValue(nazwa).trim();
  // Bez tokenu linia bierze kolor tekstu kontenera — żadnej wartości wpisanej na sztywno.
  return v ? `hsl(${v})` : 'currentColor';
}

/**
 * Mapa jednego dnia planu z ponumerowanymi pinezkami w kolejności zwiedzania.
 * Numer jest tu treścią, nie ozdobą: po lewej stronie widać oś godzinową, a na
 * mapie ten sam numer, więc od razu wiadomo, w którą stronę idzie dzień.
 *
 * Nocleg ma własny znak i nie ma numeru. Stał dotąd numerowaną pinezką we
 * współrzędnych sąsiedniego miejsca, więc dzień wyglądał na skupiony w dwóch
 * punktach, z których żaden nie był hotelem.
 */
function PlanDayMapInner({ points, baza, track, onPunkt, className = '' }: PlanDayMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const layerRef = useRef<L.LayerGroup | null>(null);
  const naPunkt = useRef(onPunkt);
  naPunkt.current = onPunkt;

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    const map = L.map(containerRef.current, { zoomControl: false, attributionControl: true });
    L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_Base/MapServer/tile/{z}/{y}/{x}',
      { maxZoom: 19, attribution: '&copy; Esri, HERE, Garmin, OpenStreetMap' }).addTo(map);
    mapRef.current = map;
    layerRef.current = L.layerGroup().addTo(map);
    return () => { map.remove(); mapRef.current = null; };
  }, []);

  // Rodzic liczy punkty przy każdym renderze, więc tablica jest za każdym razem
  // nowa. Porównujemy treść, żeby mapa nie wracała do kadru przy każdej zmianie
  // stanu gdzie indziej na stronie — na przykład w trakcie przybliżania.
  const kluczPunktow = JSON.stringify(points);
  const kluczBazy = JSON.stringify(baza ?? null);
  const kluczSladu = track ? `${track.length}:${JSON.stringify(track[0])}:${JSON.stringify(track[track.length - 1])}` : '';

  useEffect(() => {
    const map = mapRef.current, layer = layerRef.current;
    if (!map || !layer) return;
    layer.clearLayers();

    const valid = points
      .map((p, i) => ({ p, i }))
      .filter(({ p }) => Number.isFinite(p.lat) && Number.isFinite(p.lng));
    const maBaze = !!baza && Number.isFinite(baza.lat) && Number.isFinite(baza.lng);
    if (valid.length === 0 && !maBaze) return;

    const latLngs = valid.map(({ p }) => L.latLng(p.lat, p.lng));

    // Przerywana linia prosta to uczciwe "tędy mniej więcej". Kiedy dzień zostanie
    // przeliczony, zastępuje ją ciągły przebieg po chodnikach — i wtedy ciągłość
    // linii sama mówi, że to już pomiar, a nie szacunek.
    const kolorLinii = kolorTokenu('--foreground');
    if (track && track.length > 1) {
      L.polyline(track.map(([lat, lng]) => L.latLng(lat, lng)), {
        color: kolorLinii, weight: 3.5, opacity: 0.75
      }).addTo(layer);
    } else if (latLngs.length > 1) {
      L.polyline(latLngs, {
        color: kolorLinii, weight: 2, opacity: 0.45, dashArray: '5 5'
      }).addTo(layer);
    }

    if (maBaze) {
      L.marker(L.latLng(baza!.lat, baza!.lng), {
        keyboard: false,
        title: `Nocleg: ${baza!.name}`,
        zIndexOffset: -100,
        icon: L.divIcon({
          className: '',
          html: `<div style="width:26px;height:26px;border-radius:6px;background:hsl(var(--background));
                 color:hsl(var(--foreground));border:1.5px solid hsl(var(--foreground));display:flex;
                 align-items:center;justify-content:center;box-shadow:0 1px 4px rgba(0,0,0,.25)">${IKONA_DOMU}</div>`,
          iconSize: [26, 26], iconAnchor: [13, 13]
        })
      }).addTo(layer).bindTooltip(`Nocleg: ${baza!.name}`, { direction: 'top', offset: [0, -14] });
    }

    valid.forEach(({ p, i }, k) => {
      // Punkt w noclegu jest już narysowany znakiem domu — nie dublujemy go.
      if (p.nr == null) return;
      const klikalna = !!naPunkt.current;
      const marker = L.marker(latLngs[k], {
        keyboard: klikalna,
        title: klikalna ? `${p.name} — otwórz kartę` : p.name,
        icon: L.divIcon({
          className: '',
          html: `<div style="width:26px;height:26px;border-radius:50%;
                 background:hsl(var(${p.propozycja ? '--accent' : '--primary'}));
                 color:hsl(var(${p.propozycja ? '--accent-foreground' : '--primary-foreground'}));
                 display:flex;align-items:center;justify-content:center;
                 font:500 12px/1 ui-sans-serif,system-ui;box-shadow:0 1px 4px rgba(0,0,0,.3);
                 ${klikalna ? 'cursor:pointer' : ''}">${p.nr}</div>`,
          iconSize: [26, 26], iconAnchor: [13, 13]
        })
      }).addTo(layer).bindTooltip(p.name, { direction: 'top', offset: [0, -14] });

      // Indeks w liście przekazanej przez rodzica, nie w przefiltrowanej.
      if (klikalna) marker.on('click', () => naPunkt.current?.(i));
    });

    const doKadru = track && track.length > 1
      ? track.map(([lat, lng]) => L.latLng(lat, lng))
      : [...latLngs];
    if (maBaze) doKadru.push(L.latLng(baza!.lat, baza!.lng));
    const bounds = L.latLngBounds(doKadru);
    map.fitBounds(bounds.pad(0.2), { animate: false });
    if (doKadru.length === 1) map.setZoom(15);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kluczPunktow, kluczBazy, kluczSladu]);

  return <div ref={containerRef} className={className} />;
}

export default memo(PlanDayMapInner);
