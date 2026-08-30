import { useEffect, useRef, memo } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

export interface PinPlace {
  id: string;
  name: string;
  lat: number;
  lng: number;
  visit_minutes?: number | null;
  /** Kubełek na tablicy. Pole opcjonalne — bez niego pinezka jest neutralna,
   *  więc Odkrywaj, które kubełków nie zna, działa dokładnie jak wcześniej. */
  kubelek?: 'must' | 'nice' | 'rejected' | null;
}

interface DiscoverMapProps {
  places: PinPlace[];
  /** Punkt startowy wyjazdu — hotel, parking, dworzec. Rysowany inaczej niż atrakcje. */
  start?: { name: string; lat: number; lng: number } | null;
  /** Miejsce pod kursorem albo wybrane na liście — jego pinezka jest wyróżniona. */
  aktywne?: string | null;
  onPinClick?: (id: string) => void;
  onPinHover?: (id: string | null) => void;
  /** Zgłasza widoczny prostokąt po każdym przesunięciu i przybliżeniu. */
  onObszar?: (b: { pn: number; pd: number; wsch: number; zach: number }) => void;
  /**
   * Zbiór do ustawienia kadru — pełna lista miejsc, także tych poza widokiem.
   * Kadrowanie do samych widocznych pinezek tworzyło sprzężenie: lista zawężała się
   * kadrem, kadr dopasowywał się do listy i przy nietrafionym starcie obie zostawały
   * puste, bez możliwości wyjścia.
   */
  doKadru?: { lat: number; lng: number }[];
  className?: string;
}

/**
 * Kolory znaczników pochodzą z tokenów motywu, nie z wartości wpisanych tutaj.
 * Leaflet składa ikony z surowego HTML-a, więc klasy Tailwinda do nich nie
 * docierają — zmienna CSS jest jedyną drogą, żeby mapa szła za motywem.
 * `--primary` to „na pewno", `--accent` to „być może", `--foreground` to
 * miejsce bez decyzji.
 */
const token = (nazwa: string, zapas: string) => {
  if (typeof window === 'undefined') return zapas;
  const v = getComputedStyle(document.documentElement).getPropertyValue(nazwa).trim();
  return v ? `hsl(${v})` : zapas;
};

const kolorTla = (wyroznione: boolean, kubelek?: string | null) => {
  if (wyroznione) return token('--primary', 'hsl(158 28% 32%)');
  if (kubelek === 'must') return token('--primary', 'hsl(158 28% 32%)');
  if (kubelek === 'nice') return token('--accent', 'hsl(17 42% 47%)');
  if (kubelek === 'rejected') return token('--muted-foreground', 'hsl(27 13% 39%)');
  return token('--foreground', 'hsl(20 26% 18%)');
};

function pinIcon(numer: number, wyroznione: boolean, kubelek?: string | null) {
  const rozmiar = wyroznione ? 34 : 26;
  return L.divIcon({
    className: '',
    html: `<div style="width:${rozmiar}px;height:${rozmiar}px;border-radius:50%;
      background:${kolorTla(wyroznione, kubelek)};color:${token('--card', 'hsl(40 100% 99%)')};
      display:flex;align-items:center;justify-content:center;
      font:500 ${wyroznione ? 13 : 11}px/1 ui-sans-serif,system-ui;
      border:2px solid ${token('--card', 'hsl(40 100% 99%)')};
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
function DiscoverMapInner({ places, start, aktywne, onPinClick, onPinHover, onObszar, doKadru, className = '' }: DiscoverMapProps) {
  const boxRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const warstwa = useRef<L.LayerGroup | null>(null);
  const markery = useRef<Map<string, L.Marker>>(new Map());
  const dopasowane = useRef<string>('');
  /** Trzymamy w ref, żeby zmiana funkcji nie przepinała nasłuchu mapy. */
  const onObszarRef = useRef(onObszar);
  onObszarRef.current = onObszar;

  useEffect(() => {
    if (!boxRef.current || mapRef.current) return;
    const map = L.map(boxRef.current, { zoomControl: true, attributionControl: true });
    L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_Base/MapServer/tile/{z}/{y}/{x}',
      { maxZoom: 19, attribution: '&copy; Esri, HERE, Garmin, OpenStreetMap' }).addTo(map);
    mapRef.current = map;
    warstwa.current = L.layerGroup().addTo(map);

    // Leaflet zapamiętuje rozmiar kontenera przy tworzeniu. Tutaj mapa powstaje
    // w kolumnie obok listy, której wysokość ustala się dopiero po ułożeniu treści,
    // więc bez przeliczenia mapa zostaje przy rozmiarze sprzed układu: dociąga
    // garść kafelków i trzyma widok świata zamiast dopasować się do pinezek.
    // Obszar zgłaszamy dopiero po zakończeniu ruchu — w trakcie przeciągania
    // lista przebudowywałaby się kilkanaście razy na sekundę.
    const zglos = () => {
      // Mapa ukryta responsywnie albo jeszcze nierozmierzona zwraca kadr zerowy.
      // Zgłoszenie go zawęziłoby listę do pustki i nie dałoby się z tego wyjść,
      // bo mapy, którą trzeba by oddalić, nie widać.
      const rozmiar = map.getSize();
      if (!rozmiar || rozmiar.x < 40 || rozmiar.y < 40) return;
      const b = map.getBounds();
      onObszarRef.current?.({
        pn: b.getNorth(), pd: b.getSouth(), wsch: b.getEast(), zach: b.getWest(),
      });
    };
    map.on('moveend', zglos);
    map.on('zoomend', zglos);

    const ro = new ResizeObserver(() => map.invalidateSize());
    ro.observe(boxRef.current!);
    const t = setTimeout(() => map.invalidateSize(), 250);

    return () => { map.off('moveend', zglos); map.off('zoomend', zglos); ro.disconnect(); clearTimeout(t); map.remove(); mapRef.current = null; };
  }, []);

  useEffect(() => {
    const map = mapRef.current, w = warstwa.current;
    if (!map || !w) return;
    w.clearLayers();
    markery.current.clear();

    const zPolozeniem = places.filter((p) => Number.isFinite(p.lat) && Number.isFinite(p.lng));
    const kadrowe = (doKadru?.length ? doKadru : zPolozeniem)
      .filter((p) => Number.isFinite(p.lat) && Number.isFinite(p.lng));

    // Punkt startowy dostaje własny znacznik: kropla zamiast koła i kolor akcentu,
    // żeby nie dało się go pomylić z ponumerowaną atrakcją. Rysujemy go nawet wtedy,
    // gdy atrakcji jeszcze nie ma — bo wtedy jest jedyną rzeczą na mapie.
    if (start && Number.isFinite(start.lat) && Number.isFinite(start.lng)) {
      L.marker([start.lat, start.lng], {
        zIndexOffset: 1000,
        icon: L.divIcon({
          className: '',
          html: `<div style="position:relative;width:30px;height:38px">
            <div style="width:30px;height:30px;border-radius:50% 50% 50% 0;transform:rotate(-45deg);
              background:${token('--accent', 'hsl(17 42% 47%)')};border:2px solid ${token('--card', 'hsl(40 100% 99%)')};
              box-shadow:0 2px 8px rgba(0,0,0,.35)"></div>
            <div style="position:absolute;top:7px;left:9px;width:12px;height:12px;border-radius:50%;
              background:${token('--card', 'hsl(40 100% 99%)')}"></div>
          </div>`,
          iconSize: [30, 38],
          iconAnchor: [15, 34],
        }),
      }).addTo(w).bindTooltip(`Start: ${start.name}`, { direction: 'top', offset: [0, -34] });
    }

    if (kadrowe.length === 0) {
      if (start && Number.isFinite(start.lat)) {
        map.setView([start.lat, start.lng], 14, { animate: false });
        dopasowane.current = `start:${start.lat},${start.lng}`;
      }
      return;
    }

    zPolozeniem.forEach((p, i) => {
      const m = L.marker([p.lat, p.lng], { icon: pinIcon(i + 1, p.id === aktywne, p.kubelek) })
        .addTo(w)
        .bindTooltip(p.name, { direction: 'top', offset: [0, -16] });
      m.on('click', () => onPinClick?.(p.id));
      m.on('mouseover', () => onPinHover?.(p.id));
      m.on('mouseout', () => onPinHover?.(null));
      markery.current.set(p.id, m);
    });

    // Kadrujemy tylko wtedy, gdy zmienił się zestaw miejsc. Przy samym najechaniu
    // na kartę mapa nie ma prawa uciekać spod kursora.
    // Kadr ustala pełny zbiór, nie sama widoczna lista — inaczej mapa i lista
    // zaciskałyby się nawzajem aż do pustki.
    const podpis = kadrowe.map((p) => `${p.lat},${p.lng}`).join('|') + `|${start?.lat ?? ''}`;
    if (podpis !== dopasowane.current) {
      dopasowane.current = podpis;
      map.invalidateSize();
      const punkty = kadrowe.map((p) => [p.lat, p.lng] as [number, number]);
      if (start && Number.isFinite(start.lat)) punkty.push([start.lat, start.lng]);
      map.fitBounds(L.latLngBounds(punkty).pad(0.15), { animate: false });
    }
  }, [places, start, aktywne, onPinClick, onPinHover, doKadru]);

  return <div ref={boxRef} className={className} />;
}

export default memo(DiscoverMapInner);
