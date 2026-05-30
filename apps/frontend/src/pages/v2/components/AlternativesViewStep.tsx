import { lazy, Suspense } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Sparkles, Check, Loader2, CheckCircle2, CornerDownRight, Map as MapIcon, BadgeAlert } from 'lucide-react';
import { Badge } from '@/components/ui/badge';

const RouteDetailMap = lazy(() => import('@/components/RouteDetailMap'));

interface AlternativesViewStepProps {
  alternatives: {
    id: string;
    name: string;
    color: string;
    distance_km: number;
    duration_h: number;
    track: [number, number][];
    pois?: { name: string; lat: number; lng: number }[];
  }[];
  selectedAlternativeId: string | null;
  onSelectAlternative: (id: string) => void;
  trackPoints: [number, number][] | null;
  places: { name: string; lat: number; lng: number }[] | null;
  showMap: boolean;
  onApproveAlternative: () => void;
  onReset: () => void;
  loading: boolean;
}

export default function AlternativesViewStep({
  alternatives,
  selectedAlternativeId,
  onSelectAlternative,
  trackPoints,
  places,
  showMap,
  onApproveAlternative,
  onReset,
  loading
}: AlternativesViewStepProps) {

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 animate-in fade-in duration-300">
      
      {/* Alternatives Sidebar */}
      <div className="lg:col-span-4 space-y-6 flex flex-col">
        <Card className="bg-zinc-950 border-zinc-800 shadow-xl flex-grow">
          <CardHeader className="border-b border-zinc-800 pb-4">
            <div className="flex items-center justify-between">
              <CardTitle className="text-lg flex items-center gap-2">
                <Sparkles className="text-cyan-400 animate-pulse h-5 w-5" /> Wybierz wariant trasy
              </CardTitle>
              <Badge className="bg-cyan-950 text-cyan-400 border border-cyan-800/40 text-[10px] flex items-center gap-1 font-mono">
                <BadgeAlert className="h-3 w-3" /> Warianty trasy
              </Badge>
            </div>
            <CardDescription className="text-zinc-400">
              AI przygotowało 3 warianty zmian. Wybierz najlepszy:
            </CardDescription>
          </CardHeader>
          <CardContent className="pt-6 space-y-4">
            
            {/* 3 cards of alternatives */}
            <div className="space-y-3">
              {alternatives.map((alt) => {
                const isSelected = selectedAlternativeId === alt.id;
                return (
                  <div 
                    key={alt.id}
                    onClick={() => onSelectAlternative(alt.id)}
                    className={`p-4 rounded-xl border cursor-pointer transition-all ${
                      isSelected 
                        ? 'border-cyan-500 bg-cyan-500/10 shadow-lg shadow-cyan-950/10' 
                        : 'border-zinc-800/80 bg-zinc-900/10 hover:bg-zinc-900/40 text-zinc-400'
                    }`}
                  >
                    <div className="flex items-center gap-2 justify-between">
                      <div className="flex items-center gap-2">
                        <span 
                          className="h-3.5 w-3.5 rounded-full inline-block" 
                          style={{ backgroundColor: alt.color }} 
                        />
                        <h4 className={`font-bold text-sm ${isSelected ? 'text-cyan-300' : 'text-zinc-200'}`}>
                          {alt.name}
                        </h4>
                      </div>
                      {isSelected && <CheckCircle2 className="h-4.5 w-4.5 text-cyan-400 flex-shrink-0" />}
                    </div>
                    
                    <div className="grid grid-cols-2 gap-2 mt-3 text-[11px] leading-tight">
                      <div className="bg-zinc-900/80 p-2 rounded">
                        <span className="text-zinc-500 block">Dystans</span>
                        <span className="font-bold text-zinc-300 text-xs">{alt.distance_km} km</span>
                      </div>
                      <div className="bg-zinc-900/80 p-2 rounded">
                        <span className="text-zinc-500 block">Czas szac.</span>
                        <span className="font-bold text-zinc-300 text-xs">{alt.duration_h} h</span>
                      </div>
                    </div>

                    {alt.pois && alt.pois.length > 0 && (
                      <div className="mt-2 text-[10px] text-zinc-500 flex items-center gap-1">
                        <CornerDownRight className="h-3 w-3 text-cyan-500" />
                        Dodano {alt.pois.length} punkty POI (widoki, punkty stop)
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            <div className="pt-4 space-y-2 border-t border-zinc-900">
              <Button 
                onClick={onApproveAlternative} 
                disabled={loading || !selectedAlternativeId}
                className="w-full bg-cyan-600 hover:bg-cyan-700 text-white font-semibold flex items-center justify-center gap-2 py-5"
              >
                {loading ? <Loader2 className="animate-spin h-4 w-4" /> : <Check className="h-4.5 w-4.5" />}
                Zatwierdź wybrany wariant
              </Button>
              <Button onClick={onReset} variant="outline" className="w-full border-zinc-800 text-zinc-400" disabled={loading}>
                Stwórz od nowa
              </Button>
            </div>

          </CardContent>
        </Card>
      </div>

      {/* Leaflet Map Preview */}
      <div className="lg:col-span-8 flex flex-col h-[500px]">
        <Card className="h-full overflow-hidden border border-zinc-800 shadow-2xl relative rounded-2xl">
          {showMap && trackPoints ? (
            <Suspense fallback={<div className="w-full h-full flex items-center justify-center bg-zinc-950"><Loader2 className="animate-spin text-cyan-400" /></div>}>
              <RouteDetailMap 
                track={trackPoints} 
                places={places} 
                alternatives={alternatives}
                selectedAlternativeId={selectedAlternativeId}
                onSelectAlternative={onSelectAlternative}
                className="w-full h-full min-h-[500px]" 
              />
            </Suspense>
          ) : (
            <div className="w-full h-full flex flex-col items-center justify-center bg-zinc-950 text-zinc-500 space-y-4">
              <MapIcon className="h-12 w-12 opacity-20 animate-pulse" />
              <p className="text-sm font-semibold uppercase tracking-widest">Podgląd mapy wczytuje się...</p>
            </div>
          )}
        </Card>
      </div>

    </div>
  );
}
