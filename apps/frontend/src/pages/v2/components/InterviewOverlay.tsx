import { useState } from 'react';
import { Check, ChevronRight, Send, Sparkles, X } from 'lucide-react';
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

interface InterviewOverlayProps {
  messages: ChatMessage[];
  phase: string | null;
  tripProfile: Record<string, any>;
  busyLabel: string | null;
  onChoose: (option: RouteOption) => void;
  onSend: (text: string) => void;
  onClose: () => void;
}

export default function InterviewOverlay({
  messages,
  phase,
  tripProfile,
  busyLabel,
  onChoose,
  onSend,
  onClose
}: InterviewOverlayProps) {
  const [draft, setDraft] = useState('');

  const lastAgent = [...messages].reverse().find((m) => m.role === 'agent');
  const options = lastAgent?.options ?? [];
  const activeIdx = Math.max(0, STEPS.findIndex((s) => s.id === phase));

  // Podsumowanie dotychczasowych wyborów pokazywane pod paskiem kroków
  const decided = Object.entries(tripProfile).filter(([, v]) => v);

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
    <div className="absolute inset-0 z-[1200] flex flex-col bg-slate-950/45 backdrop-blur-xl animate-in fade-in duration-300">
      {/* Pasek kroków */}
      <div className="shrink-0 px-8 pt-6 pb-4">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-2 text-white/90">
            <Sparkles className="w-5 h-5 text-emerald-400" />
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

        <div className="mt-5 flex items-center gap-1 overflow-x-auto pb-1">
          {STEPS.map((step, i) => {
            const done = i < activeIdx;
            const active = i === activeIdx;
            return (
              <div key={step.id} className="flex items-center gap-1 shrink-0">
                <div
                  className={`flex items-center gap-2 rounded-full px-3.5 py-1.5 text-sm transition-colors ${
                    active
                      ? 'bg-emerald-500 text-white font-medium'
                      : done
                        ? 'bg-white/15 text-white/80'
                        : 'bg-white/5 text-white/40'
                  }`}
                >
                  {done ? (
                    <Check className="w-3.5 h-3.5" />
                  ) : (
                    <span className={`text-xs ${active ? 'opacity-90' : 'opacity-50'}`}>{i + 1}</span>
                  )}
                  {step.label}
                </div>
                {i < STEPS.length - 1 && <ChevronRight className="w-4 h-4 text-white/20 shrink-0" />}
              </div>
            );
          })}
        </div>

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
          {lastAgent && (
            <p className="text-white text-lg leading-relaxed mb-6 max-w-3xl">
              {lastAgent.text.replace(/\s*\[[^\]]+\]/g, '')}
            </p>
          )}

          {busyLabel && (
            <div className="flex items-center gap-2 text-white/70 text-sm">
              <span className="w-1.5 h-1.5 bg-emerald-400 rounded-full animate-bounce" />
              <span className="w-1.5 h-1.5 bg-emerald-400 rounded-full animate-bounce delay-75" />
              <span className="w-1.5 h-1.5 bg-emerald-400 rounded-full animate-bounce delay-150" />
              {busyLabel}
            </div>
          )}

          {!busyLabel && options.length > 0 && (
            <div className={`grid grid-cols-1 ${gridCols} gap-3`}>
              {options.map((option) => (
                <button
                  key={option.id || option.title}
                  type="button"
                  onClick={() => onChoose(option)}
                  className="text-left rounded-2xl border border-white/15 bg-white/10 hover:bg-white/20 hover:border-emerald-400/60 backdrop-blur-md p-4 transition-all hover:-translate-y-0.5 flex flex-col"
                >
                  <div className="font-semibold text-white leading-snug">{option.title}</div>
                  {option.subtitle && (
                    <div className="text-emerald-300 text-xs font-medium mt-1">{option.subtitle}</div>
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
            placeholder="Napisz coś od siebie albo „generuj”, żeby pominąć pytania…"
            className="w-full bg-white/10 border-white/20 text-white placeholder:text-white/40 rounded-full pl-5 pr-12 py-6 backdrop-blur-md focus-visible:ring-emerald-400/50"
          />
          <Button
            type="submit"
            size="icon"
            disabled={!!busyLabel}
            className="absolute right-1.5 rounded-full bg-emerald-500 hover:bg-emerald-400 w-9 h-9 text-white"
          >
            <Send className="w-4 h-4 ml-0.5" />
          </Button>
        </form>
      </div>
    </div>
  );
}
