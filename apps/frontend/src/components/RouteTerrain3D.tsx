import { useEffect, useRef, useState } from 'react';
import { Box, Loader2 } from 'lucide-react';

interface RouteTerrain3DProps {
  track: [number, number][];
  className?: string;
}

type TerrainStatus = 'loading' | 'ready' | 'error';

type ThreeModule = typeof import('three');
type OrbitControlsModule = typeof import('three/examples/jsm/controls/OrbitControls.js');

let threeModulePromise: Promise<ThreeModule> | null = null;
let orbitControlsPromise: Promise<OrbitControlsModule> | null = null;

function loadThreeStack() {
  if (!threeModulePromise) {
    threeModulePromise = import('three');
  }

  if (!orbitControlsPromise) {
    orbitControlsPromise = import('three/examples/jsm/controls/OrbitControls.js');
  }

  return Promise.all([threeModulePromise, orbitControlsPromise]);
}

function lerp(start: number, end: number, ratio: number) {
  return start + (end - start) * ratio;
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

function densifyTrack(track: [number, number][]) {
  if (track.length < 2) return track;

  const dense: [number, number][] = [];

  for (let index = 0; index < track.length - 1; index += 1) {
    const current = track[index];
    const next = track[index + 1];
    dense.push(current);

    const segmentMeters = haversineMeters(current, next);
    const steps = Math.max(1, Math.min(18, Math.round(segmentMeters / 1200)));

    for (let step = 1; step < steps; step += 1) {
      const ratio = step / steps;
      dense.push([
        lerp(current[0], next[0], ratio),
        lerp(current[1], next[1], ratio),
      ]);
    }
  }

  dense.push(track[track.length - 1]);
  return dense;
}

function createSeed(track: [number, number][]) {
  const [startLat, startLng] = track[0];
  const [endLat, endLng] = track[track.length - 1];
  const raw = Math.abs(
    Math.sin(startLat * 12.9898 + startLng * 78.233 + endLat * 37.719 + endLng * 11.131),
  );
  return raw * 43758.5453;
}

function pseudoNoise(seed: number, x: number, z: number) {
  const value =
    Math.sin(x * 2.1 + seed * 0.00017) * 0.42 +
    Math.cos(z * 2.6 - seed * 0.00011) * 0.33 +
    Math.sin((x + z) * 3.3 + seed * 0.00007) * 0.19 +
    Math.cos((x - z) * 4.2 - seed * 0.00013) * 0.11;

  return value;
}

function projectTrack(track: [number, number][]) {
  const denseTrack = densifyTrack(track);
  const lats = denseTrack.map(([lat]) => lat);
  const lngs = denseTrack.map(([, lng]) => lng);
  const minLat = lats.reduce((min, val) => val < min ? val : min, lats[0]);
  const maxLat = lats.reduce((max, val) => val > max ? val : max, lats[0]);
  const minLng = lngs.reduce((min, val) => val < min ? val : min, lngs[0]);
  const maxLng = lngs.reduce((max, val) => val > max ? val : max, lngs[0]);
  const centerLat = (minLat + maxLat) / 2;
  const centerLng = (minLng + maxLng) / 2;
  const latScale = 111320;
  const lngScale = Math.cos((centerLat * Math.PI) / 180) * 111320;

  const localPoints = denseTrack.map(([lat, lng]) => ({
    x: (lng - centerLng) * lngScale,
    z: -(lat - centerLat) * latScale,
  }));

  const xs = localPoints.map((point) => point.x);
  const zs = localPoints.map((point) => point.z);
  const minX = xs.reduce((min, val) => val < min ? val : min, xs[0]);
  const maxX = xs.reduce((max, val) => val > max ? val : max, xs[0]);
  const minZ = zs.reduce((min, val) => val < min ? val : min, zs[0]);
  const maxZ = zs.reduce((max, val) => val > max ? val : max, zs[0]);
  const widthMeters = Math.max(250, maxX - minX);
  const depthMeters = Math.max(250, maxZ - minZ);
  const scale = 140 / Math.max(widthMeters, depthMeters);

  return {
    denseTrack,
    scale,
    widthMeters,
    depthMeters,
    center: { lat: centerLat, lng: centerLng },
    points: localPoints.map((point) => ({
      x: point.x * scale,
      z: point.z * scale,
    })),
  };
}

async function renderTerrain(
  host: HTMLDivElement,
  track: [number, number][],
  onFlythroughStopped: () => void
) {
  const [THREE, { OrbitControls }] = await loadThreeStack();
  const projected = projectTrack(track);
  const { points, widthMeters, depthMeters, scale } = projected;
  const seed = createSeed(track);

  const renderer = new THREE.WebGLRenderer({
    antialias: true,
    alpha: true,
    powerPreference: 'high-performance',
  });
  renderer.domElement.style.display = 'block';
  renderer.domElement.style.width = '100%';
  renderer.domElement.style.height = '100%';
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.1;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  host.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#08111f');
  scene.fog = new THREE.Fog('#08111f', 90, 210);

  const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 1000);
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enablePan = false;
  controls.enableDamping = true;
  controls.dampingFactor = 0.06;
  controls.minDistance = 30;
  controls.maxDistance = 170;
  controls.maxPolarAngle = Math.PI * 0.48;
  controls.minPolarAngle = Math.PI * 0.18;
  controls.target.set(0, 4, 0);

  const ambientLight = new THREE.HemisphereLight('#cfe7ff', '#09121c', 1.4);
  scene.add(ambientLight);

  const sunlight = new THREE.DirectionalLight('#fff5db', 1.8);
  sunlight.position.set(55, 75, 25);
  sunlight.castShadow = true;
  sunlight.shadow.mapSize.width = 1024;
  sunlight.shadow.mapSize.height = 1024;
  sunlight.shadow.camera.near = 10;
  sunlight.shadow.camera.far = 220;
  scene.add(sunlight);

  const fillLight = new THREE.DirectionalLight('#7dd3fc', 0.55);
  fillLight.position.set(-45, 35, -30);
  scene.add(fillLight);

  const terrainWidth = Math.max(95, widthMeters * scale + 26);
  const terrainDepth = Math.max(95, depthMeters * scale + 26);
  const widthSegments = 88;
  const depthSegments = 88;
  const terrainGeometry = new THREE.PlaneGeometry(terrainWidth, terrainDepth, widthSegments, depthSegments);
  terrainGeometry.rotateX(-Math.PI / 2);

  const position = terrainGeometry.attributes.position as THREE.BufferAttribute;
  const colors = new Float32Array(position.count * 3);
  const routeSamples = points;

  for (let index = 0; index < position.count; index += 1) {
    const x = position.getX(index);
    const z = position.getZ(index);
    let nearestDistance = Number.POSITIVE_INFINITY;

    for (let sampleIndex = 0; sampleIndex < routeSamples.length; sampleIndex += 6) {
      const sample = routeSamples[sampleIndex];
      const dx = x - sample.x;
      const dz = z - sample.z;
      const distance = Math.sqrt(dx * dx + dz * dz);
      if (distance < nearestDistance) {
        nearestDistance = distance;
      }
    }

    const normalizedDistance = Math.min(1, nearestDistance / 26);
    const noise = pseudoNoise(seed, x * 0.06, z * 0.06);
    const ridges = pseudoNoise(seed * 1.37, x * 0.12 + 10, z * 0.1 - 8) * 0.55;
    const edgeLift = Math.pow(Math.min(1, (Math.abs(x) / (terrainWidth * 0.5) + Math.abs(z) / (terrainDepth * 0.5)) * 0.5), 1.4);
    const valleyFlatten = 1 - Math.pow(1 - normalizedDistance, 2.2);
    const height =
      (noise * 4.5 + ridges * 3.2 + edgeLift * 7.5) * valleyFlatten +
      Math.max(0, 1 - normalizedDistance * 1.8) * 1.2;

    position.setY(index, height);

    const low = new THREE.Color('#1a4731');
    const mid = new THREE.Color('#4d7c0f');
    const high = new THREE.Color('#a16207');
    const peak = new THREE.Color('#fef3c7');
    const colorMix = Math.min(1, Math.max(0, height / 12));
    const terrainColor =
      colorMix < 0.4
        ? low.clone().lerp(mid, colorMix / 0.4)
        : colorMix < 0.75
          ? mid.clone().lerp(high, (colorMix - 0.4) / 0.35)
          : high.clone().lerp(peak, (colorMix - 0.75) / 0.25);

    colors[index * 3] = terrainColor.r;
    colors[index * 3 + 1] = terrainColor.g;
    colors[index * 3 + 2] = terrainColor.b;
  }

  terrainGeometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  terrainGeometry.computeVertexNormals();

  const terrainMaterial = new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.92,
    metalness: 0.02,
    flatShading: false,
  });

  const terrainMesh = new THREE.Mesh(terrainGeometry, terrainMaterial);
  terrainMesh.receiveShadow = true;
  scene.add(terrainMesh);

  const gridHelper = new THREE.GridHelper(Math.max(terrainWidth, terrainDepth), 12, '#33516d', '#1f3143');
  gridHelper.position.y = 0.16;
  scene.add(gridHelper);

  const trackVectors = points.map((point) => new THREE.Vector3(point.x, 2.5, point.z));
  const routeCurve = new THREE.CatmullRomCurve3(trackVectors);
  const routeGeometry = new THREE.TubeGeometry(routeCurve, Math.max(80, points.length * 2), 1.2, 12, false);
  const routeMaterial = new THREE.MeshStandardMaterial({
    color: '#00f2ff',
    emissive: '#00f2ff',
    emissiveIntensity: 2.5,
    roughness: 0.1,
    metalness: 0.5,
  });
  const routeMesh = new THREE.Mesh(routeGeometry, routeMaterial);
  routeMesh.castShadow = true;
  scene.add(routeMesh);

  const haloGeometry = new THREE.TubeGeometry(routeCurve, Math.max(80, points.length * 2), 2.8, 12, false);
  const haloMaterial = new THREE.MeshBasicMaterial({
    color: '#00f2ff',
    transparent: true,
    opacity: 0.25,
  });
  const haloMesh = new THREE.Mesh(haloGeometry, haloMaterial);
  scene.add(haloMesh);

  const markerGeometry = new THREE.SphereGeometry(2.4, 24, 24);
  const startMarker = new THREE.Mesh(
    markerGeometry,
    new THREE.MeshStandardMaterial({ 
      color: '#22c55e', 
      emissive: '#22c55e', 
      emissiveIntensity: 1.5 
    }),
  );
  startMarker.position.copy(trackVectors[0]);
  startMarker.position.y = 4.5;
  startMarker.castShadow = true;
  scene.add(startMarker);

  const endMarker = new THREE.Mesh(
    markerGeometry,
    new THREE.MeshStandardMaterial({ 
      color: '#ef4444', 
      emissive: '#ef4444', 
      emissiveIntensity: 1.5 
    }),
  );
  endMarker.position.copy(trackVectors[trackVectors.length - 1]);
  endMarker.position.y = 4.5;
  endMarker.castShadow = true;
  scene.add(endMarker);

  const fitDistance = Math.max(52, Math.min(135, Math.max(terrainWidth, terrainDepth) * 0.86));
  camera.position.set(0, fitDistance * 0.72, fitDistance);
  camera.lookAt(controls.target);

  const resize = () => {
    const width = host.clientWidth;
    const height = host.clientHeight;
    if (width <= 0 || height <= 0) return;
    renderer.setSize(width, height, true);
    renderer.domElement.style.width = '100%';
    renderer.domElement.style.height = '100%';
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
  };

  resize();

  let destroyed = false;
  let frameId = 0;
  let introActive = true;
  let flythroughActive = false;
  let flythroughStart = 0;
  const introStartedAt = performance.now();

  const animate = () => {
    if (destroyed) return;
    frameId = window.requestAnimationFrame(animate);

    const elapsed = performance.now() - introStartedAt;
    if (introActive) {
      const progress = Math.min(1, elapsed / 1800);
      const eased = 1 - Math.pow(1 - progress, 3);
      camera.position.x = lerp(18, 0, eased);
      camera.position.y = lerp(fitDistance * 0.92, fitDistance * 0.72, eased);
      camera.position.z = lerp(fitDistance * 1.18, fitDistance, eased);
      controls.target.y = lerp(2.4, 4, eased);
      if (progress >= 1) {
        introActive = false;
      }
    }

    if (flythroughActive) {
      const flyElapsed = performance.now() - flythroughStart;
      const t = (flyElapsed / 24000) % 1; // 24 seconds for complete loop

      const pt = routeCurve.getPointAt(t);
      camera.position.set(pt.x, pt.y + 6.2, pt.z + 1.8);

      const targetT = (t + 0.012) % 1;
      const lookPt = routeCurve.getPointAt(targetT);
      lookPt.y += 1.8;

      camera.lookAt(lookPt);
      controls.target.copy(lookPt);
    }

    routeMesh.material.emissiveIntensity = 0.32 + Math.sin(performance.now() * 0.0025) * 0.04;
    
    if (!flythroughActive) {
      controls.update();
    }
    
    renderer.render(scene, camera);
  };

  animate();

  const resizeObserver = new ResizeObserver(() => resize());
  resizeObserver.observe(host);

  const stopIntro = () => {
    introActive = false;
    if (flythroughActive) {
      flythroughActive = false;
      controls.enabled = true;
      onFlythroughStopped();
    }
  };

  renderer.domElement.addEventListener('pointerdown', stopIntro, { passive: true });
  renderer.domElement.addEventListener('wheel', stopIntro, { passive: true });

  return {
    cleanup: () => {
      destroyed = true;
      window.cancelAnimationFrame(frameId);
      resizeObserver.disconnect();
      renderer.domElement.removeEventListener('pointerdown', stopIntro);
      renderer.domElement.removeEventListener('wheel', stopIntro);
      controls.dispose();
      terrainGeometry.dispose();
      terrainMaterial.dispose();
      routeGeometry.dispose();
      routeMaterial.dispose();
      haloGeometry.dispose();
      haloMaterial.dispose();
      markerGeometry.dispose();
      renderer.dispose();
      host.innerHTML = '';
    },
    setFlythrough: (active: boolean) => {
      flythroughActive = active;
      if (active) {
        introActive = false;
        flythroughStart = performance.now();
        controls.enabled = false;
      } else {
        controls.enabled = true;
      }
    }
  };
}

interface TerrainControls {
  cleanup: () => void;
  setFlythrough: (active: boolean) => void;
}

export default function RouteTerrain3D({ track, className = '' }: RouteTerrain3DProps) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const controlsRef = useRef<null | TerrainControls>(null);
  const [status, setStatus] = useState<TerrainStatus>('loading');
  const [errorMessage, setErrorMessage] = useState('');
  const [flythroughActive, setFlythroughActive] = useState(false);

  useEffect(() => {
    if (!hostRef.current || track.length < 2) return;
    if (import.meta.env.MODE === 'test') {
      setStatus('ready');
      return;
    }

    let cancelled = false;
    const host = hostRef.current;
    controlsRef.current?.cleanup();
    controlsRef.current = null;
    host.innerHTML = '';
    setStatus('loading');
    setErrorMessage('');
    setFlythroughActive(false);

    void (async () => {
      try {
        const result = await renderTerrain(host, track, () => {
          setFlythroughActive(false);
        });
        if (cancelled) {
          result.cleanup();
          return;
        }

        controlsRef.current = result;
        setStatus('ready');
      } catch (error) {
        console.error('RouteTerrain3D error:', error);
        if (cancelled) return;
        setStatus('error');
        setErrorMessage(
          error instanceof Error && error.message
            ? error.message
            : '3D terrain view could not be loaded.',
        );
      }
    })();

    return () => {
      cancelled = true;
      controlsRef.current?.cleanup();
      controlsRef.current = null;
      host.innerHTML = '';
    };
  }, [track]);

  const handleToggleFlythrough = () => {
    const nextState = !flythroughActive;
    setFlythroughActive(nextState);
    controlsRef.current?.setFlythrough(nextState);
  };

  if (track.length < 2) return null;

  return (
    <div className={`relative h-full w-full overflow-hidden rounded-xl bg-slate-950 ${className}`}>
      <div ref={hostRef} className="h-full w-full" />

      {/* Floating Control Panel */}
      <div className="absolute left-3 top-3 flex items-center gap-2">
        <div className="rounded-full bg-slate-950/85 px-3 py-1 text-xs font-semibold text-white border border-slate-800 backdrop-blur shadow-sm">
          Model 3D Terenu
        </div>
        {status === 'ready' && (
          <button
            type="button"
            onClick={handleToggleFlythrough}
            className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold border transition-all ${
              flythroughActive
                ? 'bg-rose-600 hover:bg-rose-700 text-white border-rose-500 shadow-rose-900/30 shadow-md animate-pulse'
                : 'bg-slate-900 hover:bg-slate-800 text-slate-100 border-slate-700 shadow-sm'
            }`}
          >
            <span className="relative flex h-2 w-2">
              <span className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${flythroughActive ? 'bg-white' : 'bg-red-400'}`}></span>
              <span className={`relative inline-flex rounded-full h-2 w-2 ${flythroughActive ? 'bg-white' : 'bg-red-500'}`}></span>
            </span>
            {flythroughActive ? 'Zatrzymaj Przelot' : '📹 Wirtualny Przelot'}
          </button>
        )}
      </div>

      {status !== 'ready' && (
        <div className="absolute inset-0 flex items-center justify-center bg-slate-950/75">
          <div className="flex max-w-xs flex-col items-center gap-3 px-4 text-center text-white">
            {status === 'loading' ? <Loader2 className="h-6 w-6 animate-spin" /> : <Box className="h-6 w-6" />}
            <p className="text-sm text-white/85">
              {status === 'loading' ? 'Budowanie trójwymiarowego terenu...' : errorMessage}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
