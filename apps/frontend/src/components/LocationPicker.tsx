import { useEffect, useRef, useCallback, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

interface LocationPickerProps {
  latitude: number;
  longitude: number;
  onLocationChange: (lat: number, lng: number) => void;
  trackPoints?: [number, number][];
  zoom?: number;
}

export default function LocationPicker({ latitude, longitude, onLocationChange, trackPoints, zoom = 4 }: LocationPickerProps) {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const markerRef = useRef<L.Marker | null>(null);
  const polylineRef = useRef<L.Polyline | null>(null);
  const onLocationChangeRef = useRef(onLocationChange);
  onLocationChangeRef.current = onLocationChange;

  useEffect(() => {
    if (!mapRef.current || mapInstanceRef.current) return;

    const map = L.map(mapRef.current, {
      center: [latitude || 48, longitude || 15],
      zoom: latitude ? 10 : zoom,
      zoomControl: true,
    });

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; OpenStreetMap',
      maxZoom: 19,
    }).addTo(map);

    // Place marker
    const marker = L.marker([latitude || 48, longitude || 15], { draggable: true }).addTo(map);
    marker.on('dragend', () => {
      const pos = marker.getLatLng();
      onLocationChangeRef.current(pos.lat, pos.lng);
    });
    markerRef.current = marker;

    // Click to move marker
    map.on('click', (e: L.LeafletMouseEvent) => {
      marker.setLatLng(e.latlng);
      onLocationChangeRef.current(e.latlng.lat, e.latlng.lng);
    });

    mapInstanceRef.current = map;

    return () => {
      map.remove();
      mapInstanceRef.current = null;
    };
  }, []);

  // Update marker position when lat/lng changes externally
  useEffect(() => {
    const map = mapInstanceRef.current;
    const marker = markerRef.current;
    if (!map || !marker || (!latitude && !longitude)) return;
    marker.setLatLng([latitude, longitude]);
    map.setView([latitude, longitude], Math.max(map.getZoom(), 10));
  }, [latitude, longitude]);

  // Draw track polyline
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map) return;

    if (polylineRef.current) {
      polylineRef.current.remove();
      polylineRef.current = null;
    }

    if (trackPoints && trackPoints.length > 1) {
      const polyline = L.polyline(trackPoints, {
        color: 'hsl(142, 37%, 28%)',
        weight: 3,
        opacity: 0.8,
      }).addTo(map);
      polylineRef.current = polyline;
      map.fitBounds(polyline.getBounds(), { padding: [30, 30] });
    }
  }, [trackPoints]);

  return <div ref={mapRef} className="w-full h-full rounded-lg" />;
}
