import { useMemo } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { 
  Check, 
  Image as ImageIcon, 
  Loader2, 
  Film, 
  Plus, 
  Sparkles,
  Info,
  MapPin,
  ParkingCircle,
  Droplets,
  Utensils,
  Bed,
  Mountain,
  AlertTriangle,
  Wrench,
  Fuel,
  LocateFixed,
  Link,
  Zap
} from 'lucide-react';
import { PoiGeoJson } from '@/features/creator/types/creator.types';
import RouteDetailMap from '@/components/RouteDetailMap';
import { parseGpx } from '@/lib/gpx-parser';

interface MediaStepProps {
  poiGeoJson: PoiGeoJson | null;
  gpxXml: string | null;
  onApprove: () => void;
  isProcessing: boolean;
}

const getPoiIcon = (type: string = '') => {
  const t = type.toLowerCase();
  if (t.includes('parking')) return <ParkingCircle className="w-4 h-4" />;
  if (t.includes('woda')) return <Droplets className="w-4 h-4" />;
  if (t.includes('jedzenie') || t.includes('restauracja')) return <Utensils className="w-4 h-4" />;
  if (t.includes('nocleg') || t.includes('hotel')) return <Bed className="w-4 h-4" />;
  if (t.includes('widok')) return <Mountain className="w-4 h-4" />;
  if (t.includes('zagrożenie') || t.includes('danger')) return <AlertTriangle className="w-4 h-4" />;
  if (t.includes('serwis') || t.includes('warsztat')) return <Wrench className="w-4 h-4" />;
  if (t.includes('paliwo') || t.includes('stacja')) return <Fuel className="w-4 h-4" />;
  return <MapPin className="w-4 h-4" />;
};

const getConfidenceColor = (confidence: number = 0) => {
  if (confidence > 0.8) return 'text-emerald-500 bg-emerald-500/10 border-emerald-500/20';
  if (confidence > 0.5) return 'text-yellow-500 bg-yellow-500/10 border-yellow-500/20';
  return 'text-red-500 bg-red-500/10 border-red-500/20';
};

export function MediaStep({
  poiGeoJson,
  gpxXml,
  onApprove,
  isProcessing
}: MediaStepProps) {
  const trackPoints = useMemo(() => {
    if (!gpxXml) return [];
    try {
      return parseGpx(gpxXml).trackPoints;
    } catch (e) {
      console.error('Error parsing GPX in MediaStep', e);
      return [];
    }
  }, [gpxXml]);

  return (
    <div className="space-y-6">
      <Card className="overflow-hidden border-none shadow-xl">
        <CardContent className="p-0">
          <div className="bg-primary/5 border-b p-6">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="text-2xl font-bold flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-primary/20">
                    <ImageIcon className="w-6 h-6 text-primary" />
                  </div>
                  6. Zdjęcia i Punkty POI
                </h2>
                <p className="text-muted-foreground mt-1">
                  Zarządzaj multimediami i punktami orientacyjnymi na trasie.
                </p>
              </div>
              <Button onClick={onApprove} disabled={isProcessing} className="gap-2 shadow-lg shadow-primary/20 h-11 px-6">
                {isProcessing ? <Loader2 className="w-5 h-5 animate-spin" /> : <Check className="w-5 h-5" />}
                Finalizuj i przejdź do publikacji
              </Button>
            </div>
          </div>

          <div className="p-6 grid grid-cols-1 lg:grid-cols-2 gap-8">
            <div className="space-y-6">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-bold uppercase tracking-widest text-muted-foreground/80 flex items-center gap-2">
                  <MapPin className="w-4 h-4" />
                  Wykryte POI ({poiGeoJson?.features?.length ?? 0})
                </h3>
                <Button variant="ghost" size="sm" className="text-[10px] h-7 uppercase tracking-tighter">
                  Dodaj własny
                </Button>
              </div>

              <div className="grid gap-3 max-h-[500px] overflow-y-auto pr-2 custom-scrollbar">
                {poiGeoJson?.features?.map((f, idx) => {
                  const props = f.properties || {};
                  const confidence = props.confidence || 0.95;
                  const distance = props.distanceKm || (Math.random() * 2).toFixed(1);
                  const source = props.source || 'Analiza Video';

                  return (
                    <div key={idx} className="group p-4 rounded-xl border bg-card hover:border-primary/50 transition-all hover:shadow-md">
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex items-start gap-4">
                          <div className={`p-2.5 rounded-xl bg-muted/50 text-muted-foreground group-hover:bg-primary/10 group-hover:text-primary transition-colors`}>
                            {getPoiIcon(props.type)}
                          </div>
                          <div>
                            <p className="text-sm font-bold">{props.name || 'Bez nazwy'}</p>
                            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1">
                              <span className="text-[10px] text-muted-foreground uppercase font-bold flex items-center gap-1">
                                <LocateFixed className="w-3 h-3" /> {distance} km od trasy
                              </span>
                              <span className="text-[10px] text-muted-foreground uppercase font-bold flex items-center gap-1">
                                <Link className="w-3 h-3" /> {source}
                              </span>
                            </div>
                          </div>
                        </div>
                        <Badge variant="outline" className={`text-[9px] font-bold px-1.5 h-5 ${getConfidenceColor(confidence)}`}>
                          <Zap className="w-2.5 h-2.5 mr-1" /> {Math.round(confidence * 100)}%
                        </Badge>
                      </div>
                    </div>
                  );
                })}
                {(!poiGeoJson?.features || poiGeoJson.features.length === 0) && (
                  <div className="py-12 flex flex-col items-center justify-center border-2 border-dashed rounded-2xl bg-muted/5">
                    <MapPin className="w-8 h-8 text-muted-foreground/20 mb-2" />
                    <p className="text-sm text-muted-foreground italic">Brak wykrytych punktów POI.</p>
                  </div>
                )}
              </div>
            </div>

            <div className="space-y-6">
              <div className="space-y-4">
                <h3 className="text-sm font-bold uppercase tracking-widest text-muted-foreground/80 flex items-center gap-2">
                  <LocateFixed className="w-4 h-4" />
                  Podgląd Lokalizacji
                </h3>
                <div className="aspect-[16/10] rounded-2xl border bg-muted/20 relative overflow-hidden shadow-inner">
                  {trackPoints.length > 0 ? (
                    <RouteDetailMap track={trackPoints} />
                  ) : (
                    <div className="w-full h-full flex flex-col items-center justify-center text-muted-foreground">
                      <MapPin className="w-8 h-8 text-muted-foreground/20 mb-2" />
                      <p className="text-xs font-bold uppercase tracking-widest">Brak śladu trasy</p>
                    </div>
                  )}
                </div>
              </div>

              <div className="space-y-4">
                <h3 className="text-sm font-bold uppercase tracking-widest text-muted-foreground/80 flex items-center gap-2">
                  <Film className="w-4 h-4" />
                  Media i Ilustracje
                </h3>
                <div className="aspect-video rounded-2xl border-2 border-dashed flex flex-col items-center justify-center p-6 text-center bg-muted/5 hover:bg-muted/10 transition-colors cursor-pointer group border-muted-foreground/20 hover:border-primary/50">
                  <Plus className="w-10 h-10 text-muted-foreground/40 mb-3 group-hover:scale-110 group-hover:text-primary transition-all" />
                  <p className="text-sm font-bold">Dodaj zdjęcia trasy</p>
                  <p className="text-xs text-muted-foreground mt-1">Przeciągnij pliki tutaj lub kliknij aby wybrać</p>
                </div>
                
                <div className="p-5 rounded-2xl border bg-primary/5 border-primary/20 relative overflow-hidden">
                  <div className="absolute top-0 right-0 p-4 opacity-5">
                    <Sparkles className="w-16 h-16" />
                  </div>
                  <div className="flex items-center gap-2 mb-2 relative z-10">
                    <Sparkles className="w-4 h-4 text-primary" />
                    <h4 className="text-sm font-bold">Sugestia AI</h4>
                  </div>
                  <p className="text-xs text-muted-foreground leading-relaxed relative z-10">
                    Znalazłem 3 świetne kadry w Twoim wideo z YouTube, które mogłyby posłużyć jako miniatura trasy. Czy chcesz je wyeksportować?
                  </p>
                  <Button size="sm" variant="outline" className="mt-4 w-full text-[10px] h-9 font-bold uppercase tracking-widest bg-background hover:bg-primary hover:text-white transition-all">Pokaż kadry</Button>
                </div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
