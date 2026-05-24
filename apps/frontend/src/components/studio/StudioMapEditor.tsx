import { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { Map, Layers, Plus, Trash2, MapPin } from 'lucide-react';

interface Poi {
  name: string;
  type: string;
  lat: number;
  lng: number;
}

interface StudioMapEditorProps {
  track: [number, number][];
  customPois: Poi[];
  setCustomPois: React.Dispatch<React.SetStateAction<Poi[]>>;
  category: string;
  cyclingSurface?: string;
  onReverseTrack?: () => void;
  onSimplifyTrack?: () => void;
  onSmoothTrack?: () => void;
}

const TILE_LAYERS = {
  osm: {
    name: 'Mapa OSM',
    url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
    attribution: '&copy; OpenStreetMap autorzy',
  },
  topo: {
    name: 'Topograficzna',
    url: 'https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png',
    attribution: '&copy; OpenTopoMap autorzy',
  },
  satellite: {
    name: 'Satelita',
    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    attribution: '&copy; ESRI satelitarne',
  },
};

const POI_STYLES: Record<string, { color: string; label: string; icon: string }> = {
  viewpoint: { color: '#10b981', label: 'V', icon: '⛰️' },
  parking: { color: '#3b82f6', label: 'P', icon: '🅿️' },
  hotel: { color: '#f59e0b', label: 'H', icon: '🏨' },
  danger: { color: '#ef4444', label: '!', icon: '⚠️' },
  dining: { color: '#ec4899', label: 'D', icon: '🍴' },
  water: { color: '#06b6d4', label: 'W', icon: '💧' },
};

function createEndpinIcon(color: string, label: string) {
  return L.divIcon({
    className: 'studio-endpoint-marker',
    html: `<div style="
      background: ${color};
      color: white;
      border-radius: 50%;
      width: 30px; height: 30px;
      display: flex; align-items: center; justify-content: center;
      font-size: 13px; font-weight: 800;
      border: 3px solid white;
      box-shadow: 0 2px 8px rgba(0,0,0,0.4);
      transition: all 0.2s ease;
    ">${label}</div>`,
    iconSize: [30, 30],
    iconAnchor: [15, 15],
  });
}

function createPoiIcon(type: string, name: string) {
  const style = POI_STYLES[type] || { color: '#a855f7', label: '?', icon: '📍' };
  return L.divIcon({
    className: 'studio-poi-marker',
    html: `<div style="
      background: ${style.color};
      color: white;
      border-radius: 50%;
      width: 26px; height: 26px;
      display: flex; align-items: center; justify-content: center;
      font-size: 11px; font-weight: 700;
      border: 2px solid white;
      box-shadow: 0 3px 6px rgba(0,0,0,0.3);
      cursor: pointer;
      position: relative;
    " title="${name}">
      ${style.label}
    </div>`,
    iconSize: [26, 26],
    iconAnchor: [13, 13],
    popupAnchor: [0, -13],
  });
}

export default function StudioMapEditor({
  track,
  customPois,
  setCustomPois,
  category,
  cyclingSurface,
  onReverseTrack,
  onSimplifyTrack,
  onSmoothTrack,
}: StudioMapEditorProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const polylineRef = useRef<L.Polyline | null>(null);
  const markersGroupRef = useRef<L.FeatureGroup | null>(null);
  const clickMarkerRef = useRef<L.Marker | null>(null);

  const [activeTileType, setActiveTileType] = useState<keyof typeof TILE_LAYERS>('osm');
  const [currentTileLayer, setCurrentTileLayer] = useState<L.TileLayer | null>(null);

  // New POI at clicked point state
  const [clickCoords, setClickCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [newPoiName, setNewPoiName] = useState('');
  const [newPoiType, setNewPoiType] = useState<string>('viewpoint');

  // Colors based on route category
  const isMotorcycleOrAsphalt = category === 'motorcycle' || (category === 'cycling' && cyclingSurface === 'asphalt');
  const routeColor = isMotorcycleOrAsphalt ? '#f43f5e' : '#10b981'; // Rose for street, Emerald for offroad/hiking

  // 1. Initialize Map
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const initialCenter = track.length > 0 ? track[0] : [49.524, 20.124] as [number, number];
    const initialZoom = track.length > 0 ? 12 : 10;

    const map = L.map(containerRef.current, {
      zoomControl: true,
      scrollWheelZoom: true,
      dragging: true,
    });

    map.setView(initialCenter, initialZoom);

    // Load initial tile layer
    const tileLayer = L.tileLayer(TILE_LAYERS[activeTileType].url, {
      attribution: TILE_LAYERS[activeTileType].attribution,
      maxZoom: 19,
      noWrap: true,
    }).addTo(map);

    setCurrentTileLayer(tileLayer);
    mapRef.current = map;

    // Feature group for POIs
    const markersGroup = L.featureGroup().addTo(map);
    markersGroupRef.current = markersGroup;

    // Click handler on map to drop temporary pin for custom POI
    map.on('click', (e: L.LeafletMouseEvent) => {
      const { lat, lng } = e.latlng;
      setClickCoords({ lat, lng });

      if (clickMarkerRef.current) {
        clickMarkerRef.current.setLatLng(e.latlng);
      } else {
        const marker = L.marker(e.latlng, {
          icon: L.divIcon({
            className: 'studio-clicked-pin',
            html: `<div style="
              width: 14px; height: 14px;
              background: #a855f7;
              border-radius: 50%;
              border: 3px solid white;
              box-shadow: 0 0 8px #a855f7;
              animation: pulse 1.5s infinite;
            "></div>`,
            iconSize: [14, 14],
            iconAnchor: [7, 7],
          })
        }).addTo(map);
        clickMarkerRef.current = marker;
      }
    });

    return () => {
      if (mapRef.current) {
        mapRef.current.off();
        mapRef.current.remove();
        mapRef.current = null;
      }
    };
  }, []);

  // 2. Change Tile Layer Style
  const handleTileChange = (type: keyof typeof TILE_LAYERS) => {
    const map = mapRef.current;
    if (!map) return;

    if (currentTileLayer) {
      map.removeLayer(currentTileLayer);
    }

    const newLayer = L.tileLayer(TILE_LAYERS[type].url, {
      attribution: TILE_LAYERS[type].attribution,
      maxZoom: 19,
      noWrap: true,
    }).addTo(map);

    setCurrentTileLayer(newLayer);
    setActiveTileType(type);
  };

  // 3. Draw GPX Track and fit bounds
  useEffect(() => {
    const map = mapRef.current;
    if (!map || track.length < 2) return;

    // Remove old polyline if exists
    if (polylineRef.current) {
      map.removeLayer(polylineRef.current);
    }

    const latLngs = track.map(([lat, lng]) => L.latLng(lat, lng));
    const polyline = L.polyline(latLngs, {
      color: routeColor,
      weight: 5,
      opacity: 0.9,
      lineCap: 'round',
      lineJoin: 'round',
    }).addTo(map);

    polylineRef.current = polyline;

    // Fit map bounds to polyline
    map.fitBounds(polyline.getBounds(), { padding: [30, 30] });
  }, [track, routeColor]);

  // 4. Draw Start, End, and custom POI markers
  useEffect(() => {
    const map = mapRef.current;
    const group = markersGroupRef.current;
    if (!map || !group) return;

    group.clearLayers();

    // Endpoints
    if (track.length >= 2) {
      const first = track[0];
      const last = track[track.length - 1];

      L.marker([first[0], first[1]], { icon: createEndpinIcon('#16a34a', 'S') })
        .addTo(group)
        .bindPopup('<strong style="font-family:sans-serif;">PUNKT STARTOWY TRASY</strong>');

      L.marker([last[0], last[1]], { icon: createEndpinIcon('#dc2626', 'E') })
        .addTo(group)
        .bindPopup('<strong style="font-family:sans-serif;">PUNKT KOŃCOWY (META)</strong>');
    }

    // Custom POIs
    customPois.forEach((poi, index) => {
      const marker = L.marker([poi.lat, poi.lng], { icon: createPoiIcon(poi.type, poi.name) })
        .addTo(group);

      // Custom premium popup with Delete button directly integrated inside it
      const container = document.createElement('div');
      container.style.fontFamily = 'Inter, sans-serif';
      container.style.padding = '4px';

      const typeLabel = POI_STYLES[poi.type]?.name || poi.type;
      const typeIcon = POI_STYLES[poi.type]?.icon || '📍';

      container.innerHTML = `
        <div style="margin-bottom:6px;">
          <span style="font-size:9px;text-transform:uppercase;color:#888;font-weight:600;">${typeIcon} ${typeLabel}</span>
          <h4 style="margin:2px 0 0 0;font-size:13px;font-weight:700;color:#1e293b;">${poi.name}</h4>
        </div>
      `;

      const deleteBtn = document.createElement('button');
      deleteBtn.innerText = 'Usuń ten punkt';
      deleteBtn.style.width = '100%';
      deleteBtn.style.padding = '5px 8px';
      deleteBtn.style.background = '#fee2e2';
      deleteBtn.style.color = '#dc2626';
      deleteBtn.style.border = 'none';
      deleteBtn.style.borderRadius = '6px';
      deleteBtn.style.fontSize = '11px';
      deleteBtn.style.fontWeight = 'bold';
      deleteBtn.style.cursor = 'pointer';
      deleteBtn.style.marginTop = '4px';
      deleteBtn.style.display = 'flex';
      deleteBtn.style.alignItems = 'center';
      deleteBtn.style.justifyContent = 'center';
      deleteBtn.style.gap = '4px';

      deleteBtn.onclick = () => {
        setCustomPois((current) => current.filter((_, idx) => idx !== index));
        toast.info(`Usunięto POI: ${poi.name}`);
        map.closePopup();
      };

      container.appendChild(deleteBtn);

      marker.bindPopup(container);
    });
  }, [customPois, track]);

  // Handle adding custom POI from dropped pin
  const handleAddPoiFromClick = (e: React.FormEvent) => {
    e.preventDefault();
    if (!clickCoords || !newPoiName.trim()) return;

    const newPoi: Poi = {
      name: newPoiName,
      type: newPoiType,
      lat: clickCoords.lat,
      lng: clickCoords.lng,
    };

    setCustomPois((c) => [...c, newPoi]);
    setNewPoiName('');
    setClickCoords(null);

    // Remove clicked pin marker
    if (clickMarkerRef.current && mapRef.current) {
      mapRef.current.removeLayer(clickMarkerRef.current);
      clickMarkerRef.current = null;
    }

    toast.success(`Dodano punkt POI: ${newPoi.name}!`);
  };

  const handleCancelClickPin = () => {
    setClickCoords(null);
    setNewPoiName('');
    if (clickMarkerRef.current && mapRef.current) {
      mapRef.current.removeLayer(clickMarkerRef.current);
      clickMarkerRef.current = null;
    }
  };

  return (
    <div className="flex flex-col gap-4">
      {/* Interactive Leaflet Map Wrapper */}
      <div className="relative rounded-xl border border-border/80 overflow-hidden bg-card shadow-lg flex flex-col">
        {/* Map Toolbar Header */}
        <div className="p-3 bg-muted/40 border-b border-border flex items-center justify-between gap-3 text-xs font-semibold">
          <div className="flex items-center gap-2">
            <Map className="w-4 h-4 text-primary" />
            <span className="text-slate-800">Interaktywna Mapa GPS & POI</span>
          </div>

          <div className="flex items-center gap-3">
            {/* Tile switcher control */}
            <div className="flex rounded-lg border border-border bg-background p-0.5 shrink-0 shadow-sm">
              {(Object.keys(TILE_LAYERS) as Array<keyof typeof TILE_LAYERS>).map((type) => (
                <button
                  key={type}
                  type="button"
                  onClick={() => handleTileChange(type)}
                  className={`px-3 py-1 rounded-md text-[10px] font-bold transition-all ${
                    activeTileType === type
                      ? 'bg-primary text-white shadow-sm'
                      : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  {TILE_LAYERS[type].name}
                </button>
              ))}
            </div>

            {/* Current Engine Badge */}
            <Badge
              variant="secondary"
              className={`text-[9px] font-bold px-2 py-0.5 border ${
                isMotorcycleOrAsphalt
                  ? 'bg-rose-500/10 text-rose-500 border-rose-500/20'
                  : 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20'
              }`}
            >
              {isMotorcycleOrAsphalt ? 'Silnik Szosowy' : 'Silnik Terenowy'}
            </Badge>
          </div>
        </div>

        {/* Map Frame */}
        <div className="w-full h-[480px] bg-slate-100 relative" style={{ zIndex: 1 }}>
          <div ref={containerRef} className="w-full h-full" />

          {/* Quick Action Overlay inside Map */}
          {clickCoords && (
            <div className="absolute bottom-4 left-4 right-4 z-[999] bg-white/95 backdrop-blur-md border border-primary/20 rounded-xl p-3.5 shadow-2xl flex flex-col gap-3 animate-fade-in max-w-lg mx-auto">
              <div className="flex justify-between items-center border-b pb-1.5 border-slate-200">
                <span className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                  <MapPin className="w-4 h-4 text-purple-600 animate-bounce" />
                  Osadź nowy punkt POI w wybranym miejscu
                </span>
                <button type="button" onClick={handleCancelClickPin} className="text-slate-400 hover:text-slate-700 text-sm font-semibold">✕</button>
              </div>

              <form onSubmit={handleAddPoiFromClick} className="flex gap-2.5 items-end">
                <div className="flex-1 space-y-1">
                  <label className="text-[9px] font-bold text-slate-500 uppercase tracking-wide">Nazwa punktu POI</label>
                  <Input
                    value={newPoiName}
                    onChange={(e) => setNewPoiName(e.target.value)}
                    placeholder="Wpisz nazwę... np. Drewniany mostek, wiata"
                    className="h-8 text-xs bg-white text-slate-900 border-slate-300 focus:ring-primary/20"
                    autoFocus
                  />
                </div>
                <div className="w-[120px] space-y-1">
                  <label className="text-[9px] font-bold text-slate-500 uppercase tracking-wide">Typ znacznika</label>
                  <select
                    value={newPoiType}
                    onChange={(e) => setNewPoiType(e.target.value)}
                    className="w-full h-8 px-2 rounded-md border border-slate-300 bg-white text-xs text-slate-800"
                  >
                    <option value="viewpoint">Widok (V)</option>
                    <option value="parking">Parking (P)</option>
                    <option value="hotel">Nocleg (H)</option>
                    <option value="danger">Zagrożenie (!)</option>
                    <option value="dining">Gastronomia (D)</option>
                    <option value="water">Źródło wody (W)</option>
                  </select>
                </div>
                <div className="flex gap-1.5 shrink-0">
                  <Button type="submit" size="sm" className="h-8 text-xs bg-primary text-white hover:bg-primary/90 font-bold px-3">
                    <Plus className="w-3.5 h-3.5 mr-1" /> Dodaj
                  </Button>
                </div>
              </form>
              <div className="text-[10px] text-slate-400 font-mono">
                Koordynaty: {clickCoords.lat.toFixed(6)}, {clickCoords.lng.toFixed(6)}
              </div>
            </div>
          )}
        </div>

        {/* Map Bottom Optimizers Toolbar */}
        <div className="z-10 bg-slate-900 border-t border-slate-800 p-3 space-y-2 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
            <span className="text-[10px] uppercase font-mono tracking-wider text-slate-400 mr-1 flex items-center gap-1">
              <Layers className="w-3.5 h-3.5" /> Optymalizacja śladu GPX:
            </span>
            {onReverseTrack && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={onReverseTrack}
                className="h-8 text-xs bg-slate-800 hover:bg-slate-700 border-slate-700 text-slate-200 hover:text-white"
              >
                Odwróć kierunek
              </Button>
            )}
            {onSimplifyTrack && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={onSimplifyTrack}
                className="h-8 text-xs bg-slate-800 hover:bg-slate-700 border-slate-700 text-slate-200 hover:text-white"
              >
                Uprość punkty
              </Button>
            )}
            {onSmoothTrack && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={onSmoothTrack}
                className="h-8 text-xs bg-slate-800 hover:bg-slate-700 border-slate-700 text-slate-200 hover:text-white"
              >
                Wygładź szumy
              </Button>
            )}
          </div>

          <div className="text-right text-xs w-full sm:w-auto justify-between sm:justify-end border-t sm:border-t-0 pt-2 sm:pt-0 border-slate-800 shrink-0">
            <span className="text-[9px] text-slate-400 block uppercase font-bold tracking-wider">Statystyki GPX</span>
            <span className="font-mono text-xs text-emerald-400 font-bold">
              {track.length} pkt · {track.length > 0 ? 'Ścieżka załadowana' : 'Brak śladu'}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
