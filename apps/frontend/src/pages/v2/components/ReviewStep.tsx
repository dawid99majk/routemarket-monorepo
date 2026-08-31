import { CheckCircle2, XCircle, AlertCircle, ShieldCheck, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useState } from 'react';

interface Claim {
  id: string;
  fact: string;
  type: string;
  verified: boolean;
}

interface ReviewStepProps {
  claims: Claim[];
  onFinishReview: (verifiedClaims: Claim[]) => void;
  onBack: () => void;
}

export default function ReviewStep({ claims, onFinishReview, onBack }: ReviewStepProps) {
  const [localClaims, setLocalClaims] = useState<Claim[]>(claims);

  const toggleVerify = (id: string) => {
    setLocalClaims(prev => prev.map(c => c.id === id ? { ...c, verified: !c.verified } : c));
  };

  const verifiedCount = localClaims.filter(c => c.verified).length;
  const totalCount = localClaims.length;

  return (
    <div className="max-w-4xl mx-auto space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-300">
      <div className="flex items-center justify-between">
        <div className="space-y-1">
          <h2 className="text-2xl font-bold text-foreground flex items-center gap-3">
            <ShieldCheck className="text-accent h-8 w-8" />
            Weryfikacja Faktów (Human-in-the-loop)
          </h2>
          <p className="text-muted-foreground text-sm">Zatwierdź kluczowe informacje wyodrębnione przez AI przed publikacją.</p>
        </div>
        <div className="flex gap-3">
          <Button variant="outline" onClick={onBack} className="border-border">Wróć</Button>
          <Button 
            onClick={() => onFinishReview(localClaims)}
            className="bg-foreground hover:bg-foreground/90 text-background px-8"
            disabled={totalCount > 0 && verifiedCount === 0}
          >
            Zatwierdź i Generuj Przewodnik <ChevronRight className="h-4 w-4 ml-2" />
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="md:col-span-2 space-y-4">
          {localClaims.length > 0 ? (
            localClaims.map((claim) => (
              <Card 
                key={claim.id} 
                className={`transition-all border-l-4 ${claim.verified ? 'bg-ink border-primary border-l-primary' : 'bg-muted border-border border-l-zinc-700'}`}
              >
                <CardContent className="p-4 flex items-center justify-between gap-4">
                  <div className="space-y-1">
                    <Badge variant="outline" className="text-[9px] uppercase tracking-wider text-muted-foreground border-border mb-1">
                      {claim.type || 'Fakt'}
                    </Badge>
                    <p className={`text-sm font-medium ${claim.verified ? 'text-primary-light' : 'text-foreground'}`}>
                      {claim.fact}
                    </p>
                  </div>
                  <Button
                    variant={claim.verified ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => toggleVerify(claim.id)}
                    className={claim.verified ? 'bg-primary hover:bg-foreground text-background' : 'border-border text-muted-foreground'}
                  >
                    {claim.verified ? <CheckCircle2 className="h-4 w-4 mr-2" /> : null}
                    {claim.verified ? 'Zatwierdzono' : 'Zatwierdź'}
                  </Button>
                </CardContent>
              </Card>
            ))
          ) : (
            <div className="rounded-md border border-dashed border-border p-12 text-center space-y-4">
              <AlertCircle className="h-10 w-10 text-foreground mx-auto" />
              <p className="text-muted-foreground text-sm italic">Brak konkretnych faktów do weryfikacji dla tej trasy.</p>
            </div>
          )}
        </div>

        <div className="space-y-6">
          <Card className="bg-muted border-border sticky top-24">
            <CardHeader>
              <CardTitle className="text-sm uppercase tracking-widest text-muted-foreground">Postęp Weryfikacji</CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="text-center">
                <div className="text-4xl font-black text-foreground">{verifiedCount} / {totalCount}</div>
                <p className="text-xs text-muted-foreground mt-2">Zatwierdzonych twierdzeń</p>
              </div>

              <div className="w-full h-2 bg-card rounded-full overflow-hidden">
                <div 
                  className="h-full bg-primary transition-all duration-500" 
                  style={{ width: `${totalCount > 0 ? (verifiedCount / totalCount) * 100 : 100}%` }}
                />
              </div>

              <div className="space-y-3 pt-4 border-t border-border">
                <div className="flex items-start gap-2 text-[11px] text-muted-foreground leading-relaxed">
                  <CheckCircle2 className="h-3.5 w-3.5 text-primary shrink-0 mt-0.5" />
                  <span>Zatwierdzone fakty zostaną użyte jako pewne źródło danych dla Gemini.</span>
                </div>
                <div className="flex items-start gap-2 text-[11px] text-muted-foreground leading-relaxed">
                  <XCircle className="h-3.5 w-3.5 text-danger shrink-0 mt-0.5" />
                  <span>Odrzucone fakty zostaną usunięte z końcowego przewodnika.</span>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
