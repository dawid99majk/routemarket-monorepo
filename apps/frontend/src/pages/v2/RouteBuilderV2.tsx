
function getHaversineDistance(lat1: number, lon1: number, lat2: number, lon2: number) {
  const R = 6371; // Radius of the earth in km
  const dLat = (lat2 - lat1) * Math.PI / 180;  
  const dLon = (lon2 - lon1) * Math.PI / 180; 
  const a = 
    Math.sin(dLat/2) * Math.sin(dLat/2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * 
    Math.sin(dLon/2) * Math.sin(dLon/2)
    ; 
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a)); 
  const d = R * c; // Distance in km
  return d;
}
import { useState, useEffect, useRef, useMemo } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Loader2, Sparkles, MapPin, Send, Bot, Trash2, Navigation, Bike, Route as RouteIcon, Building2, Car, ChevronDown, ChevronUp, ChevronLeft, ChevronRight, RefreshCw, ImageIcon, FolderPlus } from 'lucide-react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { supabase } from '@/integrations/supabase/client';
import { useSearchParams, useNavigate } from 'react-router-dom';
import jsPDF from 'jspdf';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
// Leaflet Components
import { MapContainer, TileLayer, Polyline, Marker, Popup, useMap, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

// Fix Leaflet icon issue
// @ts-expect-error Leaflet internal typings issue
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
});

/**
 * Geometria zapisanej trasy wraca w formacie GeoJSON, czyli [lng, lat] — tak
 * samo, jak została zapisana. Wczytywanie przestawiało ją na [lat, lng], a
 * warstwa rysująca robi własną konwersję GeoJSON → Leaflet, więc współrzędne
 * zamieniały się DWA RAZY: trasa z Durrës lądowała na mapie w Arabii Saudyjskiej.
 * Świeżo policzona trasa wyglądała dobrze, bo nie przechodziła przez wczytywanie.
 *
 * Heurystyka na starsze rekordy: jeśli zapis powstał jeszcze przed poprawką i
 * siedzi w kolejności [lat, lng], poznamy to po tym, że pierwszy punkt leży
 * bliżej odwróconej pary niż prostej.
 */
/**
 * Kolor z tokenu dla Leaflet, który przyjmuje wartość, a nie klasę CSS.
 * Wartości zapasowe muszą nadążać za `:root` — ślad trasy jechał w szałwii
 * i tanie ze starej, chłodnej palety, więc na ciepłym papierze rysował się
 * w kolorach, których nie ma już nigdzie indziej w aplikacji.
 */
const kolorTokena = (nazwa: string, zapas: string) => {
  if (typeof window === 'undefined') return zapas;
  const v = getComputedStyle(document.documentElement).getPropertyValue(nazwa).trim();
  return v ? `hsl(${v})` : zapas;
};

const toGeoJsonCoords = (stored: any[], waypoints?: any[]): number[][] => {
  const coords = stored.map((p: any) => [p[0], p[1], p[2] || 0]);
  const wp = waypoints?.[0];
  const first = coords[0];
  if (wp?.lat != null && first) {
    const asGeoJson = Math.abs(first[0] - wp.lng) + Math.abs(first[1] - wp.lat);
    const asSwapped = Math.abs(first[1] - wp.lng) + Math.abs(first[0] - wp.lat);
    if (asSwapped < asGeoJson) {
      console.warn('[Geometria] Zapis w starej kolejności [lat, lng] — prostuję.');
      return coords.map((p) => [p[1], p[0], p[2]]);
    }
  }
  return coords;
};

// A green icon for start, red for end, blue for intermediate.
// Ikony idą z jsDelivr, nie z raw.githubusercontent.com — ten drugi nie jest
// hostingiem zasobów, bywa dławiony i potrafi po cichu zniknąć z mapy.
/**
 * Parking i lokal gastronomiczny czyta się z mapy inaczej niż zabytek: jeden jest
 * miejscem, gdzie zostawiasz auto, drugi przerwą w zwiedzaniu. Kolor pinezki
 * mówi to bez otwierania karty.
 */
const iconColorForKind = (kind?: string, type?: string): string => {
  if (type === 'start') return 'green';
  if (type === 'end') return 'red';
  if (kind === 'parking') return 'grey';
  if (kind === 'food') return 'orange';
  return 'blue';
};

const createIcon = (color: string) => {
  return new L.Icon({
    iconUrl: `https://cdn.jsdelivr.net/gh/pointhi/leaflet-color-markers@master/img/marker-icon-2x-${color}.png`,
    shadowUrl: 'https://cdn.jsdelivr.net/npm/leaflet@1.9.4/dist/images/marker-shadow.png',
    iconSize: [25, 41],
    iconAnchor: [12, 41],
    popupAnchor: [1, -34],
    shadowSize: [41, 41]
  });
};
const startIcon = createIcon('green');
const endIcon = createIcon('red');
const wpIcon = createIcon('blue');

function MapResizer({ geometry }: { geometry: any }) {
  const map = useMap();
  useEffect(() => {
    if (geometry && geometry.coordinates && geometry.coordinates.length > 0) {
      const bounds = L.geoJSON(geometry).getBounds();
      map.fitBounds(bounds, { padding: [50, 50], maxZoom: 18 });
    }
  }, [geometry, map]);
  return null;
}

/**
 * Karta punktu rośnie już po otwarciu — najpierw pojawia się opis, potem zdjęcia.
 * Leaflet przesuwa mapę tylko w momencie otwierania dymka, więc rozrośnięta karta
 * wychodziła poza kadr i nikt jej nie dosuwał. Po każdej zmianie treści prosimy
 * dymek o przeliczenie układu, co uruchamia wbudowane autoPan.
 */
function PopupAutoFit({ dep }: { dep: string }) {
  const map = useMap();
  useEffect(() => {
    const popup = (map as any)._popup;
    if (!popup) return;
    // Dwie klatki: pierwsza na przeliczenie wysokości przez przeglądarkę
    const id = requestAnimationFrame(() => requestAnimationFrame(() => {
      try { popup.update(); } catch { /* dymek zamknięty w międzyczasie */ }
    }));
    return () => cancelAnimationFrame(id);
  }, [dep, map]);
  return null;
}

/**
 * Dodawanie punktów siedzi na prawym przycisku, nie na zwykłym kliknięciu.
 * Wcześniej każde tknięcie mapy otwierało menu "ustaw jako start / dodaj do
 * trasy" — także to, którym zamyka się kartę punktu. Zamknięcie karty musi być
 * ruchem bez konsekwencji, a dodanie przystanku to decyzja, więc należy jej się
 * osobny gest. Na dotyku Leaflet zgłasza dłuższe przytrzymanie jako to samo
 * zdarzenie, więc gest działa i tam.
 */
function ClickableMap({ onMapClick, onDismiss }: {
  onMapClick: (latlng: L.LatLng) => void;
  onDismiss: () => void;
}) {
  useMapEvents({
    contextmenu(e) {
      onMapClick(e.latlng);
    },
    click() {
      onDismiss();
    },
  });
  return null;
}

import { ElevationProfile } from '@/components/ElevationProfile';
import { apiPost } from '@/lib/api';
import { useWizardMachine } from '@/hooks/use-wizard-machine';
import { TRIP_PRESETS, EMPTY_AXES } from '@/lib/tripPresets';
import RouteOptionCards from '@/pages/v2/components/RouteOptionCards';
import InterviewOverlay from '@/pages/v2/components/InterviewOverlay';

const areWaypointsGeometricallyEqual = (a: any[], b: any[]) => {
  if (!a || !b || a.length !== b.length) return false;
  return a.every((p, i) => Math.abs(p.lat - b[i].lat) < 0.00001 && Math.abs(p.lng - b[i].lng) < 0.00001);
};

/**
 * Ksztalt kolumny `requirements` w route_builder_projects. Trzymamy w niej stan
 * wywiadu i gotowa trase, zeby uzytkownik mogl wrocic do przerwanej rozmowy.
 * Pola sa opcjonalne, bo zapis powstaje etapami: po pierwszej odpowiedzi jest
 * w niej sam `phase`, a geometria dochodzi dopiero po policzeniu trasy.
 */
interface ZapisaneWymagania {
  chatMessages?: unknown[];
  phase?: string;
  tripProfile?: Record<string, unknown>;
  distanceTargetKm?: number;
  gpxData?: string;
  guideText?: string;
  vehicleType?: string;
  bikeSubtype?: string;
  /** Punkty trasy zapisane jako [lat, lng, wysokosc] — tak zwraca je routing. */
  geometry?: number[][];
  /** Ksztalt opisany na miejscu, zeby nie ciagnac typu z pakietu maszyny. */
  waypoints?: { lat: number; lng: number; type?: string; kind?: string; name?: string }[];
  autoCalculate?: boolean;
}

export default function RouteBuilderV2({ initialData, onBack }: { initialData?: any, onBack?: () => void }) {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  const { state, context, send, setField, chooseOption, retryLastAction } = useWizardMachine(searchParams.get('projectId'));
  
  const projectId = context.projectId;
  const chatMessages = context.chatMessages;
  const inputNotes = context.inputNotes;
  const vehicleType = context.vehicleType;
  const bikeSubtype = context.bikeSubtype;
  const waypoints = context.waypoints;
  const geometry = context.geometry;
  const gpxData = context.gpxData;
  const guideText = context.guideText;
  const routingPreference = context.routingPreference;
  
  const isRouting = state.matches('generating_route') || state.matches('saving_project');
  const isTyping = state.matches('chatting');
  const isGenerating = state.matches('generating_route');
  const isSaving = state.matches('saving_project');
  // Status pracy agenta — bez tego użytkownik nie wie, czy system liczy, czy zamarł.
  const [overlayDismissed, setOverlayDismissed] = useState(false);
  // Na wąskim ekranie panel przykrywa mapę tylko na żądanie — wcześniej zajmował
  // stałe 400 px i przy 375 px szerokości wypychał mapę całkowicie poza kadr.
  const [panelOpen, setPanelOpen] = useState(false);
  const hasError = state.matches('error');
  // Warstwę pokazujemy też po wznowieniu — faza jest teraz zapisywana z projektem
  const busyLabel = isTyping
    ? 'Agent myśli…'
    : isGenerating
      ? 'Wyznaczam trasę…'
      : isSaving
        ? 'Zapisuję projekt…'
        : null;

  const lastLoadedId = useRef<string | null>(null);

  useEffect(() => {
    if (initialData && !projectId && context.chatMessages.length === 0) {
      setField('vehicleType', initialData.vehicleType);
      if (initialData.bikeSubtype) setField('bikeSubtype', initialData.bikeSubtype);
      setField('routingPreference', initialData.routingPreference);
      setField('inputNotes', initialData.inputNotes);
      
      // Auto-start the conversation with the AI based on the user's setup
      send({ 
        type: 'SEND_MESSAGE', 
        text: `Cześć, chcę stworzyć trasę. Oto moje założenia:\n${initialData.inputNotes}\nProszę, zaproponuj mi punkty trasy lub dopytaj o szczegóły jeśli potrzebujesz więcej informacji.` 
      });
    }
  }, [initialData, projectId]);

  
  
  
  
  
  
  
  const [tempMarker, setTempMarker] = useState<L.LatLng | null>(null);

  // State to store AI-generated descriptions and recommendations for clicked waypoints
  const [poiDetails, setPoiDetails] = useState<Record<string, { description: string, recommendation: string, photos?: string[], loading?: boolean }>>({});
  // Karta startuje zwinięta — rozwijamy tylko ten punkt, który kogoś zainteresował
  const [expandedPoints, setExpandedPoints] = useState<Record<string, boolean>>({});
  const [photoIndex, setPhotoIndex] = useState<Record<string, number>>({});
  // Zdjęcia, których przeglądarka nie wczytała — wypadają z galerii zamiast chować cały pasek
  const [brokenPhotos, setBrokenPhotos] = useState<Set<string>>(new Set());
  // Bez tego każde przeliczenie trasy strzelałoby po opisy tych samych punktów od nowa
  const prefetchedRef = useRef<Set<string>>(new Set());

  // Helper to prevent clicks and double clicks inside leaflet popups from bubbling up to map click events
  const disablePropagation = (el: HTMLElement | null) => {
    if (el) {
      // React 17+ podpina listenery w korzeniu aplikacji, więc natywne zdarzenie
      // dociera do kontenera mapy ZANIM zadziała e.stopPropagation() z handlera.
      // Klik w strzałkę galerii lądował na mapie i otwierał "dodaj punkt".
      L.DomEvent.disableClickPropagation(el);
      L.DomEvent.disableScrollPropagation(el);
      // disableClickPropagation nie zatrzymuje samego 'click' — polega na fladze,
      // po której Leaflet ma go pominąć. Gdy ta ścieżka zawiedzie, klik w strzałkę
      // galerii dociera do mapy: karta się zamyka i wyskakuje "dodaj punkt".
      // Natywny stopPropagation w fazie bąbelkowania kończy sprawę: przycisk swój
      // handler już wykonał, a do kontenera mapy zdarzenie po prostu nie dochodzi.
      L.DomEvent.on(el, 'click mousedown dblclick pointerdown touchstart', L.DomEvent.stopPropagation);
    }
  };

  const pointKeyOf = (wp: any, index: number) => wp.name || `Punkt ${index + 1}`;

  /**
   * Opisy i zdjęcia pobierane od razu po wyznaczeniu trasy, jednym zapytaniem dla
   * wszystkich punktów. Wcześniej każdy marker ładował się dopiero po kliknięciu —
   * użytkownik czekał przy każdym punkcie z osobna, zamiast dostać gotową trasę.
   */
  useEffect(() => {
    if (!geometry || waypoints.length === 0) return;

    const missing = waypoints
      .map((wp: any, i: number) => ({ name: pointKeyOf(wp, i), lat: wp.lat, lng: wp.lng }))
      .filter((p) => !prefetchedRef.current.has(p.name));
    if (missing.length === 0) return;

    missing.forEach((p) => prefetchedRef.current.add(p.name));
    setPoiDetails((prev) => {
      const next = { ...prev };
      for (const p of missing) {
        if (!next[p.name]) next[p.name] = { description: '', recommendation: '', loading: true };
      }
      return next;
    });

    (async () => {
      try {
        const data = await apiPost<any>('/points-details', { points: missing }, { timeoutMs: 90_000 });
        setPoiDetails((prev) => {
          const next = { ...prev };
          for (const p of missing) {
            const d = data.details?.[p.name];
            next[p.name] = {
              description: d?.description || 'Brak opisu dla tego miejsca.',
              recommendation: d?.recommendation || '',
              photos: d?.photos || [],
              loading: false
            };
          }
          return next;
        });
      } catch (err) {
        console.error('Nie udało się pobrać opisów punktów:', err);
        // Punkty wracają do puli — klikniecie w marker spróbuje pojedynczo
        missing.forEach((p) => prefetchedRef.current.delete(p.name));
        setPoiDetails((prev) => {
          const next = { ...prev };
          for (const p of missing) if (next[p.name]?.loading) delete next[p.name];
          return next;
        });
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [geometry, waypoints.length]);

  const handleMarkerClick = async (wp: any, index: number) => {
    const pointKey = wp.name || `Punkt ${index + 1}`;
    
    // Skip if already loading or loaded
    if (poiDetails[pointKey]) return;
    prefetchedRef.current.add(pointKey);
    
    // Set loading state
    setPoiDetails(prev => ({
      ...prev,
      [pointKey]: { description: '', recommendation: '', loading: true }
    }));

    try {
      const data = await apiPost<any>('/point-details', {
        name: pointKey,
        lat: wp.lat,
        lng: wp.lng
      }, { timeoutMs: 30_000 });
      setPoiDetails(prev => ({
        ...prev,
        [pointKey]: {
          description: data.description || 'Brak opisu dla tego miejsca.',
          recommendation: data.recommendation || 'Brak dodatkowych rekomendacji.',
          photos: data.photos || [],
          loading: false
        }
      }));
    } catch (err) {
      console.error("Error fetching point details:", err);
      setPoiDetails(prev => ({
        ...prev,
        [pointKey]: {
          description: 'Nie udało się załadować opisu.',
          recommendation: 'Spróbuj ponownie później.',
          loading: false
        }
      }));
    }
  };

  /**
   * Trasa → tablica wyjazdu. Gotowy przebieg bywa dopiero punktem wyjścia:
   * użytkownik chce potem dokładać miejsca, zmieniać priorytety i układać dni,
   * a to wszystko żyje w projekcie, nie w kreatorze. Punkty trafiają jako
   * "koniecznie", bo skoro są na trasie, to zostały już świadomie wybrane.
   */
  const [savingProject, setSavingProject] = useState(false);
  const saveAsProject = async () => {
    if (waypoints.length === 0) return;
    setSavingProject(true);
    try {
      const { data: userData } = await supabase.auth.getUser();
      if (!userData.user) throw new Error('Zaloguj się, żeby zapisać projekt');

      // Kierunek bierzemy z nazwy startu — to najbliższe miastu, co mamy pod ręką
      const destination = (waypoints[0]?.name || context.title || 'Wyjazd').split(',')[0].trim();
      const preset = TRIP_PRESETS.find((t) => t.label === context.tripProfile?.charakter);

      const { data: project, error } = await supabase
        .from('trip_projects')
        .insert({
          user_id: userData.user.id,
          name: context.title && context.title !== 'Nowa Trasa AI' ? context.title : `Wyjazd: ${destination}`,
          destination,
          destination_lat: waypoints[0]?.lat ?? null,
          destination_lng: waypoints[0]?.lng ?? null,
          days: 1,
          trip_type: preset?.id ?? null,
          ...(preset?.axes ?? EMPTY_AXES)
        })
        .select('id')
        .single();
      if (error) throw error;

      const rows = waypoints.map((wp: any, i: number) => ({
        project_id: project.id,
        name: wp.name || `Punkt ${i + 1}`,
        category: 'attraction',
        priority: 'must',
        lat: wp.lat,
        lng: wp.lng,
        sort_order: i,
        description: poiDetails[wp.name || `Punkt ${i + 1}`]?.description || '',
        source: 'route'
      }));
      const { error: placesError } = await supabase.from('trip_project_places').insert(rows);
      if (placesError) throw placesError;

      toast.success(`Utworzono projekt z ${rows.length} miejscami`);
      navigate(`/plany?project=${project.id}`);
    } catch (err: any) {
      toast.error(err.message || 'Nie udało się utworzyć projektu');
    } finally {
      setSavingProject(false);
    }
  };

  const handleAddPointFromTemp = (type: 'start' | 'end' | 'waypoint') => {
    if (!tempMarker) return;
    
    // Dispatch to XState instead of manually manipulating array
    if (type === 'start' || type === 'end') {
        const existingIdx = waypoints.findIndex((w: any) => w.type === type);
        if (existingIdx >= 0) {
           send({ type: 'UPDATE_WAYPOINT', index: existingIdx, waypoint: { lat: tempMarker.lat, lng: tempMarker.lng, type } });
        } else {
           send({ type: 'ADD_WAYPOINT', waypoint: { lat: tempMarker.lat, lng: tempMarker.lng, type }, index: type === 'start' ? 0 : undefined });
        }
    } else {
        // Waypoint insertion logic simplified
        send({ type: 'ADD_WAYPOINT', waypoint: { lat: tempMarker.lat, lng: tempMarker.lng, type: 'waypoint' } });
    }

    setTempMarker(null);
  };
  
  

  
  
  const [inputValue, setInputValue] = useState('');
  
  
  
  const chatEndRef = useRef<HTMLDivElement>(null);

  const [activeTab, setActiveTab] = useState<'chat' | 'details' | 'saved'>('chat');
  const [showNotes, setShowNotes] = useState<boolean>(true);

  // Calculate route stats (distance and ascent/descent)
  const routeStats = useMemo(() => {
    if (!geometry || !geometry.coordinates || geometry.coordinates.length < 2) {
      return { distance: 0, ascent: 0, descent: 0 };
    }
    let totalDist = 0;
    let totalAscent = 0;
    let totalDescent = 0;
    const coords = geometry.coordinates;
    for (let i = 0; i < coords.length - 1; i++) {
      const [lng1, lat1, ele1] = coords[i];
      const [lng2, lat2, ele2] = coords[i+1];
      totalDist += getHaversineDistance(lat1, lng1, lat2, lng2);
      const eleDiff = (ele2 || 0) - (ele1 || 0);
      if (eleDiff > 0) {
        totalAscent += eleDiff;
      } else {
        totalDescent -= eleDiff;
      }
    }
    return {
      distance: totalDist,
      ascent: totalAscent,
      descent: totalDescent
    };
  }, [geometry]);

  // Load existing project if projectId is in URL / context on mount
  // IMPORTANT: Do NOT overwrite geometry/waypoints if we already have them in state
  // (this happens when save assigns a new projectId — we already have the fresh route)

  useEffect(() => {
    if (projectId && lastLoadedId.current !== projectId) {
      // If we already have geometry in state, it means we just generated a route
      // and saveProjectActor assigned a new projectId. Skip reload to prevent overwriting.
      const alreadyHasRoute = !!geometry;
      lastLoadedId.current = projectId;

      if (alreadyHasRoute) return;

      supabase.from('route_builder_projects').select('*').eq('id', projectId).single()
        .then(({ data }) => {
           if (data && data.requirements) {
              // `requirements` to kolumna jsonb — baza nie zna jej ksztaltu, wiec
              // typy wygenerowane ze schematu oddaja ja jako unie Json. Opisujemy
              // ja raz, tutaj, zamiast rzutowac przy kazdym odczycie pola.
              const reqs = data.requirements as unknown as ZapisaneWymagania;
              if (reqs.chatMessages) setField('chatMessages', reqs.chatMessages);
              if (reqs.phase) setField('phase', reqs.phase);
              if (reqs.tripProfile) setField('tripProfile', reqs.tripProfile);
              if (reqs.distanceTargetKm) setField('distanceTargetKm', reqs.distanceTargetKm);
              if (reqs.gpxData) setField('gpxData', reqs.gpxData);
              if (reqs.guideText) setField('guideText', reqs.guideText);
              if (reqs.vehicleType) setField('vehicleType', reqs.vehicleType);
              if (reqs.bikeSubtype) setField('bikeSubtype', reqs.bikeSubtype);
              if (reqs.geometry) {
                setField('geometry', {
                  type: 'LineString',
                  coordinates: toGeoJsonCoords(reqs.geometry, reqs.waypoints)
                });
              }
              if (reqs.waypoints) {
                  setField('waypoints', reqs.waypoints);
                  // Trasa przyniesiona z planu wyjazdu ma komplet punktów i nie
                  // potrzebuje wywiadu — liczymy przebieg od razu, zamiast
                  // pokazywać pusty ekran rozmowy.
                  if (reqs.autoCalculate && reqs.waypoints.length >= 2 && !reqs.geometry) {
                    setTimeout(() => {
                      if (stateRef.current.matches('idle')) send({ type: 'CALCULATE_ROUTE' });
                    }, 300);
                  }
              }
              if (reqs.gpxData || reqs.guideText) {
                setActiveTab('details');
              }
           }
        });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);

  // Sync browser URL search params with the current projectId from machine context
  useEffect(() => {
    if (projectId && searchParams.get('projectId') !== projectId) {
      navigate(`/route-builder-v2?projectId=${projectId}`, { replace: true });
    }
  }, [projectId, navigate, searchParams]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatMessages, isTyping]);

  // Saved Projects states and functions
  const [savedProjects, setSavedProjects] = useState<any[]>([]);
  const [isLoadingSaved, setIsLoadingSaved] = useState(false);

  const fetchSavedProjects = async () => {
    setIsLoadingSaved(true);
    try {
      const { data: userData } = await supabase.auth.getUser();
      if (!userData.user) return;

      const { data, error } = await supabase
        .from('route_builder_projects')
        .select('*')
        .eq('user_id', userData.user.id)
        .order('updated_at', { ascending: false });

      if (error) throw error;
      setSavedProjects(data || []);
    } catch (e: any) {
      console.error("Error fetching saved projects:", e);
      toast.error("Nie udało się pobrać zapisanych tras");
    } finally {
      setIsLoadingSaved(false);
    }
  };

  const handleLoadProject = (project: any) => {
    const reqs = project.requirements || {};
    setField('projectId', project.id);
    if (reqs.chatMessages) setField('chatMessages', reqs.chatMessages);
    if (reqs.phase) setField('phase', reqs.phase);
    if (reqs.tripProfile) setField('tripProfile', reqs.tripProfile);
    if (reqs.distanceTargetKm) setField('distanceTargetKm', reqs.distanceTargetKm);
    if (reqs.gpxData) setField('gpxData', reqs.gpxData);
    if (reqs.guideText) setField('guideText', reqs.guideText);
    if (reqs.vehicleType) setField('vehicleType', reqs.vehicleType);
    if (reqs.bikeSubtype) setField('bikeSubtype', reqs.bikeSubtype);
    if (reqs.geometry) {
       setField('geometry', { type: 'LineString', coordinates: toGeoJsonCoords(reqs.geometry, reqs.waypoints) });
    } else {
       setField('geometry', null);
    }
    if (reqs.waypoints) {
       setField('waypoints', reqs.waypoints);
    } else {
       setField('waypoints', []);
    }
    navigate(`/route-builder-v2?projectId=${project.id}`, { replace: true });
    setActiveTab('details');
    toast.success(`Wczytano trasę: ${reqs.title || 'Moja trasa AI'}`);
  };

  const handleDeleteProject = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm("Czy na pewno chcesz usunąć tę trasę?")) return;
    
    try {
      const { error } = await supabase
        .from('route_builder_projects')
        .delete()
        .eq('id', id);
        
      if (error) throw error;
      toast.success("Trasa została usunięta");
      setSavedProjects(prev => prev.filter(p => p.id !== id));
      if (projectId === id) {
        clearRoute();
      }
    } catch (e: any) {
      console.error("Error deleting project:", e);
      toast.error("Nie udało się usunąć trasy");
    }
  };

  useEffect(() => {
    if (activeTab === 'saved') {
      fetchSavedProjects();
    }
  }, [activeTab]);



  // Ref to always have current machine state available inside timeouts
  const stateRef = useRef(state);
  stateRef.current = state;

  // Event-driven recalculation handlers triggered ONLY on user clicking UI selector buttons.
  // This completely removes the reactive useEffect and prevents any automatic/mount-time loop.
  const handleVehicleChange = (type: any) => {
    setField('vehicleType', type);
    if (waypoints.length >= 2) {
      setTimeout(() => {
        if (stateRef.current.matches('idle')) {
          send({ type: 'CALCULATE_ROUTE' });
        }
      }, 100);
    }
  };

  const handleBikeSubtypeChange = (subtype: any) => {
    setField('bikeSubtype', subtype);
    if (waypoints.length >= 2) {
      setTimeout(() => {
        if (stateRef.current.matches('idle')) {
          send({ type: 'CALCULATE_ROUTE' });
        }
      }, 100);
    }
  };

  const handleMapClick = (latlng: L.LatLng) => {
    setTempMarker(latlng);
  };

  const handleMarkerDrag = (index: number, e: any) => {
    const newPos = e.target.getLatLng();
    send({ type: 'UPDATE_WAYPOINT', index, waypoint: { ...waypoints[index], lat: newPos.lat, lng: newPos.lng } });
  };

  const handleRemoveWaypoint = (index: number) => {
    send({ type: 'REMOVE_WAYPOINT', index });
  };

  const calculateLiveRoute = async () => {
    send({ type: 'CALCULATE_ROUTE' });
  };

  const clearRoute = () => {
    // Nazwa poprzedniej trasy zostawała na kolejnej: użytkownik raz ją poprawił,
    // flaga titleTouched blokowała podpowiedzi agenta i nowy spacer po Kruji
    // nazywał się dalej "Durrës z dziećmi".
    setField('title', 'Nowa Trasa AI');
    setField('titleTouched' as any, false);
    setField('waypoints', []);
    setField('geometry', null);
    setField('gpxData', null);
    setField('guideText', null);
    setField('projectId', null);
    navigate('/route-builder-v2', { replace: true });
  };

  const handleDownloadPdf = async () => {
    if (!guideText) return;
    const element = document.getElementById('guidebook-content');
    if (!element) {
        toast.error('Nie znaleziono zawartości przewodnika');
        return;
    }
    
    // Dynamic import of html2pdf to prevent load-time crashes
    // @ts-ignore
    const html2pdfModule = await import('html2pdf.js');
    // html2pdf.js nie dowozi wlasnych typow, a `default || modul` daje unie,
    // ktorej TypeScript nie uzna za wywolywalna. Opisujemy tylko ten fragment
    // API, z ktorego faktycznie korzystamy.
    type Html2Pdf = () => {
      set: (opcje: unknown) => {
        from: (element: HTMLElement) => { save: () => Promise<void> };
      };
    };
    const html2pdf = (html2pdfModule.default || html2pdfModule) as unknown as Html2Pdf;
    
    // Tworzymy kopię elementu, by PDF nie miał tła i szarych ramek (chcemy "czysty" styl druku)
    const printElement = element.cloneNode(true) as HTMLElement;
    printElement.className = 'prose prose-sm prose-neutral max-w-none p-8 bg-card';
    
    const wrapper = document.createElement('div');
    wrapper.appendChild(printElement);
    document.body.appendChild(wrapper);

    const opt = {
      margin:       15,
      filename:     'przewodnik_trasy.pdf',
      image: { type: 'jpeg' as 'jpeg', quality: 0.98 },
      html2canvas:  { scale: 2, useCORS: true, backgroundColor: '#ffffff' },
      jsPDF:        { unit: 'mm', format: 'a4', orientation: 'portrait' as 'portrait' }
    };

    html2pdf().set(opt).from(wrapper).save().then(() => {
        document.body.removeChild(wrapper);
    });
  };

  const handleChatSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputValue.trim() || isTyping) return;
    // W trakcie generowania/zapisu wiadomość przerywa bieżącą pracę — maszyna
    // obsługuje SEND_MESSAGE w tych stanach, więc nie blokujemy wysyłki.
    const userText = inputValue;
    setInputValue('');
    send({ type: 'SEND_MESSAGE', text: userText });
  };

  // Wywiad zajmuje cały ekran, dopóki nie ma trasy — panel 400 px był za ciasny
  // na karty wyboru. Po wygenerowaniu warstwa znika i odsłania mapę.
  // Wywiad jest ekranem startowym kreatora, nie dodatkiem po pierwszej wiadomości:
  // wcześniej użytkownik lądował na mapie z wąskim panelem czatu i to właśnie
  // ten ciasny widok był pierwszym wrażeniem.
  const interviewActive = !overlayDismissed && !geometry && context.phase !== 'generate';

  return (
    <div className="relative flex h-[100dvh] w-full bg-muted font-sans overflow-hidden">
      {interviewActive && (
        <InterviewOverlay
          messages={chatMessages}
          phase={context.phase}
          tripProfile={context.tripProfile}
          busyLabel={busyLabel}
          errorMessage={hasError ? context.errorMessage : null}
          onRetry={retryLastAction}
          onTripCharacterChange={(label) => setField('tripProfile', { ...context.tripProfile, charakter: label })}
          title={context.title}
          onTitleChange={(value) => { setField('title', value); setField('titleTouched' as any, true); }}
          vehicleType={vehicleType}
          routingPreference={routingPreference}
          onVehicleChange={handleVehicleChange}
          onRoutingPreferenceChange={(pref) => setField('routingPreference', pref)}
          onChoose={chooseOption}
          onRewind={(phase) => send({ type: 'REWIND_TO_PHASE', phase })}
          onSend={(text) => {
            // Pierwsza wypowiedź jest briefem wyjazdu — zapisujemy ją jako założenia,
            // żeby była widoczna w panelu i trafiała do agenta przy kolejnych turach.
            if (chatMessages.length === 0 && !inputNotes.trim()) setField('inputNotes', text);
            send({ type: 'SEND_MESSAGE', text });
          }}
          onClose={() => setOverlayDismissed(true)}
        />
      )}
      
      {/* Left Panel - Control & Chat */}
      <div className={`${panelOpen ? 'flex' : 'hidden'} md:flex absolute md:static inset-x-0 bottom-0 z-[1100] md:z-10 max-h-[78dvh] md:max-h-none w-full md:w-[400px] flex-col bg-card border-t md:border-t-0 md:border-r border-border shadow-token-xl md:shrink-0 rounded-t-md md:rounded-none`}>
        
        {/* Header */}
        <div className="p-5 border-b border-border bg-card">
          {onBack && (
            <button onClick={onBack} className="text-xs text-muted-foreground hover:text-foreground/80 flex items-center mb-3">
              ← Zmień tryb
            </button>
          )}
          <div className="flex items-start justify-between gap-2">
            <h2 className="text-xl font-black text-foreground tracking-tight flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-primary" />
              Atlas Builder Live
            </h2>
            <button
              type="button"
              onClick={() => setPanelOpen(false)}
              className="md:hidden text-muted-foreground hover:text-foreground/80 p-1 -mr-1"
              aria-label="Zwiń panel"
            >
              <ChevronDown className="w-5 h-5" />
            </button>
          </div>
          <p className="text-xs text-muted-foreground font-medium mt-1">Dodawaj punkty na mapie lub rozmawiaj z Agentem.</p>
          {/* Kreator był ślepym zaułkiem — pełny ekran bez wyjścia do reszty aplikacji. */}
          <div className="flex items-center gap-3 mt-3 text-xs font-semibold">
            <button onClick={() => navigate('/plany')} className="text-muted-foreground hover:text-primary">Plany</button>
            <span className="text-muted-foreground">·</span>
            <button onClick={() => navigate('/my-routes')} className="text-muted-foreground hover:text-primary">Moje trasy</button>
            <span className="text-muted-foreground">·</span>
            <button onClick={() => navigate('/')} className="text-muted-foreground hover:text-primary">Start</button>
          </div>
        </div>

        {/* Tabs Switcher */}
        <div className="flex border-b border-border p-2 bg-muted/30 gap-1 shrink-0">
          <button
            onClick={() => setActiveTab('chat')}
            className={`flex-1 py-2 px-3 text-xs font-semibold rounded-md transition-all duration-200 ${
              activeTab === 'chat'
                ? 'bg-card text-primary shadow-token-sm border border-border/50'
                : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
            }`}
          >
            Kreator AI
          </button>
          <button
            onClick={() => setActiveTab('details')}
            className={`flex-1 py-2 px-3 text-xs font-semibold rounded-md transition-all duration-200 flex items-center justify-center gap-1.5 ${
              activeTab === 'details'
                ? 'bg-card text-primary shadow-token-sm border border-border/50'
                : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
            }`}
          >
            Szczegóły
            {geometry && (
              <span className="text-[10px] bg-primary/10 text-primary px-1.5 py-0.5 rounded-full font-bold ml-1">
                {routeStats.distance.toFixed(1)} km
              </span>
            )}
          </button>
          <button
            onClick={() => setActiveTab('saved')}
            className={`flex-1 py-2 px-3 text-xs font-semibold rounded-md transition-all duration-200 ${
              activeTab === 'saved'
                ? 'bg-card text-primary shadow-token-sm border border-border/50'
                : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
            }`}
          >
            Moje trasy
          </button>
        </div>

        {activeTab === 'chat' && (
          <>
            {/* Notes / Settings Area */}
            <div className="border-b border-border bg-muted/50">
              <button 
                onClick={() => setShowNotes(!showNotes)}
                className="w-full px-5 py-3 flex items-center justify-between text-xs font-semibold text-foreground/80 uppercase tracking-wider hover:bg-muted/30 transition-colors"
              >
                <span className="flex items-center gap-1.5">Założenia trasy</span>
                <span className="text-muted-foreground font-normal normal-case flex items-center gap-0.5">
                  {showNotes ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                </span>
              </button>
              
              {showNotes && (
                <div className="px-5 pb-4 pt-1 space-y-3 animate-in fade-in slide-in-from-top-1 duration-200">
                  <Textarea 
                    placeholder="Napisz gdzie jedziesz i na czym, np. 50km w Karkonoszach pieszo..." 
                    className="min-h-[70px] bg-card resize-none text-sm border-border focus-visible:ring-ring/30"
                    value={inputNotes}
                    onChange={e => setField('inputNotes', e.target.value)}
                  />
                  <Button
                    type="button"
                    disabled={!inputNotes.trim() || !!busyLabel}
                    onClick={() => {
                      send({ type: 'SEND_MESSAGE', text: inputNotes });
                      setOverlayDismissed(false);
                    }}
                    className="w-full bg-foreground hover:bg-foreground/90 text-background"
                  >
                    <Sparkles className="w-4 h-4 mr-2" />
                    {chatMessages.length > 0 ? 'Przelicz z tymi założeniami' : 'Zacznij od tych założeń'}
                  </Button>
                  {waypoints.length > 0 && (
                    <div className="flex justify-between items-center bg-primary/10 text-primary px-3 py-2 rounded-md text-xs font-medium">
                      <span>Punkty na mapie: {waypoints.length}</span>
                      <button onClick={clearRoute} className="text-danger hover:text-danger/80 flex items-center gap-1 font-semibold">
                        <Trash2 className="w-3.5 h-3.5" /> Wyczyść
                      </button>
                    </div>
                  )}

                  {/* Routing Preference Selector */}
                  <div className="pt-2 border-t border-border">
                    <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-2 block">Styl trasy</span>
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        onClick={() => setField('routingPreference', 'popular')}
                        className={`py-3 px-2 text-xs font-medium rounded-md border transition-all duration-200 flex flex-col items-center justify-center gap-2 ${
                          routingPreference === 'popular'
                            ? 'bg-primary/5 border-primary text-primary shadow-token-sm ring-1 ring-primary/20'
                            : 'bg-card border-border text-foreground/80 hover:bg-muted hover:border-border'
                        }`}
                      >
                        <Sparkles className={`w-5 h-5 ${routingPreference === 'popular' ? 'text-primary' : 'text-muted-foreground'}`} />
                        <span className="text-center leading-tight">Klasyki regionu</span>
                      </button>
                      <button
                        onClick={() => setField('routingPreference', 'wild')}
                        className={`py-3 px-2 text-xs font-medium rounded-md border transition-all duration-200 flex flex-col items-center justify-center gap-2 ${
                          routingPreference === 'wild'
                            ? 'bg-primary/5 border-primary text-primary shadow-token-sm ring-1 ring-primary/20'
                            : 'bg-card border-border text-foreground/80 hover:bg-muted hover:border-border'
                        }`}
                      >
                        <MapPin className={`w-5 h-5 ${routingPreference === 'wild' ? 'text-primary' : 'text-muted-foreground'}`} />
                        <span className="text-center leading-tight">Poza szlakiem</span>
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Chat Messages */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-muted/30">
              {chatMessages.length === 0 && (
                <div className="text-center text-muted-foreground text-sm mt-10 px-4">
                  <Bot className="w-10 h-10 mx-auto mb-3 opacity-40 text-primary" />
                  Napisz do mnie, a pomogę Ci dobrać odpowiednią trasę i miejsca na mapie!
                </div>
              )}
              {chatMessages.map((msg, i) => (
                <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                  <div className={`max-w-[85%] ${msg.role === 'user' ? '' : 'w-full'}`}>
                    <div className={`rounded-md p-3 text-sm leading-relaxed shadow-token-sm ${
                      msg.role === 'user'
                        ? 'bg-foreground text-background rounded-br-sm'
                        : 'bg-card text-foreground rounded-bl-sm border border-border/50'
                    }`}>
                      {msg.text.replace(/\s*\[[^\]]+\]/g, '')}
                    </div>
                    {msg.options && msg.options.length > 0 && (
                      <RouteOptionCards
                        options={msg.options}
                        allowCustom={msg.allowCustom}
                        disabled={i !== chatMessages.length - 1 || isTyping}
                        onChoose={chooseOption}
                      />
                    )}
                  </div>
                </div>
              ))}
              {hasError && (
                <div className="rounded-md border border-accent-foreground/30 bg-accent p-3.5 space-y-2.5">
                  <div className="text-sm font-semibold text-accent-foreground">Nie udało się dokończyć operacji</div>
                  <p className="text-xs text-accent-foreground leading-relaxed">
                    {context.errorMessage || 'Nieznany błąd.'}
                  </p>
                  <Button
                    size="sm"
                    onClick={retryLastAction}
                    className="w-full bg-foreground hover:bg-foreground/90 text-background h-8 text-xs font-semibold"
                  >
                    <RefreshCw className="w-3.5 h-3.5 mr-1.5" /> Spróbuj ponownie
                  </Button>
                </div>
              )}
              {busyLabel && (
                <div className="flex justify-start">
                  <div className="bg-card text-foreground rounded-md rounded-bl-sm border border-border/50 p-4 shadow-token-sm flex items-center gap-2">
                    <span className="text-xs text-muted-foreground">{busyLabel}</span>
                    <span className="w-1.5 h-1.5 bg-muted rounded-full animate-bounce"></span>
                    <span className="w-1.5 h-1.5 bg-muted rounded-full animate-bounce delay-75"></span>
                    <span className="w-1.5 h-1.5 bg-muted rounded-full animate-bounce delay-150"></span>
                  </div>
                </div>
              )}
              <div ref={chatEndRef} />
            </div>

            {/* Chat Input */}
            <div className="p-4 bg-card border-t border-border">
              <form onSubmit={handleChatSubmit} className="relative flex items-center">
                <Input 
                  value={inputValue}
                  onChange={e => setInputValue(e.target.value)}
                  placeholder={isGenerating || isSaving ? "Możesz napisać, co zmienić…" : "Zapytaj agenta o poradę..."}
                  className="w-full bg-muted border-border rounded-full pl-4 pr-12 py-5 text-foreground focus-visible:ring-ring/50"
                />
                <Button type="submit" size="icon" className="absolute right-1 rounded-full bg-foreground hover:bg-foreground/90 w-8 h-8 text-white">
                  <Send className="w-3.5 h-3.5 ml-0.5" />
                </Button>
              </form>
            </div>
          </>
        )}

        {activeTab === 'details' && (
          <div className="flex-1 overflow-y-auto p-5 space-y-5">
            {!geometry ? (
              <div className="h-full flex flex-col items-center justify-center text-center text-muted-foreground p-6 space-y-3 mt-10">
                <RouteIcon className="w-12 h-12 text-muted-foreground animate-pulse" />
                <h3 className="font-semibold text-foreground/80 text-sm">Brak aktywnej trasy</h3>
                <p className="text-xs max-w-[250px] leading-relaxed">
                  Wyznacz trasę, klikając punkty na mapie lub poproś o to Agenta w zakładce Kreator AI.
                </p>
              </div>
            ) : (
              <>
                {/* Stats Grid */}
                <div className="grid grid-cols-2 gap-3">
                  <div className="bg-muted border border-border/60 rounded-md p-3.5 flex flex-col">
                    <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Dystans</span>
                    <span className="text-2xl font-black text-foreground mt-1">
                      {routeStats.distance.toFixed(1)} <span className="text-xs font-bold text-muted-foreground">km</span>
                    </span>
                  </div>
                  
                  <div className="bg-muted border border-border/60 rounded-md p-3.5 flex flex-col">
                    <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Suma podejść</span>
                    <span className="text-2xl font-black text-primary mt-1">
                      +{Math.round(routeStats.ascent)} <span className="text-xs font-bold text-primary">m</span>
                    </span>
                  </div>
                </div>

                {/* Elevation Profile */}
                <ElevationProfile coordinates={geometry.coordinates} />

                {/* Actions Card */}
                {gpxData && (
                  <Card className="p-4 border-border/60 bg-card shadow-token-sm flex flex-col gap-2.5">
                    <h4 className="font-bold text-muted-foreground text-[10px] uppercase tracking-wider">Pobierz trasę</h4>
                    <div className="flex gap-2">
                      <Button 
                        className="flex-1 bg-foreground hover:bg-foreground/90 text-background font-semibold text-xs py-2 h-9"
                        onClick={() => {
                          const blob = new Blob([gpxData], { type: 'application/gpx+xml' });
                          const url = URL.createObjectURL(blob);
                          const a = document.createElement('a');
                          a.href = url;
                          // Każde pobranie nazywało się tak samo, więc przeglądarka
                          // dopisywała "(1)", "(2)" — a w nawigacji łatwo było otworzyć
                          // plik sprzed tygodnia, myśląc że to świeża trasa.
                          const slug = (context.title || 'trasa')
                            .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
                            .replace(/[^\w-]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 50) || 'trasa';
                          a.download = `${slug}-${new Date().toISOString().slice(0, 10)}.gpx`;
                          a.click();
                          URL.revokeObjectURL(url);
                        }}
                      >
                        Pobierz GPX
                      </Button>
                      {guideText && (
                        <Button 
                          className="flex-1 bg-ink hover:bg-muted text-white font-semibold text-xs py-2 h-9"
                          onClick={handleDownloadPdf}
                        >
                          Przewodnik PDF
                        </Button>
                      )}
                    </div>
                    <Button
                      variant="outline"
                      disabled={savingProject}
                      onClick={saveAsProject}
                      className="w-full h-9 text-xs font-semibold border-primary/30 text-primary hover:bg-primary/10"
                    >
                      {savingProject
                        ? <><Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> Tworzę projekt…</>
                        : <><FolderPlus className="w-3.5 h-3.5 mr-1.5" /> Zapisz jako projekt</>}
                    </Button>
                    <p className="text-[10px] text-muted-foreground leading-snug -mt-1">
                      Punkty trafią na tablicę jako „koniecznie". Dołożysz kolejne miejsca, zmienisz wagi i ułożysz plan dni.
                    </p>
                  </Card>
                )}

                {/* Guide Text */}
                {guideText && (
                  <div className="space-y-3 mt-4">
                    <h3 className="font-bold text-muted-foreground text-[10px] uppercase tracking-wider">Przewodnik po trasie</h3>
                    <div id="guidebook-content" className="bg-card border border-border/60 shadow-token-sm rounded-md p-6 sm:p-8 text-foreground prose prose-slate prose-sm sm:prose-base max-w-none prose-headings:font-black prose-headings:tracking-tight prose-a:text-primary hover:prose-a:text-primary prose-img:rounded-md prose-p:leading-relaxed prose-strong:text-foreground prose-li:marker:text-primary">
                      <ReactMarkdown remarkPlugins={[remarkGfm]}>
                        {guideText}
                      </ReactMarkdown>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {activeTab === 'saved' && (
          <div className="flex-1 overflow-y-auto p-5 space-y-4">
            <h3 className="font-bold text-muted-foreground text-[10px] uppercase tracking-wider">Twoje zapisane trasy</h3>
            {isLoadingSaved ? (
              <div className="flex justify-center py-8">
                <Loader2 className="w-6 h-6 text-primary animate-spin" />
              </div>
            ) : savedProjects.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">Brak zapisanych tras.</p>
            ) : (
              <div className="space-y-3">
                {savedProjects.map((project) => {
                  const reqs = project.requirements || {};
                  const isCurrent = project.id === projectId;
                  let vehicleIcon = <RouteIcon className="w-4 h-4 text-primary" />;
                  if (reqs.vehicleType === 'car') vehicleIcon = <Car className="w-4 h-4 text-muted-foreground" />;
                  else if (reqs.vehicleType === 'city') vehicleIcon = <Building2 className="w-4 h-4 text-muted-foreground" />;
                  else if (reqs.vehicleType === 'hiking') vehicleIcon = <Navigation className="w-4 h-4 text-accent" />;
                  else if (reqs.vehicleType === 'bicycle') vehicleIcon = <Bike className="w-4 h-4 text-muted-foreground" />;
                  else if (reqs.vehicleType === 'motorcycle') vehicleIcon = <Navigation className="w-4 h-4 text-muted-foreground" />;
                  
                  return (
                    <div 
                      key={project.id}
                      onClick={() => handleLoadProject(project)}
                      className={`p-3.5 rounded-md border text-left cursor-pointer transition-all duration-200 hover:shadow-token-md flex items-start justify-between gap-3 ${
                        isCurrent 
                          ? 'border-primary bg-primary/20' 
                          : 'border-border/60 bg-card hover:border-border'
                      }`}
                    >
                      <div className="space-y-1.5 min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          {vehicleIcon}
                          <span className="font-bold text-sm text-foreground truncate block">
                            {reqs.title || 'Trasa bez nazwy'}
                          </span>
                        </div>
                        <p className="text-xs text-muted-foreground line-clamp-1">
                          Start: {reqs.start_point || reqs.startLocation || '?'}
                        </p>
                        <div className="flex gap-2">
                          {reqs.distance_target_km && (
                            <Badge variant="secondary" className="text-[10px] py-0 px-1.5 font-semibold bg-muted text-foreground/80">
                              {reqs.distance_target_km} km
                            </Badge>
                          )}
                          <span className="text-[10px] text-muted-foreground">
                            {new Date(project.updated_at || project.created_at).toLocaleDateString('pl-PL')}
                          </span>
                        </div>
                      </div>
                      <button 
                        onClick={(e) => handleDeleteProject(project.id, e)}
                        className="text-muted-foreground hover:text-danger p-1 rounded hover:bg-muted shrink-0 self-center transition-colors"
                        title="Usuń trasę"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Right Panel - Map */}
      <div className="flex-1 relative bg-muted h-full w-full">
        
        {/* Floating Vehicle Selector */}
        <div className="absolute top-6 left-1/2 -translate-x-1/2 z-[1000] flex flex-col items-center gap-2">
          
          {/* Main Selector */}
          <div className="bg-white/90 backdrop-blur-md rounded-full shadow-token-lg p-1.5 flex gap-1 border border-border/50 max-w-[95vw] overflow-x-auto scrollbar-none">
            <Button 
              variant={vehicleType === 'motorcycle' ? 'default' : 'ghost'} 
              className={`rounded-full px-5 h-10 shrink-0 ${vehicleType === 'motorcycle' ? 'bg-foreground text-background' : 'text-foreground/80 hover:text-foreground'}`}
              onClick={() => handleVehicleChange('motorcycle')}
            >
              <Navigation className="w-4 h-4 mr-2" /> Motocykl
            </Button>
            <Button 
              variant={vehicleType === 'bicycle' ? 'default' : 'ghost'} 
              className={`rounded-full px-5 h-10 shrink-0 ${vehicleType === 'bicycle' ? 'bg-foreground text-background' : 'text-foreground/80 hover:text-foreground'}`}
              onClick={() => handleVehicleChange('bicycle')}
            >
              <Bike className="w-4 h-4 mr-2" /> Rower
            </Button>
            <Button 
              variant={vehicleType === 'hiking' ? 'default' : 'ghost'} 
              className={`rounded-full px-5 h-10 shrink-0 ${vehicleType === 'hiking' ? 'bg-foreground text-background' : 'text-foreground/80 hover:text-foreground'}`}
              onClick={() => handleVehicleChange('hiking')}
            >
              <RouteIcon className="w-4 h-4 mr-2" /> Pieszo
            </Button>
            <Button 
              variant={vehicleType === 'city' ? 'default' : 'ghost'} 
              className={`rounded-full px-5 h-10 shrink-0 ${vehicleType === 'city' ? 'bg-foreground text-background' : 'text-foreground/80 hover:text-foreground'}`}
              onClick={() => handleVehicleChange('city')}
            >
              <Building2 className="w-4 h-4 mr-2" /> Miasto
            </Button>
            <Button 
              variant={vehicleType === 'car' ? 'default' : 'ghost'} 
              className={`rounded-full px-5 h-10 shrink-0 ${vehicleType === 'car' ? 'bg-foreground text-background' : 'text-foreground/80 hover:text-foreground'}`}
              onClick={() => handleVehicleChange('car')}
            >
              <Car className="w-4 h-4 mr-2" /> Samochód
            </Button>
          </div>

          {/* Sub Selector for Bicycle */}
          {vehicleType === 'bicycle' && (
            <div className="bg-white/90 backdrop-blur-md rounded-full shadow-token-md p-1 flex gap-1 border border-border/50 animate-in slide-in-from-top-2">
              <Button 
                variant={bikeSubtype === 'road' ? 'secondary' : 'ghost'} 
                size="sm"
                className={`rounded-full px-4 h-8 text-xs ${bikeSubtype === 'road' ? 'bg-primary/10 text-primary' : 'text-muted-foreground'}`}
                onClick={() => handleBikeSubtypeChange('road')}
              >
                Szosa / Asfalt
              </Button>
              <Button 
                variant={bikeSubtype === 'gravel' ? 'secondary' : 'ghost'} 
                size="sm"
                className={`rounded-full px-4 h-8 text-xs ${bikeSubtype === 'gravel' ? 'bg-primary/10 text-primary' : 'text-muted-foreground'}`}
                onClick={() => handleBikeSubtypeChange('gravel')}
              >
                Szuter / Gravel
              </Button>
              <Button 
                variant={bikeSubtype === 'mtb' ? 'secondary' : 'ghost'} 
                size="sm"
                className={`rounded-full px-4 h-8 text-xs ${bikeSubtype === 'mtb' ? 'bg-primary/10 text-primary' : 'text-muted-foreground'}`}
                onClick={() => handleBikeSubtypeChange('mtb')}
              >
                MTB / Góry
              </Button>
            </div>
          )}
        </div>

        {/* Loading Indicator */}
        {isRouting && (
          <div className="absolute top-6 right-6 z-[1000] bg-white/90 backdrop-blur-md rounded-full shadow-token-lg py-2 px-4 flex items-center gap-2 border border-primary/30">
            <Loader2 className="w-4 h-4 text-primary animate-spin" />
            <span className="text-sm font-semibold text-primary">Przeliczam trasę...</span>
          </div>
        )}

        {/* Map */}
        <MapContainer 
          center={[52.069, 19.480]} // Center of Poland roughly
          zoom={6} 
          maxZoom={18}
          style={{ height: '100%', width: '100%' }}
          scrollWheelZoom={true}
          className="z-0"
        >
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            maxZoom={18}
          />
          
          <ClickableMap onMapClick={handleMapClick} onDismiss={() => setTempMarker(null)} />

          {geometry && geometry.coordinates && (
            <Polyline 
              positions={geometry.coordinates.map((c: any) => [c[1], c[0]])} 
              pathOptions={{ 
                // Ślad trasy w kolorach marki: tan dla pieszych, szałwia dla reszty
                color: (vehicleType === 'hiking' || vehicleType === 'city')
                  ? kolorTokena('--accent', 'hsl(17 42% 47%)')
                  : kolorTokena('--primary', 'hsl(158 28% 32%)'),
                
                weight: 5, 
                opacity: 0.9,
                lineCap: 'round',
                lineJoin: 'round'
              }} 
            />
          )}

          {waypoints.map((wp, i) => (
            <Marker 
              key={`${i}-${wp.lat}-${wp.lng}`} 
              position={[wp.lat, wp.lng]} 
              icon={createIcon(iconColorForKind(wp.kind, wp.type))}
              draggable={true}
              eventHandlers={{
                dragend: (e) => handleMarkerDrag(i, e),
                click: () => handleMarkerClick(wp, i)
              }}
            >
              <Popup maxWidth={400} minWidth={340} autoPan keepInView autoPanPaddingTopLeft={[28, 28]} autoPanPaddingBottomRight={[28, 60]}>
                {(() => {
                  const key = pointKeyOf(wp, i);
                  const details = poiDetails[key];
                  const photos = (details?.photos || []).filter((u: string) => !brokenPhotos.has(u));
                  const idx = Math.min(photoIndex[key] || 0, Math.max(photos.length - 1, 0));
                  const expanded = !!expandedPoints[key];
                  const movePhoto = (delta: number) => setPhotoIndex((prev) => ({
                    ...prev,
                    [key]: (idx + delta + photos.length) % photos.length
                  }));
                  return (
                <div 
                  ref={disablePropagation}
                  className="w-[340px] max-w-[calc(100vw-4rem)] text-left p-1 text-foreground font-sans"
                >
                  <PopupAutoFit dep={`${key}|${photos.length}|${idx}|${expanded}|${details?.loading ? 'l' : 'g'}`} />
                  <div className="flex items-center justify-between border-b border-border pb-2 mb-2">
                    <span className="font-bold text-sm text-foreground truncate block pr-2" title={key}>
                      {key}
                    </span>
                    <span className="text-[10px] uppercase font-bold text-muted-foreground bg-muted px-1.5 py-0.5 rounded tracking-wider shrink-0">
                      {wp.type === 'start' ? 'Start'
                        : wp.type === 'end' ? 'Meta'
                        : wp.kind === 'parking' ? 'Parking'
                        : wp.kind === 'food' ? 'Przerwa'
                        : `Stop ${i}`}
                    </span>
                  </div>

                  {/* Galeria: zdjęcia z Wikimedia Commons, przeklikiwane w bok */}
                  {photos.length > 0 && (
                    <div className="relative mb-2.5 rounded-md overflow-hidden bg-muted group">
                      <img
                        src={photos[idx]}
                        alt={key}
                        loading="lazy"
                        className={`w-full object-cover transition-all duration-200 ${expanded ? 'h-48' : 'h-32'}`}
                        onError={() => setBrokenPhotos((prev) => new Set(prev).add(photos[idx]))}
                      />
                      {photos.length > 1 && (
                        <>
                          <button
                            type="button"
                            aria-label="Poprzednie zdjęcie"
                            onClick={(e) => { e.stopPropagation(); movePhoto(-1); }}
                            className="absolute left-1.5 top-1/2 -translate-y-1/2 w-7 h-7 rounded-full bg-black/45 hover:bg-black/70 text-white flex items-center justify-center transition-colors"
                          >
                            <ChevronLeft className="w-4 h-4" />
                          </button>
                          <button
                            type="button"
                            aria-label="Następne zdjęcie"
                            onClick={(e) => { e.stopPropagation(); movePhoto(1); }}
                            className="absolute right-1.5 top-1/2 -translate-y-1/2 w-7 h-7 rounded-full bg-black/45 hover:bg-black/70 text-white flex items-center justify-center transition-colors"
                          >
                            <ChevronRight className="w-4 h-4" />
                          </button>
                          <div className="absolute bottom-1.5 left-0 right-0 flex justify-center gap-1.5">
                            {photos.map((_, pi) => (
                              <button
                                key={pi}
                                type="button"
                                aria-label={`Zdjęcie ${pi + 1}`}
                                onClick={(e) => { e.stopPropagation(); setPhotoIndex((prev) => ({ ...prev, [key]: pi })); }}
                                className={`w-1.5 h-1.5 rounded-full transition-colors ${pi === idx ? 'bg-card' : 'bg-white/45'}`}
                              />
                            ))}
                          </div>
                        </>
                      )}
                    </div>
                  )}

                  <div className="text-xs leading-relaxed mb-3">
                    {details?.loading ? (
                      <div className="flex flex-col items-center justify-center py-4 text-primary font-semibold gap-2">
                        <Loader2 className="w-5 h-5 animate-spin" />
                        <span className="text-[10px] text-muted-foreground">Pobieram informacje z AI...</span>
                      </div>
                    ) : details ? (
                      <div className="space-y-2.5 animate-in fade-in duration-200">
                        {/* Zwinięta karta pokazuje zajawkę — pełny opis dopiero na życzenie */}
                        <p className={`text-foreground/80 font-medium m-0 ${expanded ? '' : 'line-clamp-3'}`}>
                          {details.description}
                        </p>
                        {(details.description?.length > 150 || details.recommendation) && (
                          <button
                            type="button"
                            onClick={(e) => { e.stopPropagation(); setExpandedPoints((prev) => ({ ...prev, [key]: !expanded })); }}
                            className="flex items-center gap-1 text-[11px] font-bold text-primary hover:text-primary"
                          >
                            {expanded ? <><ChevronUp className="w-3 h-3" /> Zwiń</> : <><ChevronDown className="w-3 h-3" /> Rozwiń</>}
                          </button>
                        )}
                        {expanded && details.recommendation && (
                          <div className="bg-primary/10 border border-primary/30 rounded-md p-2 flex items-start gap-1.5">
                            <Sparkles className="w-3.5 h-3.5 text-primary shrink-0 mt-0.5" />
                            <div className="text-[11px] text-primary font-medium leading-normal m-0">
                              <strong className="text-primary block text-[10px] uppercase tracking-wider mb-0.5 font-bold">Wskazówka AI</strong>
                              {details.recommendation}
                            </div>
                          </div>
                        )}
                        {expanded && photos.length === 0 && (
                          <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
                            <ImageIcon className="w-3 h-3" /> Brak zdjęć dla tego miejsca
                          </div>
                        )}
                      </div>
                    ) : (
                      <div className="py-2 text-center text-muted-foreground">
                        <span className="text-[10px]">Wczytuję szczegóły...</span>
                      </div>
                    )}
                  </div>

                  <div className="flex gap-2 border-t border-border pt-2.5 mt-2">
                    <Button 
                      variant="destructive" 
                      size="sm" 
                      className="w-full h-8 text-xs font-semibold"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleRemoveWaypoint(i);
                      }}
                    >
                      <Trash2 className="w-3 h-3 mr-1.5" /> Usuń z trasy
                    </Button>
                  </div>
                </div>
                  );
                })()}
              </Popup>
            </Marker>
          ))}

          {tempMarker && (
            <Popup position={[tempMarker.lat, tempMarker.lng]}>
              <div ref={disablePropagation} className="flex flex-col gap-2 min-w-[140px] p-1">
                <p className="text-xs font-bold text-foreground/80 mb-1 text-center">Nowy punkt w tym miejscu</p>
                <Button size="sm" variant="outline" className="h-8 text-xs justify-start" onClick={() => handleAddPointFromTemp('start')}>
                  <div className="w-2 h-2 rounded-full bg-success mr-2" /> Ustaw jako Start
                </Button>
                <Button size="sm" variant="outline" className="h-8 text-xs justify-start" onClick={() => handleAddPointFromTemp('end')}>
                  <div className="w-2 h-2 rounded-full bg-danger mr-2" /> Ustaw jako Metę
                </Button>
                <Button size="sm" variant="outline" className="h-8 text-xs justify-start" onClick={() => handleAddPointFromTemp('waypoint')}>
                  <div className="w-2 h-2 rounded-full bg-neutral mr-2" /> Dodaj do trasy
                </Button>
              </div>
            </Popup>
          )}
          
          <MapResizer geometry={geometry} />
        </MapContainer>

        {/* Gest niewidoczny to gest nieistniejący — mówimy o nim wprost */}
        <div className="pointer-events-none absolute bottom-3 left-1/2 -translate-x-1/2 z-[1000]
                        bg-ink/70 text-white/90 text-[11px] px-3 py-1.5 rounded-full
                        backdrop-blur-sm whitespace-nowrap">
          Prawy przycisk myszy na mapie (lub przytrzymanie) — dodaj punkt do trasy
        </div>
        
        {/* Na wąskim ekranie panel jest zwinięty — to jedyne wejście do rozmowy i szczegółów. */}
        {!panelOpen && (
          <Button
            onClick={() => setPanelOpen(true)}
            className="md:hidden absolute bottom-6 right-6 z-[1050] rounded-full bg-card text-foreground hover:bg-muted shadow-token-lg h-12 px-5 font-bold border border-border"
          >
            <Bot className="w-4 h-4 mr-2 text-primary" /> Kreator
          </Button>
        )}

        <div className="absolute bottom-6 left-6 z-[1000] flex gap-2">
          {waypoints.length >= 2 && (
            <Button 
              onClick={() => send({ type: 'CALCULATE_ROUTE' })} 
              className="bg-foreground hover:bg-foreground/90 text-background shadow-token-lg rounded-full px-5 h-10 font-bold"
            >
              <RefreshCw className="w-4 h-4 mr-2" /> Przelicz trasę
            </Button>
          )}
          <Badge variant="outline" className="bg-white/90 border-primary/30 text-primary backdrop-blur-md py-1.5 px-4 rounded-full shadow-token-lg h-10 hidden sm:flex items-center">
            <MapPin className="w-3 h-3 mr-2" /> OpenStreetMap
          </Badge>
        </div>



      </div>
    </div>
  );
}
