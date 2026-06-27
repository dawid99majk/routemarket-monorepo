import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { HelpCircle, ArrowLeft, Check, Loader2, Sparkles } from 'lucide-react';

type ActivityType = 'hiking' | 'motorcycle' | 'cycling' | 'city_walk';

interface DynamicQuestionsStepProps {
  routeType: ActivityType;
  selectedPills: string[];
  onTogglePill: (id: string) => void;
  durationPref: 'short' | 'long';
  setDurationPref: (pref: 'short' | 'long') => void;
  customWish: string;
  setCustomWish: (wish: string) => void;
  onBack: () => void;
  onGenerate: () => void;
  loading: boolean;
  hasNotes?: boolean;
  distanceTarget: number;
  setDistanceTarget: (dist: number) => void;
  targetDays?: number;
  setTargetDays?: (days: number) => void;
  difficulty: string;
  setDifficulty: (diff: string) => void;
}

export default function DynamicQuestionsStep({
  routeType,
  selectedPills,
  onTogglePill,
  durationPref,
  setDurationPref,
  customWish,
  setCustomWish,
  onBack,
  onGenerate,
  loading,
  hasNotes = false,
  distanceTarget,
  setDistanceTarget,
  targetDays = 1,
  setTargetDays = () => {},
  difficulty,
  setDifficulty
}: DynamicQuestionsStepProps) {

  const getDynamicPills = (activity: ActivityType) => {
    switch(activity) {
      case 'motorcycle':
        return [
          { id: 'kręte_drogi', label: '🏍️ Więcej krętych dróg (zakrętów)' },
          { id: 'punkty_widokowe', label: '📸 Więcej punktów widokowych' },
          { id: 'omijanie_krajówek', label: '🛑 Omijanie dróg ekspresowych' },
          { id: 'klimatyczny_postoj', label: '☕ Klimatyczne miejsca na kawę' }
        ];
      case 'cycling':
        return [
          { id: 'szuter_las', label: '🌲 Więcej dróg szutrowych / leśnych' },
          { id: 'brak_ruchu', label: '🚴 Mniej ruchliwe drogi asfaltowe' },
          { id: 'plasko', label: '⛰️ Płaski profil (omijanie podjazdów)' },
          { id: 'punkty_wody', label: '💧 Miejsca odpoczynku i woda' }
        ];
      case 'hiking':
      default:
        return [
          { id: 'grzbiety_widokowe', label: '🏔️ Widokowe grzbiety górskie' },
          { id: 'schroniska', label: '🏡 Ciekawe schroniska na trasie' },
          { id: 'dzikie_sciezki', label: '🥾 Mniej oblegane, dzikie szlaki' },
          { id: 'historie_ciekawostki', label: '📜 Punkty historyczne i ciekawostki' }
        ];
    }
  };

  return (
    <Card className="bg-zinc-950 border-zinc-800 max-w-2xl mx-auto shadow-xl animate-in fade-in duration-300">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4 border-b border-zinc-800/80">
        <div>
          <CardTitle className="text-xl flex items-center gap-2 text-cyan-400">
            <HelpCircle className="text-cyan-400" /> Co chciałbyś zmienić lub czego szukasz?
          </CardTitle>
          <CardDescription className="text-zinc-400">
            Zaznacz odpowiednie opcje, aby spersonalizować alternatywne trasy.
          </CardDescription>
        </div>
        <Button variant="ghost" size="sm" onClick={onBack} className="text-zinc-400" disabled={loading}>
          <ArrowLeft className="mr-1 h-4 w-4" /> Wstecz
        </Button>
      </CardHeader>
      <CardContent className="pt-6 space-y-6">
        
        {hasNotes && (
          <div className="p-4 bg-cyan-950/20 border border-cyan-800/30 rounded-xl flex items-start gap-3 mb-4 animate-in slide-in-from-top duration-300">
            <Sparkles className="text-cyan-400 h-5 w-5 mt-0.5 animate-pulse flex-shrink-0" />
            <div className="space-y-1">
              <h4 className="text-sm font-bold text-cyan-300">AI przeanalizowało Twoje notatki!</h4>
              <p className="text-xs text-zinc-400 leading-relaxed">
                Wyodrębniliśmy szczegóły trasy bezpośrednio z Twojego tekstu. Poniżej widzisz wykryte wartości — możesz je zweryfikować i zmienić przed wygenerowaniem wariantów.
              </p>
            </div>
          </div>
        )}

        {/* Distance or Days Target Control */}
        {(routeType === 'hiking' || routeType === 'city_walk') ? (
          <div className="space-y-3 p-4 rounded-xl bg-zinc-900/30 border border-zinc-800/80">
            <div className="flex items-center justify-between">
              <Label className="text-zinc-300 font-semibold flex items-center gap-1.5">
                📅 Ilość dni
              </Label>
              {hasNotes && (
                <span className="text-[10px] bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 px-2 py-0.5 rounded-full font-mono font-medium flex items-center gap-1">
                  ✨ Wykryto z notatek
                </span>
              )}
            </div>
            <div className="flex items-center gap-4">
              <input 
                type="range"
                min="1"
                max="14"
                value={targetDays}
                onChange={(e) => setTargetDays(parseInt(e.target.value))}
                className="w-full h-1.5 bg-zinc-800 rounded-lg appearance-none cursor-pointer accent-cyan-500"
              />
              <span className="text-sm font-bold font-mono text-cyan-400 bg-zinc-900 border border-zinc-800 px-3 py-1.5 rounded-lg flex-shrink-0">
                {targetDays} dni
              </span>
            </div>
          </div>
        ) : (
          <div className="space-y-3 p-4 rounded-xl bg-zinc-900/30 border border-zinc-800/80">
            <div className="flex items-center justify-between">
              <Label className="text-zinc-300 font-semibold flex items-center gap-1.5">
                📏 Oczekiwany dystans trasy
              </Label>
              {hasNotes && (
                <span className="text-[10px] bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 px-2 py-0.5 rounded-full font-mono font-medium flex items-center gap-1">
                  ✨ Wykryto z notatek
                </span>
              )}
            </div>
            <div className="flex items-center gap-4">
              <input 
                type="range"
                min="2"
                max="100"
                value={distanceTarget}
                onChange={(e) => setDistanceTarget(parseInt(e.target.value))}
                className="w-full h-1.5 bg-zinc-800 rounded-lg appearance-none cursor-pointer accent-cyan-500"
              />
              <span className="text-sm font-bold font-mono text-cyan-400 bg-zinc-900 border border-zinc-800 px-3 py-1.5 rounded-lg flex-shrink-0">
                {distanceTarget} km
              </span>
            </div>
          </div>
        )}

        {/* Difficulty Control */}
        <div className="space-y-3 p-4 rounded-xl bg-zinc-900/30 border border-zinc-800/80">
          <div className="flex items-center justify-between">
            <Label className="text-zinc-300 font-semibold flex items-center gap-1.5">
              ⛰️ Stopień trudności
            </Label>
            {hasNotes && (
              <span className="text-[10px] bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 px-2 py-0.5 rounded-full font-mono font-medium flex items-center gap-1">
                ✨ Wykryto: {difficulty === 'easy' ? 'Łatwa' : difficulty === 'moderate' ? 'Średnia' : difficulty === 'hard' ? 'Trudna' : 'Ekspert'}
              </span>
            )}
          </div>
          <div className="grid grid-cols-4 gap-2">
            {[
              { id: 'easy', label: 'Łatwa' },
              { id: 'moderate', label: 'Średnia' },
              { id: 'hard', label: 'Trudna' },
              { id: 'expert', label: 'Ekspert' }
            ].map((opt) => (
              <button
                key={opt.id}
                type="button"
                onClick={() => setDifficulty(opt.id)}
                className={`p-2 text-xs font-semibold rounded-lg border text-center transition-all ${
                  difficulty === opt.id
                    ? 'border-cyan-500 bg-cyan-500/10 text-cyan-300'
                    : 'border-zinc-800 bg-zinc-900/20 hover:bg-zinc-900 text-zinc-400'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>
        
        {/* Predefined Pills Grid */}
        <div className="space-y-3">
          <Label className="text-zinc-300 font-semibold">Wybierz interesujące Cię opcje (Wielokrotny wybór):</Label>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {getDynamicPills(routeType).map((pill) => {
              const isSelected = selectedPills.includes(pill.id);
              return (
                <div 
                  key={pill.id}
                  onClick={() => onTogglePill(pill.id)}
                  className={`p-3 rounded-xl border text-sm font-medium cursor-pointer transition-all flex items-center justify-between ${
                    isSelected 
                      ? 'border-cyan-500 bg-cyan-500/10 text-cyan-300' 
                      : 'border-zinc-800 bg-zinc-900/30 hover:bg-zinc-900 text-zinc-400'
                  }`}
                >
                  <span>{pill.label}</span>
                  {isSelected && <Check className="h-4 w-4 text-cyan-400 flex-shrink-0 ml-2" />}
                </div>
              );
            })}
          </div>
        </div>

        {/* Question 2: Duration */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <Label className="text-zinc-300 font-semibold">Jaki jest Twój planowany czas trwania?</Label>
            {hasNotes && (
              <span className="text-[10px] bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 px-2 py-0.5 rounded-full font-mono font-medium flex items-center gap-1">
                ✨ Wykryto: {durationPref === 'short' ? 'Krótki wypad' : 'Całodniowa'}
              </span>
            )}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div 
              onClick={() => setDurationPref('short')}
              className={`p-3 rounded-xl border text-sm font-medium text-center cursor-pointer transition-all ${
                durationPref === 'short' 
                  ? 'border-cyan-500 bg-cyan-500/10 text-cyan-300' 
                  : 'border-zinc-800 bg-zinc-900/30 hover:bg-zinc-900 text-zinc-400'
              }`}
            >
              ⚡ Krótki wypad (rekreacja, do 2-3h)
            </div>
            <div 
              onClick={() => setDurationPref('long')}
              className={`p-3 rounded-xl border text-sm font-medium text-center cursor-pointer transition-all ${
                durationPref === 'long' 
                  ? 'border-cyan-500 bg-cyan-500/10 text-cyan-300' 
                  : 'border-zinc-800 bg-zinc-900/30 hover:bg-zinc-900 text-zinc-400'
              }`}
            >
              🎒 Całodniowa przygoda (wymagająca)
            </div>
          </div>
        </div>

        {/* Question 3: Custom wish */}
        <div className="space-y-2">
          <Label className="text-zinc-300 font-semibold">Inne uwagi / Twoja własna odpowiedź:</Label>
          <Input 
            placeholder="np. chciałbym zatrzymać się w zamku Pieskowa Skała..."
            value={customWish}
            onChange={(e) => setCustomWish(e.target.value)}
            className="bg-zinc-900 border-zinc-800 focus-visible:ring-cyan-500 text-sm font-sans"
            disabled={loading}
          />
        </div>

        <Button 
          onClick={onGenerate} 
          disabled={loading}
          className="w-full bg-cyan-600 hover:bg-cyan-700 text-white py-6 text-base font-semibold rounded-xl flex items-center justify-center gap-2 shadow-lg shadow-cyan-950/20"
        >
          {loading ? <Loader2 className="animate-spin h-5 w-5" /> : <Sparkles className="h-5 w-5 animate-pulse" />}
          Generuj 2-3 warianty zmian AI
        </Button>

      </CardContent>
    </Card>
  );
}
