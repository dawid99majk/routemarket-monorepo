import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { 
  Check, 
  X, 
  Shield, 
  Info, 
  AlertTriangle,
  Loader2,
  Pencil
} from 'lucide-react';

interface Claim {
  id?: string;
  claim: string;
  type: string;
  status: string;
  confidence?: number;
  sources: string[];
}

interface ClaimsReviewStepProps {
  claims: Claim[];
  onApprove: () => void;
  isProcessing: boolean;
}

export function ClaimsReviewStep({
  claims,
  onApprove,
  isProcessing
}: ClaimsReviewStepProps) {
  return (
    <Card>
      <CardContent className="p-5">
        <div className="flex items-start justify-between gap-4 mb-6">
          <div>
            <h2 className="text-lg font-semibold flex items-center gap-2">
              <Shield className="w-5 h-5 text-primary" />
              3. Weryfikacja Faktów (Claims)
            </h2>
            <p className="text-sm text-muted-foreground">
              AI wyodrębniło następujące fakty z Twoich materiałów. Potwierdź ich prawdziwość.
            </p>
          </div>
          <Button onClick={onApprove} disabled={isProcessing} className="gap-2">
            {isProcessing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
            Zatwierdź wszystkie fakty
          </Button>
        </div>

        <div className="space-y-3">
          {claims.map((claim, idx) => (
            <div key={idx} className="p-4 rounded-xl border bg-muted/20 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className="text-[10px] uppercase">{claim.type}</Badge>
                  <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
                    <Info className="w-3 h-3" />
                    <span>Pewność: {Math.round((claim.confidence ?? 0.8) * 100)}%</span>
                  </div>
                </div>
                <p className="text-sm font-medium">{claim.claim}</p>
                <div className="flex flex-wrap gap-1 mt-2">
                  {claim.sources.map((s, sIdx) => (
                    <span key={sIdx} className="text-[10px] bg-background border px-1.5 py-0.5 rounded text-muted-foreground truncate max-w-[150px]">
                      {s}
                    </span>
                  ))}
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <Button size="sm" variant="outline" className="h-8 w-8 p-0 text-emerald-500">
                  <Check className="w-4 h-4" />
                </Button>
                <Button size="sm" variant="outline" className="h-8 w-8 p-0 text-red-500">
                  <X className="w-4 h-4" />
                </Button>
                <Button size="sm" variant="outline" className="h-8 w-8 p-0">
                  <Pencil className="w-3.5 h-3.5" />
                </Button>
              </div>
            </div>
          ))}
          {claims.length === 0 && (
            <div className="py-12 text-center text-muted-foreground italic">
              Brak wykrytych faktów. Uruchom Deep Research, aby AI mogło przeanalizować materiały.
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
