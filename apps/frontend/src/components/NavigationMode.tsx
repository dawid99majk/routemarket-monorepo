import { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { X, Crosshair, AlertTriangle, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useGeolocation } from '@/hooks/use-geolocation';
import {
  distanceToPolyline,
  distanceAlongTrack,
  polylineLength,
  formatDistance,
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

  const [autoCenter, setAutoCenter] = useState(true);
  const { position, error, permissionState } = useGeolocation({ enabled: true, enableHighAccuracy: true });

  // Init map
  useEffect(() => {
    if (!containerRef.current || mapRef.current || track.length < 2) return;

    const map = L.map(containerRef.current, {
      zoomControl: true,
      scrollWheelZoom: true,
      attributionControl: true,
    });

    L.tileLayer('https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; <a href="https://opentopomap.org">OpenTopoMap</a>',
      maxZoom: 17,
    }).addTo(map);

    const latLngs = track.map(([lat, lng]) => L.latLng(lat, lng));
    L.polyline(latLngs, {
      color: 'hsl(142, 71%, 38%)',
      weight: 5,
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

  // Wake Lock
  useEffect(() => {
    let cancelled = false;
    async function acquire() {
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
  }, []);

  // Update user marker
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
      map.panTo(latlng, { animate: true, duration: 0.5 });
    }
  }, [position, autoCenter]);

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
  const offRoute = position && distanceToTrack > OFF_ROUTE_THRESHOLD_M;
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

  return (
    <div className="fixed inset-0 z-[1400] bg-background flex flex-col">
      {/* Top bar */}
      <div className="bg-card border-b border-border px-3 py-2 flex items-center gap-3 shadow-token-sm">
        <Button variant="ghost" size="icon" onClick={onClose} aria-label="Zakończ nawigację">
          <X className="w-5 h-5" />
        </Button>
        <div className="flex-1 min-w-0">
          <p className="text-xs text-muted-foreground leading-none">Nawigacja</p>
          <p className="text-sm font-semibold truncate">{routeTitle}</p>
        </div>
        <Button
          variant={autoCenter ? 'default' : 'outline'}
          size="icon"
          onClick={handleRecenter}
          aria-label="Wycentruj na mnie"
        >
          <Crosshair className="w-4 h-4" />
        </Button>
      </div>

      {/* Map */}
      <div className="relative flex-1">
        <div ref={containerRef} className="absolute inset-0" />

        {/* Off-route banner */}
        {offRoute && (
          <div className="absolute top-3 left-3 right-3 bg-warning text-warning-foreground rounded-lg shadow-token-md px-3 py-2 flex items-center gap-2 animate-in slide-in-from-top">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            <p className="text-sm font-medium">
              Zbaczasz z trasy ({formatDistance(distanceToTrack)} od śladu)
            </p>
          </div>
        )}

        {/* Permission/error state */}
        {!position && (
          <div className="absolute top-3 left-3 right-3 bg-card border border-border rounded-lg shadow-token-md px-3 py-2 flex items-center gap-2">
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
      <div className="bg-card border-t border-border p-4 space-y-3 shadow-token-md">
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
