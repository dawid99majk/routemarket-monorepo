import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { 
  Check, 
  List, 
  Loader2, 
  FileText,
  Pencil,
  ArrowDown
} from 'lucide-react';
import ReactMarkdown from 'react-markdown';

interface GuideOutlineStepProps {
  outline: string;
  onApprove: () => void;
  isProcessing: boolean;
}

export function GuideOutlineStep({
  outline,
  onApprove,
  isProcessing
}: GuideOutlineStepProps) {
  return (
    <Card>
      <CardContent className="p-5">
        <div className="flex items-start justify-between gap-4 mb-6">
          <div>
            <h2 className="text-lg font-semibold flex items-center gap-2">
              <List className="w-5 h-5 text-primary" />
              5. Konspekt Przewodnika
            </h2>
            <p className="text-sm text-muted-foreground">
              Zatwierdź strukturę rozdziałów przed wygenerowaniem pełnej treści przewodnika.
            </p>
          </div>
          <Button onClick={onApprove} disabled={isProcessing} className="gap-2">
            {isProcessing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
            Zatwierdź konspekt
          </Button>
        </div>

        <div className="rounded-xl border bg-muted/20 p-6">
          {outline ? (
            <div className="prose dark:prose-invert max-w-none">
              <ReactMarkdown>{outline}</ReactMarkdown>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
              <FileText className="w-12 h-12 mb-4 opacity-20" />
              <p>Struktura przewodnika jest generowana...</p>
            </div>
          )}
        </div>

        <div className="mt-8 flex flex-col items-center gap-4 text-center">
          <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
            <ArrowDown className="w-4 h-4 text-primary animate-bounce" />
          </div>
          <p className="text-xs text-muted-foreground max-w-md">
            Po zatwierdzeniu tego kroku, AI przystąpi do pisania pełnych treści dla każdego z powyższych punktów, integrując zweryfikowane fakty i źródła.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
