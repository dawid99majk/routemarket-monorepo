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
  Info
} from 'lucide-react';
import { PoiGeoJson } from '@/types/atlas-types';

interface MediaStepProps {
  poiGeoJson: PoiGeoJson | null;
  onApprove: () => void;
  isProcessing: boolean;
}

export function MediaStep({
  poiGeoJson,
  onApprove,
  isProcessing
}: MediaStepProps) {
  return (
    <div className="space-y-6">
      <Card>
        <CardContent className="p-5">
          <div className="flex items-start justify-between gap-4 mb-6">
            <div>
              <h2 className="text-lg font-semibold flex items-center gap-2">
                <ImageIcon className="w-5 h-5 text-primary" />
                6. Zdjęcia i Punkty POI
              </h2>
              <p className="text-sm text-muted-foreground">
                Zarządzaj multimediami i punktami orientacyjnymi na trasie.
              </p>
            </div>
            <Button onClick={onApprove} disabled={isProcessing} className="gap-2">
              {isProcessing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
              Finalizuj i przejdź do publikacji
            </Button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-4">
              <h3 className="text-sm font-bold uppercase tracking-wider text-muted-foreground">Wykryte POI ({poiGeoJson?.features?.length ?? 0})</h3>
              <div className="grid gap-3">
                {poiGeoJson?.features?.map((f, idx) => (
                  <div key={idx} className="p-3 rounded-lg border bg-muted/30 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold text-xs">
                        {idx + 1}
                      </div>
                      <div>
                        <p className="text-sm font-medium">{f.properties?.name || 'Bez nazwy'}</p>
                        <p className="text-[10px] text-muted-foreground uppercase">{f.properties?.type || 'miejsce'}</p>
                      </div>
                    </div>
                  </div>
                ))}
                {(!poiGeoJson?.features || poiGeoJson.features.length === 0) && (
                  <p className="text-sm text-muted-foreground italic">Brak wykrytych punktów POI.</p>
                )}
              </div>
            </div>

            <div className="space-y-4">
              <h3 className="text-sm font-bold uppercase tracking-wider text-muted-foreground">Media i Ilustracje</h3>
              <div className="aspect-square sm:aspect-video rounded-xl border-2 border-dashed flex flex-col items-center justify-center p-6 text-center bg-muted/10 hover:bg-muted/20 transition-colors cursor-pointer group">
                <Plus className="w-10 h-10 text-muted-foreground mb-3 group-hover:scale-110 transition-transform" />
                <p className="text-sm font-medium">Dodaj zdjęcia trasy</p>
                <p className="text-xs text-muted-foreground mt-1">Przeciągnij pliki tutaj lub kliknij aby wybrać</p>
              </div>
              
              <div className="p-4 rounded-xl border bg-primary/5 border-primary/20">
                <div className="flex items-center gap-2 mb-2">
                  <Sparkles className="w-4 h-4 text-primary" />
                  <h4 className="text-sm font-bold">Sugestia AI</h4>
                </div>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  Znalazłem 3 świetne kadry w Twoim wideo z YouTube, które mogłyby posłużyć jako miniatura trasy. Czy chcesz je wyeksportować?
                </p>
                <Button size="sm" variant="outline" className="mt-3 w-full text-[10px] h-8">Pokaż kadry</Button>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
