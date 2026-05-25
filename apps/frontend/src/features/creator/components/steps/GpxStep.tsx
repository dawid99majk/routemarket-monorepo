import { useState, useMemo } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { 
  Check, 
  Map, 
  Loader2, 
  RefreshCw, 
  Compass, 
  CloudRain, 
  Info,
  AlertTriangle 
} from 'lucide-react';
import RouteTerrain3D from '@/components/RouteTerrain3D';
import RouteDetailMap from '@/components/RouteDetailMap';
import { parseGpx } from '@/lib/gpx-parser';

interface GpxStepProps {
  gpxXml: string;
  onApprove: () => void;
  isProcessing: boolean;
}

export function GpxStep({
  gpxXml,
  onApprove,
  isProcessing
}: GpxStepProps) {
  const [viewMode, setViewMode] = useState<'3d' | '2d'>('3d');

  // Parse GPX safely with useMemo
  const { trackPoints, distance, elevation, error } = useMemo(() => {
    try {
      if (!gpxXml) {
        throw new Error('Pusty plik GPX.');
      }
      const parsed = parseGpx(gpxXml);
      return {
        trackPoints: parsed.trackPoints,
        distance: parsed.distance_km,
        elevation: parsed.elevation_gain_m,
        error: null
      };
    } catch (err) {
      console.error('Błąd parsowania GPX w GpxStep:', err);
      return {
        trackPoints: [] as [number, number][],
        distance: null,
        elevation: null,
        error: err instanceof Error ? err.message : 'Niepoprawny format pliku GPX'
      };
    }
  }, [gpxXml]);

  return (
    <div className="space-y-6">
      <Card>
        <CardContent className="p-5">
          <div className="flex items-start justify-between gap-4 mb-6">
            <div>
              <h2 className="text-lg font-semibold flex items-center gap-2">
                <Map className="w-5 h-5 text-primary" />
                4. Przegląd GPX i Mapa 3D
              </h2>
              <p className="text-sm text-muted-foreground">
                Zweryfikuj przebieg trasy wygenerowany przez AI na podstawie Twoich materiałów.
              </p>
            </div>
            <Button onClick={onApprove} disabled={isProcessing || !!error} className="gap-2">
              {isProcessing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
              Zatwierdź przebieg trasy
            </Button>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2 aspect-[16/10] min-h-[400px] bg-muted rounded-xl overflow-hidden border relative">
              <div className="absolute top-4 left-4 z-10 flex gap-2">
                <Button 
                  size="sm" 
                  variant={viewMode === '3d' ? 'default' : 'secondary'} 
                  onClick={() => setViewMode('3d')}
                  disabled={!!error}
                  className="shadow-md"
                >
                  Widok 3D
                </Button>
                <Button 
                  size="sm" 
                  variant={viewMode === '2d' ? 'default' : 'secondary'} 
                  onClick={() => setViewMode('2d')}
                  disabled={!!error}
                  className="shadow-md"
                >
                  Widok 2D
                </Button>
              </div>
              
              {error ? (
                <div className="w-full h-full flex flex-col items-center justify-center text-muted-foreground p-6 text-center">
                  <AlertTriangle className="w-8 h-8 text-amber-500 mb-2 animate-pulse" />
                  <p className="font-semibold text-foreground text-sm">Nie udało się wyświetlić mapy 3D</p>
                  <p className="text-xs max-w-md mt-1">{error}</p>
                </div>
              ) : viewMode === '3d' ? (
                <RouteTerrain3D track={trackPoints} />
              ) : (
                <RouteDetailMap track={trackPoints} />
              )}
            </div>

            <div className="space-y-4">
              <div className="p-4 rounded-xl border bg-card space-y-3">
                <h3 className="text-sm font-bold flex items-center gap-2">
                  <Compass className="w-4 h-4 text-primary" />
                  Statystyki trasy
                </h3>
                <div className="grid grid-cols-2 gap-3 text-xs">
                  <div className="p-2 rounded bg-muted/50 border">
                    <span className="text-muted-foreground block mb-1">Dystans</span>
                    <span className="font-mono font-bold text-base text-foreground">
                      {distance !== null ? `${distance} km` : '--'}
                    </span>
                  </div>
                  <div className="p-2 rounded bg-muted/50 border">
                    <span className="text-muted-foreground block mb-1">Przewyższenie</span>
                    <span className="font-mono font-bold text-base text-foreground">
                      {elevation !== null ? `${elevation} m` : '--'}
                    </span>
                  </div>
                </div>
              </div>

              <div className="p-4 rounded-xl border bg-primary/5 border-primary/20 space-y-3">
                <h3 className="text-sm font-bold flex items-center gap-2">
                  <Info className="w-4 h-4 text-primary" />
                  Weryfikacja AI
                </h3>
                <ul className="text-xs space-y-2 text-muted-foreground">
                  <li className="flex items-start gap-2">
                    <Check className="w-3.5 h-3.5 text-emerald-500 mt-0.5 shrink-0" />
                    Brak skoków dystansu i błędów GPS.
                  </li>
                  <li className="flex items-start gap-2">
                    <Check className="w-3.5 h-3.5 text-emerald-500 mt-0.5 shrink-0" />
                    Początek i koniec są w logicznych miejscach.
                  </li>
                </ul>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
