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
  AlertTriangle
} from 'lucide-react';
import ReactMarkdown from 'react-markdown';

interface ConceptReviewStepProps {
  concept: string;
  onApprove: () => void;
  isProcessing: boolean;
}

export function ConceptReviewStep({
  concept,
  onApprove,
  isProcessing
}: ConceptReviewStepProps) {
  return (
    <Card>
      <CardContent className="p-5">
        <div className="flex items-start justify-between gap-4 mb-6">
          <div>
            <h2 className="text-lg font-semibold flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-primary" />
              4. Koncepcja Trasy (Master Blueprint)
            </h2>
            <p className="text-sm text-muted-foreground">
              Zweryfikuj ogólną wizję, grupę docelową i strukturę trasy zaproponowaną przez AI.
            </p>
          </div>
          <Button onClick={onApprove} disabled={isProcessing} className="gap-2">
            {isProcessing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
            Zatwierdź koncepcję
          </Button>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 prose dark:prose-invert max-w-none p-6 rounded-xl border bg-muted/10 max-h-[600px] overflow-y-auto">
            {concept ? (
              <ReactMarkdown>{concept}</ReactMarkdown>
            ) : (
              <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
                <FileText className="w-12 h-12 mb-4 opacity-20" />
                <p>Koncepcja trasy jest generowana...</p>
              </div>
            )}
          </div>

          <div className="space-y-4">
            <div className="p-4 rounded-xl border bg-card space-y-3">
              <h3 className="text-sm font-bold flex items-center gap-2 uppercase tracking-wider text-muted-foreground">
                <Target className="w-4 h-4 text-primary" />
                Cele strategiczne
              </h3>
              <ul className="text-xs space-y-2">
                <li className="flex items-start gap-2">
                  <div className="w-1.5 h-1.5 rounded-full bg-primary mt-1.5 shrink-0" />
                  <span>Unikalne doświadczenie podróżnicze.</span>
                </li>
                <li className="flex items-start gap-2">
                  <div className="w-1.5 h-1.5 rounded-full bg-primary mt-1.5 shrink-0" />
                  <span>Optymalizacja logistyki i bezpieczeństwa.</span>
                </li>
              </ul>
            </div>

            <div className="p-4 rounded-xl border border-yellow-500/20 bg-yellow-500/5 space-y-3">
              <h3 className="text-sm font-bold flex items-center gap-2 text-yellow-600 dark:text-yellow-400">
                <AlertTriangle className="w-4 h-4" />
                Do sprawdzenia
              </h3>
              <p className="text-[11px] text-muted-foreground leading-relaxed">
                Upewnij się, że AI poprawnie zrozumiało styl trasy (np. czy nie zaproponowało zbyt trudnych odcinków dla danej grupy).
              </p>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
