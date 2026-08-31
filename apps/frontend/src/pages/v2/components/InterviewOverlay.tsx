import { useState } from 'react';
import ReactMarkdown from 'react-markdown';
import { TRIP_PRESETS } from '@/lib/tripPresets';
import remarkGfm from 'remark-gfm';
import { AlertTriangle, Bike, Building2, Car, Check, ChevronRight, Footprints, MapPin, Mountain, RotateCw, Send, Sparkles, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import type { ChatMessage, RouteOption } from '@routemarket/atlas-workflow/wizard-machine';

/** Kolejność etapów wywiadu — steruje paskiem kroków. */
const STEPS = [
  { id: 'start_point', label: 'Start' },
  { id: 'discovery', label: 'Charakter' },
  { id: 'variant_choice', label: 'Wariant' },
  { id: 'refine', label: 'Szczegóły' },
  { id: 'confirm', label: 'Podsumowanie' }
] as const;

const VEHICLES = [
  { id: 'motorcycle', label: 'Motocykl', Icon: Mountain },
  { id: 'bicycle', label: 'Rower', Icon: Bike },
  { id: 'hiking', label: 'Pieszo', Icon: Footprints },
  { id: 'city', label: 'Miasto', Icon: Building2 },
  { id: 'car', label: 'Samochód', Icon: Car }
] as const;

interface InterviewOverlayProps {
  messages: ChatMessage[];
  phase: string | null;
  tripProfile: Record<string, any>;
  busyLabel: string | null;
  /** Treść błędu z maszyny stanów. Bez tego nieudana tura wyglądała jak cisza. */
  errorMessage?: string | null;
  onRetry?: () => void;
  vehicleType: string;
  routingPreference: string;
  onVehicleChange: (type: string) => void;
  onRoutingPreferenceChange: (pref: 'popular' | 'wild') => void;
  onTripCharacterChange: (label: string) => void;
  title: string;
  onTitleChange: (title: string) => void;
  onChoose: (option: RouteOption) => void;
  onSend: (text: string) => void;
  onRewind: (phase: string) => void;
  onClose: () => void;
}

export default function InterviewOverlay({
  messages,
  phase,
  tripProfile,
  busyLabel,
  errorMessage,
  onRetry,
  vehicleType,
  routingPreference,
  onVehicleChange,
  onRoutingPreferenceChange,
  onTripCharacterChange,
  title,
  onTitleChange,
  onChoose,
  onSend,
  onRewind,
  onClose
}: InterviewOverlayProps) {
  const [draft, setDraft] = useState('');
  // Karta typu "podaj własny punkt" rozwija pole tekstowe zamiast wysyłać swój tytuł
  const [inputCard, setInputCard] = useState<RouteOption | null>(null);
  const [cardValue, setCardValue] = useState('');

  const started = messages.length > 0;
  const lastAgent = [...messages].reverse().find((m) => m.role === 'agent');
  const options = lastAgent?.options ?? [];
  const activeIdx = Math.max(0, STEPS.findIndex((s) => s.id === phase));

  // Podsumowanie dotychczasowych wyborów pokazywane pod paskiem kroków
  const decided = Object.entries(tripProfile).filter(([, v]) => v);

  const pickCard = (option: RouteOption) => {
    if (option.requiresInput) {
      setInputCard(option);
      setCardValue('');
      return;
    }
    onChoose(option);
  };

  const submitCardValue = (e: React.FormEvent) => {
    e.preventDefault();
    if (!cardValue.trim() || busyLabel || !inputCard) return;
    onChoose({ ...inputCard, title: cardValue, implies: { ...(inputCard.implies || {}), start_point: cardValue } });
    setInputCard(null);
    setCardValue('');
  };

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!draft.trim() || busyLabel) return;
    onSend(draft);
    setDraft('');
  };

  // Karty układamy w rzędzie; przy większej liczbie zawijają się do kolejnego wiersza
  const gridCols =
    options.length >= 3 ? 'md:grid-cols-3' : options.length === 2 ? 'md:grid-cols-2' : 'md:grid-cols-1';

  return (
    <div className="absolute inset-0 z-[1200] flex flex-col bg-ink/45 backdrop-blur-xl animate-in fade-in duration-300">
      {/* Pasek kroków */}
      <div className={`shrink-0 px-8 pt-6 ${started ? 'pb-4' : 'pb-2'}`}>
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-2 text-white/90">
            <Sparkles className="w-5 h-5 text-primary-light" />
            <span className="font-semibold tracking-tight">Kreator trasy</span>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-white/60 hover:text-white transition-colors flex items-center gap-1.5 text-sm"
          >
            Podejrzyj mapę <X className="w-4 h-4" />
          </button>
        </div>

        {started && <div className="mt-5 flex items-center gap-1 overflow-x-auto pb-1">
          {STEPS.map((step, i) => {
            const done = i < activeIdx;
            const active = i === activeIdx;
            return (
              <div key={step.id} className="flex items-center gap-1 shrink-0">
                <button
                  type="button"
                  disabled={!done || !!busyLabel}
                  onClick={() => onRewind(step.id)}
                  title={done ? 'Wróć do tego kroku i wybierz inaczej' : undefined}
                  className={`flex items-center gap-2 rounded-full px-3.5 py-1.5 text-sm transition-colors ${
                    active
                      ? 'bg-background text-foreground font-medium'
                      : done
                        ? 'bg-white/15 text-white/80 hover:bg-white/30 cursor-pointer'
                        : 'bg-white/5 text-white/40 cursor-default'
                  }`}
                >
                  {done ? (
                    <Check className="w-3.5 h-3.5" />
                  ) : (
                    <span className={`text-xs ${active ? 'opacity-90' : 'opacity-50'}`}>{i + 1}</span>
                  )}
                  {step.label}
                </button>
                {i < STEPS.length - 1 && <ChevronRight className="w-4 h-4 text-white/20 shrink-0" />}
              </div>
            );
          })}
        </div>}

        {decided.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {decided.map(([key, value]) => (
              <span
                key={key}
                className="text-[11px] bg-white/10 text-white/70 rounded-full px-2.5 py-1 backdrop-blur"
              >
                {String(value)}
              </span>
            ))}
          </div>
        )}
      </div>

      {/* Pytanie agenta + karty */}
      <div className="flex-1 overflow-y-auto px-8 pb-4">
        <div className="max-w-5xl mx-auto">
          {!started && (
            <div className="pt-6 pb-2">
              <h1 className="text-white text-3xl font-semibold tracking-tight">Zaplanujmy Twoją trasę</h1>
              <p className="text-white/60 mt-2 max-w-2xl">
                Powiedz, dokąd się wybierasz i ile masz czasu — resztę ustalimy po kolei. Najpierw wybierz, czym się poruszasz.
              </p>

              <div className="mt-7 flex flex-wrap gap-2">
                {VEHICLES.map(({ id, label, Icon }) => (
                  <button
                    key={id}
                    type="button"
                    onClick={() => onVehicleChange(id)}
                    className={`flex items-center gap-2 rounded-full px-4 py-2.5 text-sm transition-all border ${
                      vehicleType === id
                        ? 'bg-primary border-primary-light text-white font-medium'
                        : 'bg-white/10 border-white/15 text-white/80 hover:bg-white/20'
                    }`}
                  >
                    <Icon className="w-4 h-4" />
                    {label}
                  </button>
                ))}
              </div>

              <div className="mt-4 flex flex-wrap gap-2">
                {([
                  { id: 'popular', label: 'Klasyki regionu', Icon: Sparkles },
                  { id: 'wild', label: 'Poza szlakiem', Icon: MapPin }
                ] as const).map(({ id, label, Icon }) => (
                  <button
                    key={id}
                    type="button"
                    onClick={() => onRoutingPreferenceChange(id)}
                    className={`flex items-center gap-2 rounded-full px-4 py-2.5 text-sm transition-all border ${
                      routingPreference === id
                        ? 'bg-white/25 border-white/40 text-white font-medium'
                        : 'bg-white/5 border-white/10 text-white/60 hover:bg-white/15'
                    }`}
                  >
                    <Icon className="w-4 h-4" />
                    {label}
                  </button>
                ))}
              </div>

              {/* Charakter wyjazdu jak w planach — delegacja potrzebuje czego innego
                  niż weekend z dziećmi, a agent bez tego pyta o to samo od zera. */}
              <p className="mt-7 text-white/50 text-xs uppercase tracking-wider font-semibold">Charakter wyjazdu</p>
              <div className="mt-2.5 flex flex-wrap gap-2">
                {TRIP_PRESETS.map((preset) => (
                  <button
                    key={preset.id}
                    type="button"
                    title={preset.hint}
                    onClick={() => onTripCharacterChange(preset.label)}
                    className={`rounded-full px-4 py-2.5 text-sm transition-all border ${
                      tripProfile?.charakter === preset.label
                        ? 'bg-white/25 border-white/40 text-white font-medium'
                        : 'bg-white/5 border-white/10 text-white/60 hover:bg-white/15'
                    }`}
                  >
                    {preset.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Nazwa trasy: agent proponuje ją od pierwszej tury, użytkownik poprawia
              w miejscu. Bez tego wszystko lądowało na liście jako "Nowa Trasa AI". */}
          {started && (
            <div className="pt-6 pb-5 max-w-2xl">
              <label className="text-white/50 text-xs uppercase tracking-wider font-semibold">
                Jak nazwać tę trasę?
              </label>
              {/* Domyślne "Nowa Trasa AI" to wartość techniczna, nie propozycja —
                  w polu wyglądałaby jak nazwa, którą ktoś świadomie wybrał. */}
              <input
                value={title === 'Nowa Trasa AI' ? '' : title}
                onChange={(e) => onTitleChange(e.target.value)}
                placeholder="np. Durrës z dziećmi"
                className="mt-2 w-full bg-white/10 border border-white/15 rounded-md px-4 py-3
                           text-white text-lg font-medium placeholder:text-white/30
                           focus:outline-none focus:border-primary-light/60 focus:bg-white/15 transition-colors"
              />
            </div>
          )}

          {started && lastAgent && (
            /* Agent pisze markdownem — podsumowania mają akapity, wypunktowania
               i wyróżnienia. Renderowanie ich jako gołego tekstu dawało ścianę
               liter, której nikt nie chce czytać. */
            <div className="text-white/95 text-base leading-relaxed mb-6 max-w-3xl space-y-3
                            [&_strong]:text-white [&_strong]:font-semibold
                            [&_ul]:space-y-1.5 [&_ul]:mt-2 [&_ol]:space-y-1.5 [&_ol]:mt-2
                            [&_li]:relative [&_li]:pl-5
                            [&_ul>li]:before:content-['•'] [&_ul>li]:before:absolute
                            [&_ul>li]:before:left-1 [&_ul>li]:before:text-primary-light
                            [&_h1]:text-xl [&_h1]:font-semibold [&_h1]:mt-4
                            [&_h2]:text-lg [&_h2]:font-semibold [&_h2]:mt-4
                            [&_h3]:font-semibold [&_h3]:mt-3
                            [&_p]:leading-relaxed
                            [&_a]:text-primary-light [&_a]:underline">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>
                {lastAgent.text.replace(/\s*\[[^\]]+\]/g, '')}
              </ReactMarkdown>
            </div>
          )}

          {busyLabel && (
            <div className="flex items-center gap-2 text-white/70 text-sm">
              <span className="w-1.5 h-1.5 bg-primary-light rounded-full animate-bounce" />
              <span className="w-1.5 h-1.5 bg-primary-light rounded-full animate-bounce delay-75" />
              <span className="w-1.5 h-1.5 bg-primary-light rounded-full animate-bounce delay-150" />
              {busyLabel}
            </div>
          )}

          {!busyLabel && errorMessage && (
            <div className="mb-6 rounded-md border border-accent-foreground/30 bg-accent backdrop-blur-md p-4 max-w-3xl">
              <div className="flex items-start gap-3">
                <AlertTriangle className="w-5 h-5 text-accent shrink-0 mt-0.5" />
                <div className="flex-1 min-w-0">
                  <div className="text-white font-medium">Nie udało się dokończyć tego kroku</div>
                  <p className="text-white/70 text-sm mt-1 leading-relaxed">{errorMessage}</p>
                </div>
                {onRetry && (
                  <Button
                    type="button"
                    onClick={onRetry}
                    className="rounded-full bg-white/15 hover:bg-white/25 text-white shrink-0"
                  >
                    <RotateCw className="w-4 h-4 mr-1.5" /> Ponów
                  </Button>
                )}
              </div>
            </div>
          )}

          {!busyLabel && inputCard && (
            <form onSubmit={submitCardValue} className="mb-4 rounded-md border border-primary-light/50 bg-white/10 backdrop-blur-md p-4">
              <div className="text-white font-medium mb-2">{inputCard.title}</div>
              <div className="flex gap-2">
                <Input
                  autoFocus
                  value={cardValue}
                  onChange={(e) => setCardValue(e.target.value)}
                  placeholder={inputCard.inputPlaceholder || 'Wpisz miejsce…'}
                  className="flex-1 bg-white/10 border-white/20 text-white placeholder:text-white/40 rounded-full px-5 py-5"
                />
                <Button type="submit" disabled={!cardValue.trim()} className="rounded-full bg-primary hover:bg-primary-light text-white px-5">
                  Zatwierdź
                </Button>
                <Button type="button" variant="ghost" onClick={() => setInputCard(null)} className="rounded-full text-white/60 hover:text-white">
                  Anuluj
                </Button>
              </div>
            </form>
          )}

          {!busyLabel && !inputCard && options.length > 0 && (
            <div className={`grid grid-cols-1 ${gridCols} gap-3`}>
              {options.map((option) => (
                <button
                  key={option.id || option.title}
                  type="button"
                  onClick={() => pickCard(option)}
                  className="text-left rounded-md border border-white/15 bg-white/10 hover:bg-white/20 hover:border-primary-light/60 backdrop-blur-md p-4 transition-all hover:-translate-y-0.5 flex flex-col"
                >
                  <div className="font-semibold text-white leading-snug">{option.title}</div>
                  {option.subtitle && (
                    <div className="text-primary-light text-xs font-medium mt-1">{option.subtitle}</div>
                  )}
                  {option.description && (
                    <p className="text-white/70 text-sm mt-2 leading-relaxed flex-1">{option.description}</p>
                  )}
                  {option.highlights && option.highlights.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-3">
                      {option.highlights.map((h) => (
                        <span key={h} className="text-[11px] bg-white/10 text-white/60 rounded-full px-2 py-0.5">
                          {h}
                        </span>
                      ))}
                    </div>
                  )}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Własna odpowiedź */}
      <div className="shrink-0 px-8 pb-6">
        <form onSubmit={submit} className="max-w-5xl mx-auto relative flex items-center">
          <Input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder={started ? 'Napisz coś od siebie albo „generuj”, żeby pominąć pytania…' : 'np. Tirana, kilka godzin, miejsca związane ze sztuką…'}
            className="w-full bg-white/10 border-white/20 text-white placeholder:text-white/40 rounded-full pl-5 pr-12 py-6 backdrop-blur-md focus-visible:ring-ring/50"
          />
          <Button
            type="submit"
            size="icon"
            disabled={!!busyLabel}
            className="absolute right-1.5 rounded-full bg-primary hover:bg-primary-light w-9 h-9 text-white"
          >
            <Send className="w-4 h-4 ml-0.5" />
          </Button>
        </form>
      </div>
    </div>
  );
}
