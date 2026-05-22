import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { 
  Check, 
  Pencil, 
  Loader2, 
  FileText, 
  Eye,
  BookOpen
} from 'lucide-react';
import ReactMarkdown from 'react-markdown';

interface GuideFinalStepProps {
  guide: string;
  onApprove: () => void;
  isProcessing: boolean;
}

export function GuideFinalStep({
  guide,
  onApprove,
  isProcessing
}: GuideFinalStepProps) {
  return (
    <Card>
      <CardContent className="p-5">
        <div className="flex items-start justify-between gap-4 mb-6">
          <div>
            <h2 className="text-lg font-semibold flex items-center gap-2">
              <Pencil className="w-5 h-5 text-primary" />
              5. Pełny Przewodnik AI
            </h2>
            <p className="text-sm text-muted-foreground">
              Przeczytaj i zweryfikuj wygenerowany opis trasy. Możesz go później edytować.
            </p>
          </div>
          <Button onClick={onApprove} disabled={isProcessing} className="gap-2">
            {isProcessing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
            Zatwierdź treść przewodnika
          </Button>
        </div>

        <div className="rounded-xl border bg-muted/20 overflow-hidden">
          <div className="bg-muted/40 px-4 py-2 border-b flex items-center justify-between">
            <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground uppercase tracking-wider">
              <Eye className="w-3.5 h-3.5" />
              Podgląd treści
            </div>
            <Badge variant="outline" className="text-[10px] bg-background">Markdown Ready</Badge>
          </div>
          <div className="p-6 max-h-[600px] overflow-y-auto prose dark:prose-invert max-w-none prose-sm sm:prose-base">
            {guide ? (
              <ReactMarkdown>{guide}</ReactMarkdown>
            ) : (
              <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
                <BookOpen className="w-12 h-12 mb-4 opacity-20" />
                <p>Treść przewodnika jest w trakcie generowania...</p>
              </div>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
