import { useEffect, useRef, memo } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

interface RoutePreviewMapProps {
  track: [number, number][];
  className?: string;
}

/**
 * Small, non-interactive map showing a route polyline preview.
 * Used on Route Cards for visual appeal.
 */
function RoutePreviewMapInner({ track, className = '' }: RoutePreviewMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);

  useEffect(() => {
    if (!containerRef.current || mapRef.current || track.length < 2) return;

    const map = L.map(containerRef.current, {
      zoomControl: false,
      attributionControl: false,
      dragging: false,
      scrollWheelZoom: false,
      doubleClickZoom: false,
      touchZoom: false,
      boxZoom: false,
      keyboard: false,
      tap: false,
    } as any);

    L.tileLayer('https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png', {
      maxZoom: 17,
      noWrap: true,
    }).addTo(map);

    const latLngs = track.map(([lat, lng]) => L.latLng(lat, lng));
    const polyline = L.polyline(latLngs, {
      color: 'hsl(142, 37%, 38%)',
      weight: 3,
      opacity: 0.85,
      lineCap: 'round',
      lineJoin: 'round',
    }).addTo(map);

    map.fitBounds(polyline.getBounds(), { padding: [16, 16], maxZoom: 11, animate: false });
    mapRef.current = map;

    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, [track]);

  if (track.length < 2) return null;

  return <div ref={containerRef} className={`w-full h-full ${className}`} style={{ zIndex: 0 }} />;
}

const RoutePreviewMap = memo(RoutePreviewMapInner);
export default RoutePreviewMap;
