import { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { X, Crosshair, AlertTriangle, Loader2, Settings, Zap } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useGeolocation } from '@/hooks/use-geolocation';
import {
  distanceToPolyline,
  distanceAlongTrack,
  polylineLength,
  formatDistance,
  haversine,
  type Polyline,
} from '@/lib/geo-utils';

interface NavigationModeProps {
  track: Polyline;
  routeTitle: string;
  onClose: () => void;
}

const OFF_ROUTE_THRESHOLD_M = 100;

function startEndIcon(color: string, label: string) {
  return L.divIcon({
    className: 'nav-endpoint-marker',
    html: `<div style="background:${color};color:#fff;border-radius:50%;width:26px;height:26px;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;border:3px solid #fff;box-shadow:0 2px 8px rgba(0,0,0,0.35);">${label}</div>`,
    iconSize: [26, 26],
    iconAnchor: [13, 13],
  });
}

function userIcon() {
  return L.divIcon({
    className: 'nav-user-marker',
    html: `<div style="position:relative;width:22px;height:22px;">
      <div style="position:absolute;inset:0;background:hsl(217,91%,60%);border:3px solid #fff;border-radius:50%;box-shadow:0 0 0 2px hsl(217,91%,60%,0.35),0 4px 10px rgba(0,0,0,0.35);"></div>
    </div>`,
    iconSize: [22, 22],
    iconAnchor: [11, 11],
  });
}

export default function NavigationMode({ track, routeTitle, onClose }: NavigationModeProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const userMarkerRef = useRef<L.Marker | null>(null);
  const accuracyCircleRef = useRef<L.Circle | null>(null);
  const wakeLockRef = useRef<WakeLockSentinel | null>(null);
  const tileLayerRef = useRef<L.TileLayer | null>(null);

  const [autoCenter, setAutoCenter] = useState(true);
  const [mapStyle, setMapStyle] = useState<'city' | 'topo' | 'eko'>('city');
  const [batterySaver, setBatterySaver] = useState(false);
  const [showSettings, setShowSettings] = useState(false);

  // Geolocation watch: dynamic high accuracy toggle
  const { position, error, permissionState } = useGeolocation({ 
    enabled: true, 
    enableHighAccuracy: !batterySaver 
  });

  // Initialize Map (without tile layer, which is managed dynamically)
  useEffect(() => {
    if (!containerRef.current || mapRef.current || track.length < 2) return;

    const map = L.map(containerRef.current, {
      zoomControl: true,
      scrollWheelZoom: true,
      attributionControl: true,
    });

    const latLngs = track.map(([lat, lng]) => L.latLng(lat, lng));
    L.polyline(latLngs, {
      color: '#10b981', // emerald-500: highly visible green on dark & light layers
      weight: 6,
      opacity: 0.9,
      lineCap: 'round',
      lineJoin: 'round',
    }).addTo(map);

    L.marker([track[0][0], track[0][1]], { icon: startEndIcon('#16a34a', 'S') }).addTo(map);
    L.marker([track[track.length - 1][0], track[track.length - 1][1]], {
      icon: startEndIcon('#dc2626', 'E'),
    }).addTo(map);

    map.fitBounds(L.latLngBounds(latLngs), { padding: [40, 40], maxZoom: 15, animate: false });

    mapRef.current = map;

    return () => {
      map.remove();
      mapRef.current = null;
      userMarkerRef.current = null;
      accuracyCircleRef.current = null;
    };
  }, [track]);

  // Manage map style & tile layer dynamically to save data/battery
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    // Clean up previous tile layer
    if (tileLayerRef.current) {
      map.removeLayer(tileLayerRef.current);
      tileLayerRef.current = null;
    }

    const container = containerRef.current;
    if (container) {
      if (mapStyle === 'eko') {
        container.style.backgroundColor = '#0b0f19'; // AMOLED slate-950
      } else {
        container.style.backgroundColor = '';
      }
    }

    if (mapStyle === 'topo') {
      tileLayerRef.current = L.tileLayer('https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; <a href="https://opentopomap.org">OpenTopoMap</a>',
        maxZoom: 17,
      }).addTo(map);
    } else if (mapStyle === 'city') {
      // CartoDB Voyager: clean, high-performance street map layer
      tileLayerRef.current = L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>',
        subdomains: 'abcd',
        maxZoom: 19,
      }).addTo(map);
    }
  }, [mapStyle]);

  // Manage Wake Lock based on batterySaver state
  useEffect(() => {
    let cancelled = false;
    async function acquire() {
      if (batterySaver) {
        // Release wake lock to allow screen sleep/dimming in battery-saver mode
        if (wakeLockRef.current) {
          wakeLockRef.current.release().catch(() => {});
          wakeLockRef.current = null;
        }
        return;
      }

      try {
        const nav = navigator as Navigator & { wakeLock?: { request: (type: 'screen') => Promise<WakeLockSentinel> } };
        if (nav.wakeLock) {
          const sentinel = await nav.wakeLock.request('screen');
          if (cancelled) {
            sentinel.release().catch(() => {});
          } else {
            wakeLockRef.current = sentinel;
          }
        }
      } catch {
        // ignore - user may have denied
      }
    }
    acquire();

    const onVisibility = () => {
      if (document.visibilityState === 'visible' && !wakeLockRef.current) acquire();
    };
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      cancelled = true;
      document.removeEventListener('visibilitychange', onVisibility);
      wakeLockRef.current?.release().catch(() => {});
      wakeLockRef.current = null;
    };
  }, [batterySaver]);

  // Update user marker position and circle
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !position) return;
    const latlng: L.LatLngExpression = [position.lat, position.lng];

    if (!userMarkerRef.current) {
      userMarkerRef.current = L.marker(latlng, { icon: userIcon(), zIndexOffset: 1000 }).addTo(map);
    } else {
      userMarkerRef.current.setLatLng(latlng);
    }

    if (!accuracyCircleRef.current) {
      accuracyCircleRef.current = L.circle(latlng, {
        radius: position.accuracy,
        color: 'hsl(217,91%,60%)',
        fillColor: 'hsl(217,91%,60%)',
        fillOpacity: 0.1,
        weight: 1,
      }).addTo(map);
    } else {
      accuracyCircleRef.current.setLatLng(latlng);
      accuracyCircleRef.current.setRadius(position.accuracy);
    }

    if (autoCenter) {
      // Disable smooth panning animations in battery-saver mode to reduce CPU usage
      map.panTo(latlng, { animate: !batterySaver, duration: batterySaver ? 0 : 0.5 });
    }
  }, [position, autoCenter, batterySaver]);

  // Compute live stats
  const totalLength = polylineLength(track);
  let distanceToTrack = Infinity;
  let traveled = 0;
  let remaining = totalLength;
  if (position) {
    const seg = distanceToPolyline({ lat: position.lat, lng: position.lng }, track);
    distanceToTrack = seg.distanceM;
    traveled = distanceAlongTrack(track, seg.segmentIndex, seg.t);
    remaining = Math.max(0, totalLength - traveled);
  }

  // Calculate distance to start point
  const startLat = track[0][0];
  const startLng = track[0][1];
  let distanceToStart = Infinity;
  if (position) {
    distanceToStart = haversine(position.lat, position.lng, startLat, startLng);
  }

  const farFromStart = position && distanceToStart > 500;
  const offRoute = position && !farFromStart && distanceToTrack > OFF_ROUTE_THRESHOLD_M;
  const progressPct = totalLength > 0 ? Math.min(100, (traveled / totalLength) * 100) : 0;

  // Vibrate when going off-route
  useEffect(() => {
    if (offRoute && 'vibrate' in navigator) {
      navigator.vibrate([200, 100, 200]);
    }
  }, [offRoute]);

  const handleRecenter = () => {
    setAutoCenter(true);
    if (mapRef.current && position) {
      mapRef.current.setView([position.lat, position.lng], Math.max(mapRef.current.getZoom(), 16));
    }
  };

  const openExternalToStart = () => {
    const ua = navigator.userAgent;
    const isIOS = /iPad|iPhone|iPod/.test(ua);
    const isAndroid = /Android/.test(ua);
    let url: string;
    if (isIOS) {
      url = `maps://?daddr=${startLat},${startLng}&dirflg=d`;
    } else if (isAndroid) {
      url = `geo:0,0?q=${startLat},${startLng}(Start trasy)`;
    } else {
      url = `https://www.google.com/maps/dir/?api=1&destination=${startLat},${startLng}`;
    }
    window.open(url, '_blank');
  };

  return (
    <div className="fixed inset-0 z-[1400] bg-background flex flex-col">
      {/* Top bar */}
      <div className="bg-card border-b border-border px-3 py-2 flex items-center gap-3 shadow-token-sm">
        <Button variant="ghost" size="icon" onClick={onClose} aria-label="Zakończ nawigację">
          <X className="w-5 h-5" />
        </Button>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5">
            <span className="text-xs text-muted-foreground leading-none">Nawigacja</span>
            {batterySaver && (
              <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-semibold bg-warning/20 text-warning-foreground animate-pulse">
                <Zap className="w-2.5 h-2.5 fill-warning text-warning" /> Eko
              </span>
            )}
          </div>
          <p className="text-sm font-semibold truncate">{routeTitle}</p>
        </div>
        <div className="flex items-center gap-1">
          <Button
            variant={showSettings ? 'secondary' : 'ghost'}
            size="icon"
            onClick={() => setShowSettings(!showSettings)}
            aria-label="Ustawienia nawigacji"
          >
            <Settings className="w-4 h-4" />
          </Button>
          <Button
            variant={autoCenter ? 'default' : 'outline'}
            size="icon"
            onClick={handleRecenter}
            aria-label="Wycentruj na mnie"
          >
            <Crosshair className="w-4 h-4" />
          </Button>
        </div>
      </div>

      {/* Map view area */}
      <div className="relative flex-1">
        <div ref={containerRef} className="absolute inset-0" />

        {/* Dynamic settings panel */}
        {showSettings && (
          <div className="absolute top-3 left-3 right-3 z-[1500] bg-card/95 backdrop-blur-md border border-border rounded-xl shadow-lg p-4 animate-in slide-in-from-top-4 duration-200">
            <h3 className="font-semibold text-sm mb-3">Ustawienia nawigacji</h3>
            
            <div className="space-y-4">
              {/* Map style selection */}
              <div>
                <label className="text-xs font-semibold text-muted-foreground block mb-2">Styl mapy (Dane mobilne)</label>
                <div className="grid grid-cols-3 gap-1 bg-muted p-0.5 rounded-lg">
                  <button
                    onClick={() => setMapStyle('city')}
                    className={`text-xs py-1.5 rounded-md font-medium transition-all ${
                      mapStyle === 'city'
                        ? 'bg-background shadow text-foreground'
                        : 'text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    🏙️ Miejski
                  </button>
                  <button
                    onClick={() => setMapStyle('topo')}
                    className={`text-xs py-1.5 rounded-md font-medium transition-all ${
                      mapStyle === 'topo'
                        ? 'bg-background shadow text-foreground'
                        : 'text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    ⛰️ Terenowy
                  </button>
                  <button
                    onClick={() => setMapStyle('eko')}
                    className={`text-xs py-1.5 rounded-md font-medium transition-all ${
                      mapStyle === 'eko'
                        ? 'bg-background shadow text-foreground'
                        : 'text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    🔋 Tylko ślad (Eko)
                  </button>
                </div>
              </div>

              {/* Battery saver toggle */}
              <div className="flex items-start justify-between gap-3 pt-2 border-t border-border">
                <div className="space-y-0.5">
                  <div className="flex items-center gap-1.5">
                    <Zap className={`w-4 h-4 ${batterySaver ? 'text-warning fill-warning' : 'text-muted-foreground'}`} />
                    <span className="text-sm font-semibold">Oszczędzanie baterii</span>
                  </div>
                  <p className="text-xs text-muted-foreground leading-normal">
                    Zmniejsza dokładność GPS, wyłącza animacje mapy, wyłącza blokadę ekranu i wymusza tryb Eko mapy.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    const nextVal = !batterySaver;
                    setBatterySaver(nextVal);
                    if (nextVal) {
                      setMapStyle('eko');
                    } else {
                      setMapStyle('city');
                    }
                  }}
                  className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                    batterySaver ? 'bg-primary' : 'bg-muted'
                  }`}
                >
                  <span
                    className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-background shadow ring-0 transition duration-200 ease-in-out ${
                      batterySaver ? 'translate-x-5' : 'translate-x-0'
                    }`}
                  />
                </button>
              </div>
            </div>
            
            <Button
              variant="outline"
              size="sm"
              className="w-full mt-4"
              onClick={() => setShowSettings(false)}
            >
              Zamknij ustawienia
            </Button>
          </div>
        )}

        {/* Far from start banner */}
        {farFromStart && (
          <div className="absolute top-3 left-3 right-3 bg-secondary/95 backdrop-blur-md text-secondary-foreground border border-border rounded-lg shadow-md px-3 py-2 flex items-center justify-between gap-2 animate-in slide-in-from-top">
            <div className="min-w-0">
              <p className="text-xs font-semibold">Jesteś daleko od startu trasy</p>
              <p className="text-[10px] text-muted-foreground">Odległość: {formatDistance(distanceToStart)}</p>
            </div>
            <Button size="sm" className="text-xs shrink-0 px-2.5 h-8 gap-1" onClick={openExternalToStart}>
              Dojazd (Google Maps)
            </Button>
          </div>
        )}

        {/* Off-route banner */}
        {offRoute && (
          <div className="absolute top-3 left-3 right-3 bg-warning text-warning-foreground rounded-lg shadow-md px-3 py-2 flex items-center gap-2 animate-in slide-in-from-top">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            <p className="text-sm font-medium">
              Zbaczasz z trasy ({formatDistance(distanceToTrack)} od śladu)
            </p>
          </div>
        )}

        {/* Permission/error state */}
        {!position && (
          <div className="absolute top-3 left-3 right-3 bg-card border border-border rounded-lg shadow-md px-3 py-2 flex items-center gap-2">
            {error ? (
              <>
                <AlertTriangle className="w-4 h-4 text-destructive shrink-0" />
                <p className="text-sm">{error}</p>
              </>
            ) : permissionState === 'denied' ? (
              <>
                <AlertTriangle className="w-4 h-4 text-destructive shrink-0" />
                <p className="text-sm">Brak dostępu do GPS — włącz lokalizację w ustawieniach przeglądarki</p>
              </>
            ) : (
              <>
                <Loader2 className="w-4 h-4 animate-spin shrink-0" />
                <p className="text-sm">Pobieranie sygnału GPS…</p>
              </>
            )}
          </div>
        )}
      </div>

      {/* Bottom panel */}
      <div className="bg-card border-t border-border p-4 space-y-3 shadow-md">
        <div className="grid grid-cols-3 gap-2 text-center">
          <div>
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Przebyte</p>
            <p className="text-base font-bold">{formatDistance(traveled)}</p>
          </div>
          <div>
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Pozostało</p>
            <p className="text-base font-bold">{formatDistance(remaining)}</p>
          </div>
          <div>
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Do śladu</p>
            <p className={`text-base font-bold ${offRoute ? 'text-warning' : ''}`}>
              {position ? formatDistance(distanceToTrack) : '—'}
            </p>
          </div>
        </div>
        <div className="h-2 bg-muted rounded-full overflow-hidden">
          <div
            className="h-full bg-primary transition-all"
            style={{ width: `${progressPct}%` }}
          />
        </div>
      </div>
    </div>
  );
}
