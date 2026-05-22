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

        <div className="grid grid-cols-1 gap-4">
          {claims.map((claim, idx) => (
            <div key={idx} className="group p-5 rounded-2xl border bg-card hover:border-primary/30 transition-all shadow-sm hover:shadow-md">
              <div className="flex flex-col md:flex-row md:items-start justify-between gap-6">
                <div className="space-y-3 flex-1">
                  <div className="flex flex-wrap items-center gap-3">
                    <Badge variant="secondary" className="px-2 py-0 text-[10px] uppercase font-bold tracking-wider bg-muted/50">
                      {claim.type}
                    </Badge>
                    
                    <div className="flex items-center gap-1.5 text-[10px] font-medium text-muted-foreground bg-muted/30 px-2 py-0.5 rounded-full">
                      <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                      Pewność: {Math.round((claim.confidence ?? 0.8) * 100)}%
                    </div>

                    <div className="flex items-center gap-2">
                      {claim.status === 'verified' ? (
                        <Badge className="bg-emerald-500/10 text-emerald-600 border-emerald-500/20 hover:bg-emerald-500/20 gap-1 px-2 py-0 h-6">
                          <Check className="w-3 h-3" />
                          <span className="text-[10px]">Zweryfikowany</span>
                        </Badge>
                      ) : claim.status === 'rejected' ? (
                        <Badge variant="destructive" className="gap-1 px-2 py-0 h-6">
                          <X className="w-3 h-3" />
                          <span className="text-[10px]">Odrzucony</span>
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="bg-yellow-500/10 text-yellow-600 border-yellow-500/20 hover:bg-yellow-500/20 gap-1 px-2 py-0 h-6">
                          <AlertTriangle className="w-3 h-3" />
                          <span className="text-[10px]">Niepewny</span>
                        </Badge>
                      )}
                    </div>
                  </div>

                  <p className="text-sm md:text-base font-semibold leading-relaxed group-hover:text-primary transition-colors">
                    {claim.claim}
                  </p>

                  <div className="flex flex-col gap-2">
                    <div className="flex items-center gap-2 text-[10px] uppercase font-bold text-muted-foreground/60 tracking-tight">
                      <Shield className="w-3 h-3" />
                      Źródła i Referencje
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {claim.sources.map((s, sIdx) => (
                        <div key={sIdx} className="flex items-center gap-1.5 text-[10px] bg-muted/50 border hover:bg-muted transition-colors px-2 py-1 rounded-md text-muted-foreground max-w-[200px]">
                          <span className="truncate">{s}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                <div className="flex md:flex-col items-center gap-2 shrink-0 border-t md:border-t-0 md:border-l pt-4 md:pt-0 md:pl-6 border-dashed">
                  <Button size="sm" variant="ghost" className="h-9 w-9 p-0 text-emerald-500 hover:text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-950/30 rounded-full">
                    <Check className="w-5 h-5" />
                  </Button>
                  <Button size="sm" variant="ghost" className="h-9 w-9 p-0 text-red-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30 rounded-full">
                    <X className="w-5 h-5" />
                  </Button>
                  <Button size="sm" variant="ghost" className="h-9 w-9 p-0 text-muted-foreground hover:bg-muted rounded-full">
                    <Pencil className="w-4 h-4" />
                  </Button>
                </div>
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
