import { useEffect, useRef, useCallback } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

interface MapRoute {
  id: number;
  title: string;
  price: number;
  latitude: number;
  longitude: number;
  location_string: string;
  category_name: string;
}

export interface MapBounds {
  north: number;
  south: number;
  east: number;
  west: number;
}

interface MapViewProps {
  routes: MapRoute[];
  onRouteClick: (id: number) => void;
  onBoundsChange?: (bounds: MapBounds) => void;
  center?: [number, number];
  zoom?: number;
  interactive?: boolean;
  minZoom?: number;
}

delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
});

const customIcon = L.divIcon({
  className: 'custom-marker',
  html: `<div style="
    background: hsl(142, 37%, 28%);
    color: white;
    border-radius: 50%;
    width: 32px;
    height: 32px;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 14px;
    font-weight: bold;
    border: 3px solid white;
    box-shadow: 0 2px 8px rgba(0,0,0,0.3);
  ">⛰</div>`,
  iconSize: [32, 32],
  iconAnchor: [16, 16],
  popupAnchor: [0, -16],
});

function getOsmTileUrl(): string {
  return 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png';
}

export default function MapView({ routes, onRouteClick, onBoundsChange, center, zoom = 3, interactive = true, minZoom = 2 }: MapViewProps) {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const markersRef = useRef<L.Marker[]>([]);
  const onBoundsChangeRef = useRef(onBoundsChange);
  onBoundsChangeRef.current = onBoundsChange;

  const emitBounds = useCallback((map: L.Map) => {
    if (!onBoundsChangeRef.current) return;
    const b = map.getBounds();
    onBoundsChangeRef.current({
      north: b.getNorth(),
      south: b.getSouth(),
      east: b.getEast(),
      west: b.getWest(),
    });
  }, []);

  useEffect(() => {
    if (!mapRef.current || mapInstanceRef.current) return;

    const defaultCenter: [number, number] = center || [30, 10];
    const map = L.map(mapRef.current, {
      center: defaultCenter,
      zoom,
      zoomControl: true,
      scrollWheelZoom: interactive,
      dragging: interactive,
      minZoom,
      maxBoundsViscosity: 1.0,
    });

    map.setMaxBounds([[-85, -180], [85, 180]]);

    L.tileLayer(getOsmTileUrl(), {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
      maxZoom: 19,
      noWrap: true,
    }).addTo(map);

    if (onBoundsChangeRef.current) {
      map.on('moveend', () => emitBounds(map));
      map.on('zoomend', () => emitBounds(map));
      setTimeout(() => emitBounds(map), 300);
    }

    mapInstanceRef.current = map;

    return () => {
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map) return;

    markersRef.current.forEach((m) => m.remove());
    markersRef.current = [];

    routes.forEach((route) => {
      if (route.latitude && route.longitude) {
        const marker = L.marker([route.latitude, route.longitude], { icon: customIcon })
          .addTo(map)
          .bindPopup(
            `<div style="min-width:160px;font-family:Inter,sans-serif;">
              <strong style="font-size:13px;">${route.title}</strong><br/>
              <span style="color:#6B7280;font-size:12px;">${route.location_string}</span><br/>
              <span style="color:hsl(142,37%,28%);font-weight:600;font-size:14px;">$${route.price.toFixed(2)}</span><br/>
              <span style="font-size:11px;color:#999;">${route.category_name}</span>
            </div>`
          );
        marker.on('click', () => marker.openPopup());
        marker.on('popupopen', () => {
          const popupEl = marker.getPopup()?.getElement();
          if (popupEl) {
            popupEl.style.cursor = 'pointer';
            popupEl.onclick = () => onRouteClick(route.id);
          }
        });
        markersRef.current.push(marker);
      }
    });
  }, [routes, onRouteClick]);

  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map || !center) return;
    map.setView(center, zoom);
  }, [center, zoom]);

  return <div ref={mapRef} className="w-full h-full" />;
}
