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
          <h2 className="text-2xl font-bold text-zinc-100 flex items-center gap-3">
            <ShieldCheck className="text-cyan-400 h-8 w-8" />
            Weryfikacja Faktów (Human-in-the-loop)
          </h2>
          <p className="text-zinc-400 text-sm">Zatwierdź kluczowe informacje wyodrębnione przez AI przed publikacją.</p>
        </div>
        <div className="flex gap-3">
          <Button variant="outline" onClick={onBack} className="border-zinc-800">Wróć</Button>
          <Button 
            onClick={() => onFinishReview(localClaims)}
            className="bg-cyan-600 hover:bg-cyan-700 text-white px-8"
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
                className={`transition-all border-l-4 ${claim.verified ? 'bg-emerald-950/10 border-emerald-500 border-l-emerald-500' : 'bg-zinc-900/40 border-zinc-800 border-l-zinc-700'}`}
              >
                <CardContent className="p-4 flex items-center justify-between gap-4">
                  <div className="space-y-1">
                    <Badge variant="outline" className="text-[9px] uppercase tracking-wider text-zinc-500 border-zinc-800 mb-1">
                      {claim.type || 'Fakt'}
                    </Badge>
                    <p className={`text-sm font-medium ${claim.verified ? 'text-emerald-200' : 'text-zinc-300'}`}>
                      {claim.fact}
                    </p>
                  </div>
                  <Button
                    variant={claim.verified ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => toggleVerify(claim.id)}
                    className={claim.verified ? 'bg-emerald-600 hover:bg-emerald-700 text-white' : 'border-zinc-800 text-zinc-400'}
                  >
                    {claim.verified ? <CheckCircle2 className="h-4 w-4 mr-2" /> : null}
                    {claim.verified ? 'Zatwierdzono' : 'Zatwierdź'}
                  </Button>
                </CardContent>
              </Card>
            ))
          ) : (
            <div className="rounded-2xl border border-dashed border-zinc-800 p-12 text-center space-y-4">
              <AlertCircle className="h-10 w-10 text-zinc-700 mx-auto" />
              <p className="text-zinc-500 text-sm italic">Brak konkretnych faktów do weryfikacji dla tej trasy.</p>
            </div>
          )}
        </div>

        <div className="space-y-6">
          <Card className="bg-zinc-900/60 border-zinc-800 sticky top-24">
            <CardHeader>
              <CardTitle className="text-sm uppercase tracking-widest text-zinc-500">Postęp Weryfikacji</CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="text-center">
                <div className="text-4xl font-black text-zinc-100">{verifiedCount} / {totalCount}</div>
                <p className="text-xs text-zinc-500 mt-2">Zatwierdzonych twierdzeń</p>
              </div>

              <div className="w-full h-2 bg-zinc-950 rounded-full overflow-hidden">
                <div 
                  className="h-full bg-emerald-500 transition-all duration-500 shadow-[0_0_10px_rgba(16,185,129,0.5)]" 
                  style={{ width: `${totalCount > 0 ? (verifiedCount / totalCount) * 100 : 100}%` }}
                />
              </div>

              <div className="space-y-3 pt-4 border-t border-zinc-800">
                <div className="flex items-start gap-2 text-[11px] text-zinc-400 leading-relaxed">
                  <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500 shrink-0 mt-0.5" />
                  <span>Zatwierdzone fakty zostaną użyte jako pewne źródło danych dla Gemini.</span>
                </div>
                <div className="flex items-start gap-2 text-[11px] text-zinc-400 leading-relaxed">
                  <XCircle className="h-3.5 w-3.5 text-red-500 shrink-0 mt-0.5" />
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
