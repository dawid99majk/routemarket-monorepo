import { useEffect, useRef, useState } from 'react';
import { Globe, Loader2 } from 'lucide-react';
import { Loader } from '@googlemaps/js-api-loader';

interface RouteGlobe3DProps {
  track: [number, number][];
  className?: string;
}

type GlobeProvider = 'google-3d' | 'open-globe';
type GlobeStatus = 'loading' | 'ready' | 'error';

const GOOGLE_MAPS_API_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY;
const EARTH_TEXTURE_URL = 'https://cdn.jsdelivr.net/gh/vasturiano/three-globe/example/img/earth-blue-marble.jpg';
const EARTH_BUMP_URL = 'https://cdn.jsdelivr.net/gh/vasturiano/three-globe/example/img/earth-topology.png';
const NIGHT_TEXTURE_URL = 'https://cdn.jsdelivr.net/gh/vasturiano/three-globe/example/img/night-sky.png';

let maps3dPromise: Promise<{
  Map3DElement: any;
  Marker3DElement: any;
  Polyline3DElement: any;
}> | null = null;

let globeFactoryPromise: Promise<any> | null = null;
let threePromise: Promise<any> | null = null;

function loadMaps3DLibrary() {
  if (!GOOGLE_MAPS_API_KEY) {
    throw new Error('Google Maps 3D is not configured.');
  }

  if (!maps3dPromise) {
    maps3dPromise = (async () => {
      const loader = new Loader({
        apiKey: GOOGLE_MAPS_API_KEY,
        version: 'beta',
      });

      await loader.load();
      const maps3d = await (window as any).google.maps.importLibrary('maps3d');
      return {
        Map3DElement: maps3d.Map3DElement,
        Marker3DElement: maps3d.Marker3DElement,
        Polyline3DElement: maps3d.Polyline3DElement,
      };
    })();
  }

  return maps3dPromise;
}

function loadOpenGlobeLibrary() {
  if (!globeFactoryPromise) {
    globeFactoryPromise = import('globe.gl').then((module) => module.default);
  }

  if (!threePromise) {
    threePromise = import('three');
  }

  return Promise.all([globeFactoryPromise, threePromise]);
}

function haversineMeters(a: [number, number], b: [number, number]) {
  const toRad = (value: number) => (value * Math.PI) / 180;
  const earthRadius = 6371000;
  const dLat = toRad(b[0] - a[0]);
  const dLng = toRad(b[1] - a[1]);
  const lat1 = toRad(a[0]);
  const lat2 = toRad(b[0]);

  const sinLat = Math.sin(dLat / 2);
  const sinLng = Math.sin(dLng / 2);
  const h =
    sinLat * sinLat +
    Math.cos(lat1) * Math.cos(lat2) * sinLng * sinLng;

  return 2 * earthRadius * Math.asin(Math.sqrt(h));
}

function computeTrackMetrics(track: [number, number][]) {
  const lats = track.map(([lat]) => lat);
  const lngs = track.map(([, lng]) => lng);
  const minLat = lats.reduce((min, val) => val < min ? val : min, lats[0]);
  const maxLat = lats.reduce((max, val) => val > max ? val : max, lats[0]);
  const minLng = lngs.reduce((min, val) => val < min ? val : min, lngs[0]);
  const maxLng = lngs.reduce((max, val) => val > max ? val : max, lngs[0]);
  const centerLat = (minLat + maxLat) / 2;
  const centerLng = (minLng + maxLng) / 2;
  const diagonalMeters = haversineMeters([minLat, minLng], [maxLat, maxLng]);

  return {
    bounds: {
      minLat,
      maxLat,
      minLng,
      maxLng,
    },
    center: { lat: centerLat, lng: centerLng, altitude: 0 },
    diagonalMeters,
  };
}

function computeGoogleCamera(track: [number, number][]) {
  const metrics = computeTrackMetrics(track);
  return {
    center: metrics.center,
    range: Math.max(2500, Math.min(metrics.diagonalMeters * 2.2, 1800000)),
    tilt: metrics.diagonalMeters > 80000 ? 48 : 60,
  };
}

function computeOpenGlobeAltitude(diagonalMeters: number) {
  if (diagonalMeters <= 2000) return 0.08;
  if (diagonalMeters <= 8000) return 0.1;
  if (diagonalMeters <= 25000) return 0.13;
  if (diagonalMeters <= 80000) return 0.17;
  if (diagonalMeters <= 200000) return 0.25;
  if (diagonalMeters <= 500000) return 0.38;
  if (diagonalMeters <= 900000) return 0.54;
  return 0.66;
}

function applyCanvasLayout(host: HTMLDivElement) {
  host.querySelectorAll('canvas').forEach((canvas) => {
    canvas.style.display = 'block';
    canvas.style.width = '100%';
    canvas.style.height = '100%';
  });
}

function densifyTrack(track: [number, number][]) {
  if (track.length < 2) return track;

  const dense: [number, number][] = [];

  for (let index = 0; index < track.length - 1; index += 1) {
    const current = track[index];
    const next = track[index + 1];
    dense.push(current);

    const segmentMeters = haversineMeters(current, next);
    const steps = Math.max(1, Math.min(24, Math.round(segmentMeters / 3000)));

    for (let step = 1; step < steps; step += 1) {
      const ratio = step / steps;
      dense.push([
        current[0] + (next[0] - current[0]) * ratio,
        current[1] + (next[1] - current[1]) * ratio,
      ]);
    }
  }

  dense.push(track[track.length - 1]);
  return dense;
}

async function renderGoogleGlobe(host: HTMLDivElement, track: [number, number][]) {
  const { Map3DElement, Marker3DElement, Polyline3DElement } = await loadMaps3DLibrary();
  const camera = computeGoogleCamera(track);
  const map = new Map3DElement();
  map.style.width = '100%';
  map.style.height = '100%';
  map.center = camera.center;
  map.range = camera.range;
  map.tilt = camera.tilt;
  map.heading = 0;
  host.appendChild(map);

  const polyline = new Polyline3DElement();
  polyline.path = track.map(([lat, lng]) => ({ lat, lng, altitude: 30 }));
  polyline.strokeColor = '#2563eb';
  polyline.strokeWidth = 8;
  map.appendChild(polyline);

  const startMarker = new Marker3DElement();
  startMarker.position = { lat: track[0][0], lng: track[0][1], altitude: 0 };
  startMarker.label = 'S';
  map.appendChild(startMarker);

  const endMarker = new Marker3DElement();
  const last = track[track.length - 1];
  endMarker.position = { lat: last[0], lng: last[1], altitude: 0 };
  endMarker.label = 'E';
  map.appendChild(endMarker);

  if (typeof map.flyCameraTo === 'function') {
    map.flyCameraTo({
      endCamera: {
        center: camera.center,
        range: camera.range,
        tilt: camera.tilt,
        heading: 20,
      },
      durationMillis: 1600,
    });
  }

  return () => {
    host.innerHTML = '';
  };
}

async function renderOpenGlobe(host: HTMLDivElement, track: [number, number][]) {
  const [GlobeFactory, THREE] = await loadOpenGlobeLibrary();
  const denseTrack = densifyTrack(track);
  const metrics = computeTrackMetrics(denseTrack);
  const globe = GlobeFactory()(host);
  const isCompactRoute = metrics.diagonalMeters <= 25000;
  const pathPoints = denseTrack.map(([lat, lng]) => ({
    lat,
    lng,
    altitude: isCompactRoute ? 0.004 : 0.008,
  }));
  const markerPoints = [
    { lat: track[0][0], lng: track[0][1], size: isCompactRoute ? 0.026 : 0.06, color: '#22c55e' },
    { lat: track[track.length - 1][0], lng: track[track.length - 1][1], size: isCompactRoute ? 0.026 : 0.06, color: '#ef4444' },
  ];
  const trackDots =
    denseTrack.length > 12
      ? denseTrack.filter((_, index) => index % (isCompactRoute ? 14 : 8) === 0).map(([lat, lng]) => ({
          lat,
          lng,
          size: isCompactRoute ? 0.005 : 0.01,
          color: '#7dd3fc',
        }))
      : [];

  globe
    .globeImageUrl(EARTH_TEXTURE_URL)
    .bumpImageUrl(EARTH_BUMP_URL)
    .backgroundImageUrl(NIGHT_TEXTURE_URL)
    .backgroundColor('#020617')
    .atmosphereColor('#60a5fa')
    .atmosphereAltitude(0.18)
    .showGraticules(false)
    .pathsData([{ points: pathPoints }])
    .pathPoints('points')
    .pathPointLat('lat')
    .pathPointLng('lng')
    .pathPointAlt('altitude')
    .pathColor(() => '#7dd3fc')
    .pathStroke(isCompactRoute ? 1.6 : 2.3)
    .pathTransitionDuration(0)
    .pointsData([...trackDots, ...markerPoints])
    .pointLat('lat')
    .pointLng('lng')
    .pointAltitude(isCompactRoute ? 0.006 : 0.012)
    .pointColor('color')
    .pointRadius('size');

  const controls = globe.controls();
  controls.autoRotate = false;
  controls.enablePan = false;
  controls.minDistance = 70;
  controls.maxDistance = 320;
  controls.rotateSpeed = 0.9;

  globe.scene().add(new THREE.AmbientLight(0xffffff, 1.4));
  const directionalLight = new THREE.DirectionalLight(0xffffff, 1.2);
  directionalLight.position.set(1, 1, 1);
  globe.scene().add(directionalLight);

  const focusRoute = (duration: number) => {
    globe.pointOfView(
      {
        lat: metrics.center.lat,
        lng: metrics.center.lng,
        altitude: computeOpenGlobeAltitude(metrics.diagonalMeters),
      },
      duration,
    );
  };

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
  focusRoute(0);

  const resizeObserver = new ResizeObserver(() => {
    syncSize();
    window.requestAnimationFrame(() => focusRoute(0));
    window.setTimeout(() => focusRoute(450), 120);
  });
  resizeObserver.observe(host);

  const focusTimers = [
    window.setTimeout(() => {
      syncSize();
      focusRoute(0);
    }, 80),
    window.setTimeout(() => {
      syncSize();
      focusRoute(650);
    }, 450),
    window.setTimeout(() => {
      syncSize();
      focusRoute(0);
    }, 1300),
  ];

  return () => {
    controls.autoRotate = false;
    focusTimers.forEach((timer) => window.clearTimeout(timer));
    resizeObserver.disconnect();
    if (typeof globe._destructor === 'function') {
      globe._destructor();
    }
    host.innerHTML = '';
  };
}

export default function RouteGlobe3D({ track, className = '' }: RouteGlobe3DProps) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const cleanupRef = useRef<null | (() => void)>(null);
  const [status, setStatus] = useState<GlobeStatus>('loading');
  const [provider, setProvider] = useState<GlobeProvider>('open-globe');
  const [errorMessage, setErrorMessage] = useState('');

  useEffect(() => {
    if (!hostRef.current || track.length < 2) return;
    if (import.meta.env.MODE === 'test') {
      setStatus('ready');
      setProvider('open-globe');
      return;
    }

    let cancelled = false;
    const host = hostRef.current;
    host.innerHTML = '';
    cleanupRef.current?.();
    cleanupRef.current = null;
    setStatus('loading');
    setErrorMessage('');

    void (async () => {
      const renderers = GOOGLE_MAPS_API_KEY
        ? [
            { key: 'google-3d' as const, run: () => renderGoogleGlobe(host, track) },
            { key: 'open-globe' as const, run: () => renderOpenGlobe(host, track) },
          ]
        : [{ key: 'open-globe' as const, run: () => renderOpenGlobe(host, track) }];

      let lastError: unknown = null;

      for (const renderer of renderers) {
        try {
          const cleanup = await renderer.run();
          if (cancelled) {
            cleanup();
            return;
          }

          cleanupRef.current = cleanup;
          setProvider(renderer.key);
          setStatus('ready');
          return;
        } catch (error) {
          lastError = error;
          host.innerHTML = '';
          console.error(`RouteGlobe3D ${renderer.key} error:`, error);
        }
      }

      if (cancelled) return;
      setStatus('error');
      setErrorMessage(
        lastError instanceof Error && lastError.message
          ? lastError.message
          : '3D map could not be loaded.',
      );
    })();

    return () => {
      cancelled = true;
      cleanupRef.current?.();
      cleanupRef.current = null;
      host.innerHTML = '';
    };
  }, [track]);

  if (track.length < 2) return null;

  return (
    <div className={`relative h-full w-full overflow-hidden rounded-xl bg-slate-950 ${className}`}>
      <div ref={hostRef} className="h-full w-full" />

      <div className="absolute left-3 top-3 rounded-full bg-slate-950/70 px-3 py-1 text-xs font-medium text-white backdrop-blur">
        {provider === 'google-3d' ? 'Google 3D' : 'Open Globe'}
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
