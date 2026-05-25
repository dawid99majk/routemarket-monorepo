import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Globe, Loader2 } from 'lucide-react';
import type { TrackPointTuple } from '@/lib/track-utils';

interface ExplorerRoute {
  id: number;
  title: string;
  price?: number;
  latitude: number;
  longitude: number;
  location_string?: string;
  category_name?: string;
  preview_track?: TrackPointTuple[] | null;
}

interface ExplorerPoi {
  lat: number;
  lng: number;
  name?: string;
  type?: string;
}

interface RouteExplorerGlobeProps {
  routes: ExplorerRoute[];
  selectedRouteId?: number | null;
  pois?: ExplorerPoi[];
  onSelectRoute?: (routeId: number) => void;
  onVisibleRoutesChange?: (routeIds: number[]) => void;
  onGlobeClick?: (lat: number, lng: number) => void;
  className?: string;
  badgeLabel?: string;
}

type GlobeStatus = 'loading' | 'ready' | 'error';

const EARTH_TEXTURE_URL = 'https://cdn.jsdelivr.net/gh/vasturiano/three-globe/example/img/earth-blue-marble.jpg';
const EARTH_BUMP_URL = 'https://cdn.jsdelivr.net/gh/vasturiano/three-globe/example/img/earth-topology.png';
const NIGHT_TEXTURE_URL = 'https://cdn.jsdelivr.net/gh/vasturiano/three-globe/example/img/night-sky.png';

let globeFactoryPromise: Promise<any> | null = null;
let threePromise: Promise<any> | null = null;

function loadOpenGlobeLibrary() {
  if (!globeFactoryPromise) {
    globeFactoryPromise = import('globe.gl').then((module) => module.default);
  }

  if (!threePromise) {
    threePromise = import('three');
  }

  return Promise.all([globeFactoryPromise, threePromise]);
}

function toRad(value: number) {
  return (value * Math.PI) / 180;
}

function distanceKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const earthRadiusKm = 6371;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);

  const sinLat = Math.sin(dLat / 2);
  const sinLng = Math.sin(dLng / 2);
  const h =
    sinLat * sinLat +
    Math.cos(lat1) * Math.cos(lat2) * sinLng * sinLng;

  return 2 * earthRadiusKm * Math.asin(Math.sqrt(h));
}

function computeViewport(routes: ExplorerRoute[]) {
  if (routes.length === 0) {
    return { lat: 43.2, lng: 18.9, altitude: 1.2 };
  }

  const lats = routes.map((route) => route.latitude);
  const lngs = routes.map((route) => route.longitude);
  const minLat = lats.reduce((min, val) => val < min ? val : min, lats[0]);
  const maxLat = lats.reduce((max, val) => val > max ? val : max, lats[0]);
  const minLng = lngs.reduce((min, val) => val < min ? val : min, lngs[0]);
  const maxLng = lngs.reduce((max, val) => val > max ? val : max, lngs[0]);
  const diagonalKm = distanceKm({ lat: minLat, lng: minLng }, { lat: maxLat, lng: maxLng });

  let altitude = 0.35;
  if (diagonalKm > 120) altitude = 0.55;
  if (diagonalKm > 400) altitude = 0.8;
  if (diagonalKm > 900) altitude = 1.05;
  if (diagonalKm > 2000) altitude = 1.35;
  if (diagonalKm > 5000) altitude = 1.8;

  return {
    lat: (minLat + maxLat) / 2,
    lng: (minLng + maxLng) / 2,
    altitude,
  };
}

function computeRouteAltitude(track: TrackPointTuple[] | null | undefined) {
  if (!track || track.length < 2) return 0.28;

  const lats = track.map(([lat]) => lat);
  const lngs = track.map(([, lng]) => lng);
  const minLat = lats.reduce((min, val) => val < min ? val : min, lats[0]);
  const maxLat = lats.reduce((max, val) => val > max ? val : max, lats[0]);
  const minLng = lngs.reduce((min, val) => val < min ? val : min, lngs[0]);
  const maxLng = lngs.reduce((max, val) => val > max ? val : max, lngs[0]);
  const diagonalKm = distanceKm({ lat: minLat, lng: minLng }, { lat: maxLat, lng: maxLng });

  if (diagonalKm <= 10) return 0.18;
  if (diagonalKm <= 40) return 0.28;
  if (diagonalKm <= 120) return 0.45;
  if (diagonalKm <= 300) return 0.7;
  return 0.95;
}

function computeVisibleRadiusKm(altitude: number) {
  return Math.max(180, Math.min(6000, altitude * 2400));
}

function applyCanvasLayout(host: HTMLDivElement) {
  host.querySelectorAll('canvas').forEach((canvas) => {
    canvas.style.display = 'block';
    canvas.style.width = '100%';
    canvas.style.height = '100%';
  });
}

export default function RouteExplorerGlobe({
  routes,
  selectedRouteId = null,
  pois = [],
  onSelectRoute,
  onVisibleRoutesChange,
  onGlobeClick,
  className = '',
  badgeLabel = 'Route Globe',
}: RouteExplorerGlobeProps) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const globeRef = useRef<any>(null);
  const controlsRef = useRef<any>(null);
  const cleanupRef = useRef<null | (() => void)>(null);
  const routePointsRef = useRef<any[]>([]);
  const onSelectRouteRef = useRef(onSelectRoute);
  const onVisibleRoutesChangeRef = useRef(onVisibleRoutesChange);
  const onGlobeClickRef = useRef(onGlobeClick);
  const [status, setStatus] = useState<GlobeStatus>('loading');
  const [errorMessage, setErrorMessage] = useState('');

  onSelectRouteRef.current = onSelectRoute;
  onVisibleRoutesChangeRef.current = onVisibleRoutesChange;
  onGlobeClickRef.current = onGlobeClick;

  const routePoints = useMemo(
    () =>
      routes
        .filter((route) => Number.isFinite(route.latitude) && Number.isFinite(route.longitude))
        .map((route) => ({
          ...route,
          lat: route.latitude,
          lng: route.longitude,
          color: route.id === selectedRouteId ? '#22c55e' : '#f97316',
          size: route.id === selectedRouteId ? 0.16 : 0.1,
        })),
    [routes, selectedRouteId],
  );

  const selectedRoute = useMemo(
    () => routes.find((route) => route.id === selectedRouteId) ?? null,
    [routes, selectedRouteId],
  );

  const selectedPath = useMemo(() => {
    if (!selectedRoute?.preview_track || selectedRoute.preview_track.length < 2) return [];
    return [
      {
        points: selectedRoute.preview_track.map(([lat, lng]) => ({ lat, lng, altitude: 0.008 })),
      },
    ];
  }, [selectedRoute]);

  const poiPoints = useMemo(
    () =>
      pois
        .filter((poi) => Number.isFinite(poi.lat) && Number.isFinite(poi.lng))
        .map((poi) => ({
          ...poi,
          lat: poi.lat,
          lng: poi.lng,
          color: '#38bdf8',
          size: 0.08,
        })),
    [pois],
  );

  const emitVisibleRoutes = useCallback((pov?: { lat: number; lng: number; altitude: number }) => {
    if (!onVisibleRoutesChangeRef.current) return;

    const currentPov = pov ?? globeRef.current?.pointOfView?.();
    if (!currentPov) return;

    const radiusKm = computeVisibleRadiusKm(currentPov.altitude ?? 1);
    const visibleIds = routePointsRef.current
      .filter((route) => distanceKm({ lat: currentPov.lat, lng: currentPov.lng }, { lat: route.lat, lng: route.lng }) <= radiusKm)
      .map((route) => route.id);

    onVisibleRoutesChangeRef.current(
      visibleIds.length > 0 ? visibleIds : routePointsRef.current.map((route) => route.id),
    );
  }, []);

  useEffect(() => {
    if (!hostRef.current) return;
    if (import.meta.env.MODE === 'test') {
      setStatus('ready');
      return;
    }

    let cancelled = false;
    const host = hostRef.current;
    host.innerHTML = '';

    void (async () => {
      try {
        setStatus('loading');
        setErrorMessage('');

        const [GlobeFactory, THREE] = await loadOpenGlobeLibrary();
        if (cancelled || !hostRef.current) return;

        const globe = GlobeFactory()(host);
        globeRef.current = globe;

        const syncSize = () => {
          const width = host.clientWidth;
          const height = host.clientHeight;
          if (width > 0 && height > 0) {
            globe.width(width);
            globe.height(height);
            applyCanvasLayout(host);
          }
        };

        syncSize();
        const resizeObserver = new ResizeObserver(() => {
          syncSize();
        });
        resizeObserver.observe(host);
        cleanupRef.current = () => {
          resizeObserver.disconnect();
        };

        globe
          .globeImageUrl(EARTH_TEXTURE_URL)
          .bumpImageUrl(EARTH_BUMP_URL)
          .backgroundImageUrl(NIGHT_TEXTURE_URL)
          .backgroundColor('#020617')
          .atmosphereColor('#60a5fa')
          .atmosphereAltitude(0.18)
          .showGraticules(false)
          .pointLabel((point: any) => {
            if (point.__kind === 'poi') {
              return point.name || point.type || 'POI';
            }
            const price = typeof point.price === 'number' ? `$${point.price.toFixed(2)}` : '';
            return `
              <div style="min-width:180px">
                <div style="font-weight:700">${point.title}</div>
                <div style="font-size:12px;opacity:0.8">${point.location_string || ''}</div>
                <div style="font-size:12px;opacity:0.8">${point.category_name || ''} ${price}</div>
              </div>
            `;
          })
          .onPointClick((point: any) => {
            if (point.__kind === 'route') {
              onSelectRouteRef.current?.(point.id);
            }
          })
          .onGlobeClick((coords: { lat: number; lng: number }) => {
            onGlobeClickRef.current?.(coords.lat, coords.lng);
          });

        const controls = globe.controls();
        controls.autoRotate = false;
        controls.enablePan = false;
        controls.minDistance = 120;
        controls.maxDistance = 560;
        controls.rotateSpeed = 0.8;
        controlsRef.current = controls;

        globe.scene().add(new THREE.AmbientLight(0xffffff, 1.45));
        const directionalLight = new THREE.DirectionalLight(0xffffff, 1.3);
        directionalLight.position.set(1, 1, 1);
        globe.scene().add(directionalLight);

        const initialView = computeViewport(routePoints);
        globe.pointOfView(initialView, 0);
        const initialFocusTimers = [
          window.setTimeout(() => {
            syncSize();
            globe.pointOfView(initialView, 0);
          }, 90),
          window.setTimeout(() => {
            syncSize();
            globe.pointOfView(initialView, 550);
          }, 420),
        ];

        const handleViewportEnd = () => emitVisibleRoutes();
        controls.addEventListener('end', handleViewportEnd);
        setTimeout(emitVisibleRoutes, 250);
        setStatus('ready');
        cleanupRef.current = () => {
          initialFocusTimers.forEach((timer) => window.clearTimeout(timer));
          resizeObserver.disconnect();
        };
      } catch (error) {
        if (cancelled) return;
        console.error('RouteExplorerGlobe error:', error);
        setStatus('error');
        setErrorMessage('3D globe could not be loaded.');
      }
    })();

    return () => {
      cancelled = true;
      if (controlsRef.current) {
        controlsRef.current.dispose?.();
        controlsRef.current = null;
      }
      cleanupRef.current?.();
      cleanupRef.current = null;
      globeRef.current?._destructor?.();
      globeRef.current = null;
      host.innerHTML = '';
    };
  }, [emitVisibleRoutes]);

  useEffect(() => {
    if (!globeRef.current || import.meta.env.MODE === 'test') return;

    routePointsRef.current = routePoints;

    const pointsData = [
      ...routePoints.map((route) => ({ ...route, __kind: 'route' as const })),
      ...poiPoints.map((poi) => ({ ...poi, __kind: 'poi' as const })),
    ];

    globeRef.current
      .pointsData(pointsData)
      .pointLat('lat')
      .pointLng('lng')
      .pointAltitude(0.012)
      .pointColor('color')
      .pointRadius('size')
      .pathsData(selectedPath)
      .pathPoints('points')
      .pathPointLat('lat')
      .pathPointLng('lng')
      .pathPointAlt('altitude')
      .pathColor(() => '#38bdf8')
      .pathStroke(1.25)
      .pathTransitionDuration(0);

    if (!selectedRoute && routePoints.length > 0) {
      globeRef.current.pointOfView(computeViewport(routePoints), 900);
    }

    emitVisibleRoutes();
  }, [emitVisibleRoutes, poiPoints, routePoints, selectedPath, selectedRoute]);

  useEffect(() => {
    if (!globeRef.current || !selectedRoute) return;

    const hasTrack = Array.isArray(selectedRoute.preview_track) && selectedRoute.preview_track.length > 1;
    globeRef.current.pointOfView(
      {
        lat: selectedRoute.latitude,
        lng: selectedRoute.longitude,
        altitude: hasTrack ? computeRouteAltitude(selectedRoute.preview_track) : 0.38,
      },
      900,
    );
  }, [selectedRoute]);

  return (
    <div className={`relative h-full w-full overflow-hidden rounded-xl bg-slate-950 ${className}`}>
      <div ref={hostRef} className="h-full w-full" />

      <div className="absolute left-3 top-3 rounded-full bg-slate-950/70 px-3 py-1 text-xs font-medium text-white backdrop-blur">
        {badgeLabel}
      </div>

      {status !== 'ready' && (
        <div className="absolute inset-0 flex items-center justify-center bg-slate-950/75">
          <div className="flex max-w-xs flex-col items-center gap-3 px-4 text-center text-white">
            {status === 'loading' ? <Loader2 className="h-6 w-6 animate-spin" /> : <Globe className="h-6 w-6" />}
            <p className="text-sm text-white/85">
              {status === 'loading' ? 'Loading 3D globe...' : errorMessage}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
