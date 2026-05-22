import { useEffect, useRef, useState } from 'react';

export interface GeoPosition {
  lat: number;
  lng: number;
  accuracy: number;
  heading: number | null;
  speed: number | null;
  timestamp: number;
}

export interface UseGeolocationResult {
  position: GeoPosition | null;
  error: string | null;
  permissionState: PermissionState | 'unsupported' | 'unknown';
  isWatching: boolean;
}

interface Options {
  enabled?: boolean;
  enableHighAccuracy?: boolean;
}

export function useGeolocation({ enabled = true, enableHighAccuracy = true }: Options = {}): UseGeolocationResult {
  const [position, setPosition] = useState<GeoPosition | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [permissionState, setPermissionState] = useState<PermissionState | 'unsupported' | 'unknown'>('unknown');
  const [isWatching, setIsWatching] = useState(false);
  const watchIdRef = useRef<number | null>(null);

  useEffect(() => {
    if (!('geolocation' in navigator)) {
      setPermissionState('unsupported');
      setError('Geolokalizacja nie jest dostępna w tej przeglądarce');
      return;
    }

    // Best-effort permission check
    if ('permissions' in navigator) {
      navigator.permissions
        .query({ name: 'geolocation' as PermissionName })
        .then((status) => {
          setPermissionState(status.state);
          status.onchange = () => setPermissionState(status.state);
        })
        .catch(() => setPermissionState('unknown'));
    }

    if (!enabled) return;

    setIsWatching(true);
    const id = navigator.geolocation.watchPosition(
      (pos) => {
        setPosition({
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          accuracy: pos.coords.accuracy,
          heading: pos.coords.heading,
          speed: pos.coords.speed,
          timestamp: pos.timestamp,
        });
        setError(null);
      },
      (err) => {
        setError(err.message);
        setIsWatching(false);
      },
      {
        enableHighAccuracy,
        maximumAge: 2000,
        timeout: 15000,
      },
    );
    watchIdRef.current = id;

    return () => {
      if (watchIdRef.current !== null) {
        navigator.geolocation.clearWatch(watchIdRef.current);
        watchIdRef.current = null;
      }
      setIsWatching(false);
    };
  }, [enabled, enableHighAccuracy]);

  return { position, error, permissionState, isWatching };
}
