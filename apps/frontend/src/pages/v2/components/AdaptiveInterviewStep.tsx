import { CheckCircle2, AlertCircle, HelpCircle, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useState } from 'react';

interface AdaptiveInterviewStepProps {
  missingFields: string[];
  analysisResult: any;
  onUpdateRequirements: (updates: any) => void;
  onNext: () => void;
  onBack: () => void;
}

export default function AdaptiveInterviewStep({
  missingFields,
  analysisResult,
  onUpdateRequirements,
  onNext,
  onBack
}: AdaptiveInterviewStepProps) {
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [currentIdx, setCurrentIdx] = useState(0);

  const fieldLabels: Record<string, string> = {
    start_point: "Skąd dokładnie chcesz zacząć? (Miejscowość, schronisko lub parking)",
    region: "W jakim regionie ma się odbyć wycieczka?",
    activity_type: "Jaki to typ aktywności? (np. pieszo, rower, motocykl)",
    distance_target_km: "Jaki dystans Cię interesuje? (km)",
    difficulty: "Jaki poziom trudności preferujesz? (easy, moderate, hard)"
  };

  const currentField = missingFields[currentIdx];

  const handleAnswer = (value: string) => {
    const newAnswers = { ...answers, [currentField]: value };
    setAnswers(newAnswers);
    
    if (currentIdx < missingFields.length - 1) {
      setCurrentIdx(currentIdx + 1);
    } else {
      onUpdateRequirements(newAnswers);
      onNext();
    }
  };

  if (missingFields.length === 0) {
    return (
      <Card className="bg-zinc-900/40 border-zinc-800 max-w-xl mx-auto text-center p-8 space-y-6">
        <CardContent className="pt-4">
          <div className="h-16 w-16 bg-emerald-500/20 rounded-full flex items-center justify-center mx-auto mb-4">
            <CheckCircle2 className="h-8 w-8 text-emerald-400" />
          </div>
          <h2 className="text-xl font-bold text-zinc-100">Wszystko jasne!</h2>
          <p className="text-sm text-zinc-400 leading-relaxed">
            AI wyodrębniło komplet danych z Twoich materiałów. Możemy przejść do generowania trasy.
          </p>
          <div className="mt-8">
            <Button onClick={onNext} className="w-full bg-cyan-600 hover:bg-cyan-700 text-white">Przejdź dalej</Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="max-w-xl mx-auto space-y-6 animate-in fade-in slide-in-from-bottom-4">
      <div className="flex items-center justify-between px-2">
        <div className="flex items-center gap-2">
          <HelpCircle className="h-4 w-4 text-cyan-400" />
          <span className="text-xs font-medium text-zinc-500 uppercase tracking-wider">Adaptacyjny Wywiad (Krok {currentIdx + 1}/{missingFields.length})</span>
        </div>
        <Button variant="ghost" size="sm" onClick={onBack} className="text-zinc-500">Wróć</Button>
      </div>

      <Card className="bg-zinc-900/40 border-zinc-800 shadow-2xl">
        <CardContent className="pt-10 pb-10 px-8 space-y-8 text-center">
          <h3 className="text-2xl font-bold text-zinc-100 leading-tight">
            {fieldLabels[currentField] || `Podaj: ${currentField}`}
          </h3>

          <div className="space-y-4">
            <input
              autoFocus
              type="text"
              value={answers[currentField] || ''}
              onChange={(e) => setAnswers({ ...answers, [currentField]: e.target.value })}
              onKeyDown={(e) => e.key === 'Enter' && answers[currentField] && handleAnswer(answers[currentField])}
              className="w-full bg-zinc-950 border border-zinc-800 rounded-xl p-4 text-lg text-zinc-200 focus:ring-2 focus:ring-cyan-500 outline-none transition-all text-center"
              placeholder="Wpisz odpowiedź..."
            />
            
            <div className="flex justify-center gap-2">
              <Button 
                onClick={() => handleAnswer(answers[currentField])} 
                disabled={!answers[currentField]}
                className="bg-cyan-600 hover:bg-cyan-700 text-white px-10 h-12 rounded-xl text-lg"
              >
                Dalej
              </Button>
            </div>
          </div>

          <div className="pt-4 flex items-center justify-center gap-2">
            <div className="flex gap-1">
              {missingFields.map((_, idx) => (
                <div key={idx} className={`h-1.5 w-6 rounded-full transition-all ${idx === currentIdx ? 'bg-cyan-500 w-10' : idx < currentIdx ? 'bg-emerald-500' : 'bg-zinc-800'}`} />
              ))}
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="bg-zinc-900/20 border border-zinc-800/50 rounded-xl p-4 flex gap-3 items-center">
        <AlertCircle className="h-4 w-4 text-zinc-600" />
        <p className="text-[11px] text-zinc-500 leading-relaxed">
          Zidentyfikowaliśmy to pytanie jako brakujący element w Twoich materiałach źródłowych. Twoja odpowiedź pomoże AI precyzyjnie wytyczyć ślad.
        </p>
      </div>
    </div>
  );
}
