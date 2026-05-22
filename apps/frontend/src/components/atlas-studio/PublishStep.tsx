import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { 
  CheckCircle2, 
  Map, 
  Download, 
  Share2, 
  ExternalLink,
  Shield,
  Sparkles
} from 'lucide-react';
import { Project } from '@/types/atlas-types';

interface PublishStepProps {
  project: Project;
  onViewPublic: () => void;
}

export function PublishStep({
  project,
  onViewPublic
}: PublishStepProps) {
  return (
    <Card className="border-emerald-500/20 bg-emerald-500/[0.02]">
      <CardContent className="p-8 text-center max-w-2xl mx-auto">
        <div className="w-20 h-20 rounded-full bg-emerald-500/10 flex items-center justify-center mx-auto mb-6">
          <CheckCircle2 className="w-10 h-10 text-emerald-500" />
        </div>
        
        <h2 className="text-3xl font-bold mb-3">Trasa Gotowa!</h2>
        <p className="text-muted-foreground mb-8 text-lg">
          Gratulacje! Twoja trasa <span className="text-foreground font-semibold">"{project.title}"</span> została pomyślnie opracowana przez Magic AI i jest gotowa do publikacji na Marketplace.
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-8">
          <div className="p-4 rounded-xl border bg-background flex flex-col items-center text-center">
            <Shield className="w-6 h-6 text-primary mb-2" />
            <h3 className="font-bold text-sm">Weryfikacja AI</h3>
            <p className="text-[11px] text-muted-foreground mt-1">Trasa przeszła 12 testów jakości i zgodności.</p>
          </div>
          <div className="p-4 rounded-xl border bg-background flex flex-col items-center text-center">
            <Map className="w-6 h-6 text-primary mb-2" />
            <h3 className="font-bold text-sm">Plik GPX</h3>
            <p className="text-[11px] text-muted-foreground mt-1">Zoptymalizowany pod Garmin, Wahoo i telefony.</p>
          </div>
        </div>

        <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
          <Button size="lg" className="w-full sm:w-auto gap-2" onClick={onViewPublic}>
            <ExternalLink className="w-4 h-4" />
            Zobacz publiczną stronę
          </Button>
          <Button size="lg" variant="outline" className="w-full sm:w-auto gap-2">
            <Download className="w-4 h-4" />
            Pobierz Roadbook PDF
          </Button>
          <Button size="lg" variant="ghost" className="w-full sm:w-auto gap-2">
            <Share2 className="w-4 h-4" />
            Udostępnij
          </Button>
        </div>

        <div className="mt-12 p-4 rounded-xl border border-primary/20 bg-primary/5 flex items-start gap-4 text-left">
          <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
            <Sparkles className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h4 className="font-bold text-sm">Zarobki z tej trasy</h4>
            <p className="text-xs text-muted-foreground mt-1">
              Ta trasa jest unikalna i posiada wysoką ocenę jakości. Sugerowana cena to **5 Tokenów Odkrywcy**. Za każde pobranie otrzymasz **4 kredyty**.
            </p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
