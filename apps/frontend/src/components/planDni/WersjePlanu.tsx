import { useState } from 'react';
import { Trash2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Button } from '@/components/ui/button';

export interface WersjaPlanu {
  id: string;
  created_at: string;
  window_start?: string | null;
  window_end?: string | null;
}

interface WersjePlanuProps {
  /** Najnowsza pierwsza — tak przychodzą z bazy. */
  wersje: WersjaPlanu[];
  aktywnaId: string | null;
  onOtworz: (id: string) => void;
  onUsun: (id: string) => void;
}

/**
 * Wersje planu jako jeden przełącznik zamiast listy pod całym planem.
 *
 * Każde ułożenie zapisuje nowy wiersz, a lista nazywała je godzinami okna
 * („09:00-17:00 · Ze znajomymi" dwa razy pod rząd) — nie dało się odróżnić,
 * która jest nowsza ani która jest otwarta. Numer liczony od najstarszej i czas
 * powstania mówią to od razu.
 */
export default function WersjePlanu({ wersje, aktywnaId, onOtworz, onUsun }: WersjePlanuProps) {
  const { t, i18n } = useTranslation();
  const [otwarte, setOtwarte] = useState(false);
  const [doUsuniecia, setDoUsuniecia] = useState<string | null>(null);

  if (!wersje.length) return null;

  const numer = (id: string) => wersje.length - wersje.findIndex((w) => w.id === id);
  const kiedy = (iso: string) => new Date(iso).toLocaleString(i18n.language, {
    day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
  });
  const aktywna = wersje.find((w) => w.id === aktywnaId) ?? null;

  return (
    <Popover open={otwarte} onOpenChange={(o) => { setOtwarte(o); if (!o) setDoUsuniecia(null); }}>
      <PopoverTrigger asChild>
        <Button variant="outline">
          {aktywna
            ? <>{t('plan.wersja', { nr: numer(aktywna.id), ile: wersje.length })}
                <span className="font-mono text-[12px] tabular-nums text-muted-foreground ml-2">{kiedy(aktywna.created_at)}</span></>
            : t('plan.wersje_naglowek')}
          <span className="text-muted-foreground ml-2" aria-hidden>▾</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 p-0">
        <div className="px-4 pt-3 pb-2">
          <p className="font-narrow uppercase tracking-[0.18em] text-[11px] text-muted-foreground">
            {t('plan.wersje_naglowek')}
          </p>
          <p className="text-[13px] text-muted-foreground mt-1 text-pretty">{t('plan.wersje_opis')}</p>
        </div>
        <ul className="border-t border-border max-h-[50vh] overflow-y-auto">
          {wersje.map((w) => {
            const nr = numer(w.id);
            const biezaca = w.id === aktywnaId;
            if (doUsuniecia === w.id) {
              return (
                <li key={w.id} className="flex items-center justify-between gap-2 px-4 py-2.5 bg-muted/60">
                  <span className="text-[13px] text-foreground">{t('plan.usun_wersje_pytanie', { nr })}</span>
                  <span className="flex gap-1.5">
                    <Button size="sm" variant="ghost" onClick={() => setDoUsuniecia(null)}>{t('plan.zostaw')}</Button>
                    <Button size="sm" className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                      onClick={() => { onUsun(w.id); setDoUsuniecia(null); }}>
                      {t('plan.usun')}
                    </Button>
                  </span>
                </li>
              );
            }
            return (
              <li key={w.id} className={`flex items-center gap-2 pr-2 ${biezaca ? 'bg-muted' : ''}`}>
                <button type="button" aria-current={biezaca || undefined}
                  onClick={() => { onOtworz(w.id); setOtwarte(false); }}
                  className="flex-1 min-w-0 text-left px-4 py-2.5 hover:bg-muted/60 transition-colors
                             focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                  <span className={`block text-[14px] text-foreground ${biezaca ? 'font-semibold' : ''}`}>
                    {t('plan.wersja_wiersz', { nr })}
                  </span>
                  <span className="block font-mono text-[12px] tabular-nums text-muted-foreground mt-0.5">
                    {kiedy(w.created_at)}
                    {w.window_start && w.window_end ? ` · ${w.window_start}–${w.window_end}` : ''}
                  </span>
                </button>
                <button type="button" onClick={() => setDoUsuniecia(w.id)}
                  aria-label={t('plan.usun_wersje_nr', { nr })} title={t('plan.usun_wersje_nr', { nr })}
                  className="w-8 h-8 rounded-sm flex items-center justify-center text-muted-foreground
                             hover:text-destructive hover:bg-muted transition-colors
                             focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                  <Trash2 className="w-4 h-4" />
                </button>
              </li>
            );
          })}
        </ul>
      </PopoverContent>
    </Popover>
  );
}
