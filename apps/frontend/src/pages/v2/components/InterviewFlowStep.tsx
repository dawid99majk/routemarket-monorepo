import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Compass, ArrowLeft, ChevronRight, Sparkles } from 'lucide-react';

interface InterviewFlowStepProps {
  path3Step: number;
  setPath3Step: (step: number) => void;
  path3Answers: {
    region: string;
    customRegion: string;
    activity: string;
    customActivity: string;
    parking: string;
    customParking: string;
    distance: string;
    customDistance: string;
    difficulty: string;
    customDifficulty: string;
  };
  setPath3Answers: (answers: any) => void;
  onBack: () => void;
  onNext: () => void;
}

export default function InterviewFlowStep({
  path3Step,
  setPath3Step,
  path3Answers,
  setPath3Answers,
  onBack,
  onNext
}: InterviewFlowStepProps) {

  return (
    <Card className="bg-card border-border max-w-2xl mx-auto shadow-token-xl animate-in fade-in duration-300">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4 border-b border-border">
        <div>
          <CardTitle className="text-xl flex items-center gap-2">
            <Compass className="text-warning animate-spin-slow" /> 3. Szukam inspiracji (Wywiad)
          </CardTitle>
          <CardDescription className="text-muted-foreground">
            Krok {path3Step} z 5 — Zaplanujmy Twoją trasę marzeń.
          </CardDescription>
        </div>
        <Button variant="ghost" size="sm" onClick={onBack} className="text-muted-foreground">
          <ArrowLeft className="mr-1 h-4 w-4" /> Anuluj
        </Button>
      </CardHeader>
      <CardContent className="pt-6 space-y-6">
        
        {/* Progress bar */}
        <div className="w-full bg-muted h-2 rounded-full overflow-hidden">
          <div 
            className="bg-warning h-full transition-all duration-300"
            style={{ width: `${(path3Step / 5) * 100}%` }}
          />
        </div>

        {/* Question 1: Region */}
        {path3Step === 1 && (
          <div className="space-y-4 animate-in fade-in slide-in-from-right-3 duration-200">
            <Label className="text-lg font-bold text-foreground">1. Gdzie chcesz jechać / W jakim regionie?</Label>
            <div className="grid grid-cols-2 gap-3">
              {[
                { id: 'tatry', label: 'Tatry i Podhale' },
                { id: 'mazury', label: 'Mazury i Jeziora' },
                { id: 'bieszczady', label: 'Bieszczady' },
                { id: 'jura', label: 'Jura Krakowsko-Częst.' }
              ].map((item) => (
                <div 
                  key={item.id}
                  onClick={() => setPath3Answers({...path3Answers, region: item.label})}
                  className={`p-4 rounded-md border cursor-pointer transition-all ${
                    path3Answers.region === item.label ? 'border-warning/50 bg-warning/15 text-warning-foreground font-semibold shadow-token-xs' : 'border-border bg-muted hover:bg-muted text-muted-foreground'
                  }`}
                >
                  {item.label}
                </div>
              ))}
            </div>
            <div className="space-y-2 pt-2">
              <Label className="text-xs text-muted-foreground">Inny region (wpisz własny):</Label>
              <Input 
                placeholder="np. Karkonosze, Mazury..."
                value={path3Answers.customRegion}
                onChange={(e) => setPath3Answers({...path3Answers, customRegion: e.target.value, region: ''})}
                className="bg-card border-border font-sans"
              />
            </div>
          </div>
        )}

        {/* Question 2: Goal */}
        {path3Step === 2 && (
          <div className="space-y-4 animate-in fade-in slide-in-from-right-3 duration-200">
            <Label className="text-lg font-bold text-foreground">2. Co najbardziej chcesz robić podczas wyjazdu?</Label>
            <div className="grid grid-cols-2 gap-3">
              {[
                { label: 'Zwiedzać zamki / zabytki' },
                { label: 'Odpoczywać w naturze' },
                { label: 'Jeść lokalne jedzenie' },
                { label: 'Robić piękne zdjęcia' }
              ].map((item) => (
                <div 
                  key={item.label}
                  onClick={() => setPath3Answers({...path3Answers, activity: item.label})}
                  className={`p-4 rounded-md border cursor-pointer transition-all ${
                    path3Answers.activity === item.label ? 'border-warning/50 bg-warning/15 text-warning-foreground font-semibold shadow-token-xs' : 'border-border bg-muted hover:bg-muted text-muted-foreground'
                  }`}
                >
                  {item.label}
                </div>
              ))}
            </div>
            <div className="space-y-2 pt-2">
              <Label className="text-xs text-muted-foreground">Inny cel wyjazdu:</Label>
              <Input 
                placeholder="np. szukanie grzybów, odpoczynek nad rzeką..."
                value={path3Answers.customActivity}
                onChange={(e) => setPath3Answers({...path3Answers, customActivity: e.target.value, activity: ''})}
                className="bg-card border-border font-sans"
              />
            </div>
          </div>
        )}

        {/* Question 3: Parking / Start */}
        {path3Step === 3 && (
          <div className="space-y-4 animate-in fade-in slide-in-from-right-3 duration-200">
            <Label className="text-lg font-bold text-foreground">3. Gdzie chcesz zacząć?</Label>
            <div className="grid grid-cols-1 gap-2.5">
              {[
                { label: 'Darmowy, bezpieczny parking leśny' },
                { label: 'Centrum miasta (blisko stacji PKP)' },
                { label: 'Dowolne ustronne miejsce na dziko' }
              ].map((item) => (
                <div 
                  key={item.label}
                  onClick={() => setPath3Answers({...path3Answers, parking: item.label})}
                  className={`p-4 rounded-md border cursor-pointer transition-all ${
                    path3Answers.parking === item.label ? 'border-warning/50 bg-warning/15 text-warning-foreground font-semibold shadow-token-xs' : 'border-border bg-muted hover:bg-muted text-muted-foreground'
                  }`}
                >
                  {item.label}
                </div>
              ))}
            </div>
            <div className="space-y-2 pt-2">
              <Label className="text-xs text-muted-foreground">Inne miejsce startu:</Label>
              <Input 
                placeholder="np. Schronisko Murowaniec..."
                value={path3Answers.customParking}
                onChange={(e) => setPath3Answers({...path3Answers, customParking: e.target.value, parking: ''})}
                className="bg-card border-border font-sans"
              />
            </div>
          </div>
        )}

        {/* Question 4: Distance */}
        {path3Step === 4 && (
          <div className="space-y-4 animate-in fade-in slide-in-from-right-3 duration-200">
            <Label className="text-lg font-bold text-foreground">4. Jaki dystans / czas trwania Cię interesuje?</Label>
            <div className="grid grid-cols-3 gap-3">
              {[
                { val: '5', label: 'Spacer (do 5 km / 2h)' },
                { val: '15', label: 'Pół dnia (10-20 km)' },
                { val: '35', label: 'Cały dzień (30+ km)' }
              ].map((item) => (
                <div 
                  key={item.val}
                  onClick={() => setPath3Answers({...path3Answers, distance: item.val})}
                  className={`p-4 rounded-md border cursor-pointer text-center flex flex-col items-center justify-center transition-all ${
                    path3Answers.distance === item.val ? 'border-warning/50 bg-warning/15 text-warning-foreground font-semibold shadow-token-xs' : 'border-border bg-muted hover:bg-muted text-muted-foreground'
                  }`}
                >
                  <span className="text-lg font-bold mb-1">{item.val} km</span>
                  <span className={`text-[10px] leading-tight ${path3Answers.distance === item.val ? 'text-warning-foreground/80' : 'text-muted-foreground'}`}>{item.label}</span>
                </div>
              ))}
            </div>
            <div className="space-y-2 pt-2">
              <Label className="text-xs text-muted-foreground">Wpisz inny dystans (km):</Label>
              <Input 
                type="number"
                placeholder="np. 12..."
                value={path3Answers.customDistance}
                onChange={(e) => setPath3Answers({...path3Answers, customDistance: e.target.value, distance: ''})}
                className="bg-card border-border font-sans"
              />
            </div>
          </div>
        )}

        {/* Question 5: Difficulty */}
        {path3Step === 5 && (
          <div className="space-y-4 animate-in fade-in slide-in-from-right-3 duration-200">
            <Label className="text-lg font-bold text-foreground">5. Jaki poziom trudności preferujesz?</Label>
            <div className="grid grid-cols-3 gap-3">
              {[
                { val: 'easy', label: 'Rekreacyjny / Płasko' },
                { val: 'moderate', label: 'Umiarkowany' },
                { val: 'hard', label: 'Wymagający' }
              ].map((item) => (
                <div 
                  key={item.val}
                  onClick={() => setPath3Answers({...path3Answers, difficulty: item.val})}
                  className={`p-4 rounded-md border text-center cursor-pointer transition-all ${
                    path3Answers.difficulty === item.val ? 'border-warning/50 bg-warning/15 text-warning-foreground font-semibold shadow-token-xs' : 'border-border bg-muted hover:bg-muted text-muted-foreground'
                  }`}
                >
                  <span className="block font-bold text-xs">{item.label}</span>
                </div>
              ))}
            </div>
            <div className="space-y-2 pt-2">
              <Label className="text-xs text-muted-foreground">Własne wymagania co do trudności:</Label>
              <Input 
                placeholder="np. strome podejścia, brak schodów..."
                value={path3Answers.customDifficulty}
                onChange={(e) => setPath3Answers({...path3Answers, customDifficulty: e.target.value, difficulty: ''})}
                className="bg-card border-border font-sans"
              />
            </div>
          </div>
        )}

        {/* Navigation buttons for Step 3 wizard */}
        <div className="flex gap-3 pt-6 border-t border-border">
          {path3Step > 1 && (
            <Button variant="outline" className="border-border text-foreground" onClick={() => setPath3Step(path3Step - 1)}>
              Wstecz
            </Button>
          )}
          {path3Step < 5 ? (
            <Button 
              className="ml-auto bg-foreground hover:bg-foreground/90 text-background flex items-center gap-1"
              disabled={
                (path3Step === 1 && !path3Answers.region && !path3Answers.customRegion) ||
                (path3Step === 2 && !path3Answers.activity && !path3Answers.customActivity) ||
                (path3Step === 3 && !path3Answers.parking && !path3Answers.customParking) ||
                (path3Step === 4 && !path3Answers.distance && !path3Answers.customDistance)
              }
              onClick={() => setPath3Step(path3Step + 1)}
            >
              Następne pytanie <ChevronRight className="h-4 w-4" />
            </Button>
          ) : (
            <Button 
              onClick={onNext}
              className="ml-auto bg-foreground hover:bg-foreground/90 text-background flex items-center gap-2"
              disabled={!path3Answers.difficulty && !path3Answers.customDifficulty}
            >
              <Sparkles className="h-4 w-4" /> Dalej do preferencji
            </Button>
          )}
        </div>

      </CardContent>
    </Card>
  );
}
