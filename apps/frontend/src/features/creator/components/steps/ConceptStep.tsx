import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { 
  Check, 
  FileText, 
  Loader2, 
  Sparkles,
  Target,
  Compass,
  AlertTriangle,
  Timer,
  CloudSun,
  Mountain,
  Users,
  Map,
  MessageSquare
} from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import { toast } from 'sonner';

interface ConceptStepProps {
  concept: string;
  onApprove: () => void;
  isProcessing: boolean;
}

export function ConceptStep({
  concept,
  onApprove,
  isProcessing
}: ConceptStepProps) {
  const feedbackOptions = [
    "bardziej dziko", 
    "więcej asfaltu", 
    "mniej ludzi", 
    "więcej widoków", 
    "bardziej premium", 
    "bardziej adventure"
  ];

  const handleFeedback = (option: string) => {
    toast.success(`Zgłoszono korektę: ${option}. AI dostosuje koncepcję.`);
    console.log(`Feedback: ${option}`);
  };

  return (
    <Card className="overflow-hidden border-none shadow-xl bg-gradient-to-b from-card to-background">
      <CardContent className="p-0">
        <div className="bg-primary/5 border-b p-6">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="text-2xl font-bold flex items-center gap-3">
                <div className="p-2 rounded-lg bg-primary/20">
                  <Sparkles className="w-6 h-6 text-primary" />
                </div>
                4. Koncepcja Trasy (Master Blueprint)
              </h2>
              <p className="text-muted-foreground mt-1">
                Zweryfikuj ogólną wizję, grupę docelową i strukturę trasy zaproponowaną przez AI.
              </p>
            </div>
            <Button onClick={onApprove} disabled={isProcessing} className="gap-2 shadow-lg shadow-primary/20 h-11 px-6">
              {isProcessing ? <Loader2 className="w-5 h-5 animate-spin" /> : <Check className="w-5 h-5" />}
              Zatwierdź koncepcję
            </Button>
          </div>
        </div>

        <div className="p-6 grid grid-cols-1 lg:grid-cols-4 gap-8">
          <div className="lg:col-span-3 space-y-6">
            <div className="prose dark:prose-invert max-w-none p-8 rounded-2xl border bg-card/50 shadow-inner max-h-[600px] overflow-y-auto custom-scrollbar relative">
              <div className="absolute top-4 right-4 opacity-10">
                <FileText className="w-24 h-24" />
              </div>
              {concept ? (
                <ReactMarkdown>{concept}</ReactMarkdown>
              ) : (
                <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
                  <Loader2 className="w-12 h-12 mb-4 animate-spin opacity-20" />
                  <p>Koncepcja trasy jest generowana przez AI...</p>
                </div>
              )}
            </div>

            <div className="space-y-4">
              <h3 className="text-sm font-bold flex items-center gap-2 uppercase tracking-widest text-muted-foreground/80">
                <MessageSquare className="w-4 h-4" />
                Dostosuj koncepcję (Feedback)
              </h3>
              <div className="flex flex-wrap gap-2">
                {feedbackOptions.map((option) => (
                  <Button 
                    key={option} 
                    variant="outline" 
                    size="sm" 
                    className="rounded-full bg-background hover:bg-primary/5 hover:text-primary hover:border-primary/50 transition-all"
                    onClick={() => handleFeedback(option)}
                  >
                    {option}
                  </Button>
                ))}
              </div>
            </div>
          </div>

          <div className="space-y-6">
            <div className="p-5 rounded-2xl border bg-card shadow-sm space-y-4">
              <h3 className="text-xs font-bold flex items-center gap-2 uppercase tracking-widest text-muted-foreground">
                <Compass className="w-4 h-4 text-primary" />
                Parametry Wyprawy
              </h3>
              
              <div className="grid gap-4">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-blue-500/10 text-blue-600 dark:text-blue-400">
                    <Compass className="w-4 h-4" />
                  </div>
                  <div>
                    <p className="text-[10px] text-muted-foreground uppercase font-bold">Styl</p>
                    <p className="text-sm font-medium italic">Adventure / Discovery</p>
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-orange-500/10 text-orange-600 dark:text-orange-400">
                    <Timer className="w-4 h-4" />
                  </div>
                  <div>
                    <p className="text-[10px] text-muted-foreground uppercase font-bold">Pacing</p>
                    <p className="text-sm font-medium italic">Zrównoważony</p>
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-yellow-500/10 text-yellow-600 dark:text-yellow-400">
                    <CloudSun className="w-4 h-4" />
                  </div>
                  <div>
                    <p className="text-[10px] text-muted-foreground uppercase font-bold">Klimat</p>
                    <p className="text-sm font-medium italic">Lokalny koloryt, dzikość</p>
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-red-500/10 text-red-600 dark:text-red-400">
                    <Mountain className="w-4 h-4" />
                  </div>
                  <div>
                    <p className="text-[10px] text-muted-foreground uppercase font-bold">Trudność</p>
                    <Badge variant="outline" className="text-[10px] py-0 border-red-500/30 text-red-500">Średnio-trudna</Badge>
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-purple-500/10 text-purple-600 dark:text-purple-400">
                    <Users className="w-4 h-4" />
                  </div>
                  <div>
                    <p className="text-[10px] text-muted-foreground uppercase font-bold">Grupa docelowa</p>
                    <p className="text-sm font-medium italic">Doświadczeni podróżnicy</p>
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
                    <Map className="w-4 h-4" />
                  </div>
                  <div>
                    <p className="text-[10px] text-muted-foreground uppercase font-bold">Etapy</p>
                    <p className="text-sm font-medium italic">250-350 km / dzień</p>
                  </div>
                </div>
              </div>
            </div>

            <div className="p-5 rounded-2xl border bg-card shadow-sm space-y-4">
              <h3 className="text-xs font-bold flex items-center gap-2 uppercase tracking-widest text-muted-foreground">
                <Target className="w-4 h-4 text-primary" />
                Cele strategiczne
              </h3>
              <ul className="text-xs space-y-3">
                <li className="flex items-start gap-3 p-2 rounded-lg bg-primary/5 border border-primary/10">
                  <div className="w-1.5 h-1.5 rounded-full bg-primary mt-1.5 shrink-0" />
                  <span className="leading-relaxed">Stworzenie unikalnego doświadczenia opartego na Twoich źródłach.</span>
                </li>
                <li className="flex items-start gap-3 p-2 rounded-lg bg-primary/5 border border-primary/10">
                  <div className="w-1.5 h-1.5 rounded-full bg-primary mt-1.5 shrink-0" />
                  <span className="leading-relaxed">Optymalizacja logistyki i punktów tankowania/noclegu.</span>
                </li>
              </ul>
            </div>

            <div className="p-5 rounded-2xl border border-yellow-500/20 bg-yellow-500/5 space-y-3">
              <h3 className="text-xs font-bold flex items-center gap-2 text-yellow-600 dark:text-yellow-400 uppercase tracking-widest">
                <AlertTriangle className="w-4 h-4" />
                Do sprawdzenia
              </h3>
              <p className="text-[11px] text-muted-foreground leading-relaxed">
                Upewnij się, że AI poprawnie zrozumiało styl trasy. Jeśli coś się nie zgadza, użyj przycisków feedbacku powyżej.
              </p>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
