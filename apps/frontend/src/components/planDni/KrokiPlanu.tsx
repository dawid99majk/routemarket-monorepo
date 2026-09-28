import type { ReactNode } from 'react';
import { Check } from 'lucide-react';
import { useTranslation } from 'react-i18next';

interface KrokiPlanuProps {
  /** Miejsca „na pewno" na tablicy — z nich powstaje plan. */
  naPewno: number;
  /** Liczba dni w otwartym planie; `null`, gdy planu jeszcze nie ma. */
  dniUlozone: number | null;
  /** Ile dni planu ma już wyznaczoną trasę. */
  dniZTrasa?: number;
  onTablica: () => void;
  /** Przewija do panelu „Co dalej". Bez planu krok trzeci nie jest klikalny. */
  onTrasa?: () => void;
}

type Stan = 'zrobione' | 'teraz' | 'przed';

/**
 * Gdzie jestem i co dalej — trzy etapy wyjazdu nad planem dni.
 *
 * Zakładka pokazywała harmonogram bez żadnego kontekstu: nie było widać, że
 * powstał z tablicy ani że prowadzi do trasy, którą da się wgrać do zegarka.
 * Użytkownik nie wiedział, czym jest ten ekran i co ma z nim zrobić. Etapy mówią
 * to jednym rzędem, a przy każdym stoi liczba zamiast opisu.
 */
export default function KrokiPlanu({ naPewno, dniUlozone, dniZTrasa = 0, onTablica, onTrasa }: KrokiPlanuProps) {
  const { t } = useTranslation();

  const kroki: { id: string; nazwa: string; opis: string; stan: Stan; onClick?: () => void }[] = [
    {
      id: 'tablica',
      nazwa: t('plan.krok_tablica'),
      opis: t('plan.krok_tablica_opis', { count: naPewno }),
      stan: naPewno > 0 ? 'zrobione' : 'przed',
      onClick: onTablica,
    },
    {
      id: 'plan',
      nazwa: t('plan.krok_plan'),
      opis: dniUlozone ? t('plan.krok_plan_gotowy', { count: dniUlozone }) : t('plan.krok_plan_brak'),
      stan: 'teraz',
    },
    {
      id: 'trasa',
      nazwa: t('plan.krok_trasa'),
      opis: dniUlozone && dniZTrasa > 0
        ? t('plan.krok_trasa_ile', { ile: dniZTrasa, wszystkie: dniUlozone })
        : t('plan.krok_trasa_opis'),
      stan: dniUlozone && dniZTrasa >= dniUlozone ? 'zrobione' : 'przed',
      onClick: dniUlozone ? onTrasa : undefined,
    },
  ];

  return (
    <ol aria-label={t('plan.kroki_aria')}
      className="grid grid-cols-3 rounded-2xl bg-card shadow-token-sm overflow-hidden">
      {kroki.map((k, i) => {
        const tresc: ReactNode = (
          <>
            <span className={`w-6 h-6 rounded-full shrink-0 flex items-center justify-center
                              font-mono text-[12px] tabular-nums ${
              k.stan === 'teraz'
                ? 'bg-foreground text-background'
                : k.stan === 'zrobione'
                  ? 'border border-foreground/40 text-foreground'
                  : 'border border-border text-muted-foreground'
            }`}>
              {k.stan === 'zrobione'
                ? <Check className="w-3.5 h-3.5" aria-label={t('plan.krok_zrobione')} />
                : i + 1}
            </span>
            <span className="min-w-0">
              <span className={`block text-[14px] ${k.stan === 'teraz' ? 'font-semibold' : 'font-medium'} text-foreground`}>
                {k.nazwa}
                {k.stan === 'teraz' && <span className="sr-only"> — {t('plan.krok_teraz')}</span>}
              </span>
              <span className="block text-[13px] text-muted-foreground mt-0.5">{k.opis}</span>
            </span>
          </>
        );
        const klasy = 'w-full h-full text-left flex items-start gap-3 px-4 py-3';
        return (
          <li key={k.id} aria-current={k.stan === 'teraz' ? 'step' : undefined}
            className={i > 0 ? 'border-l border-border' : ''}>
            {k.onClick ? (
              <button type="button" onClick={k.onClick}
                className={`${klasy} hover:bg-muted/60 transition-colors
                            focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring`}>
                {tresc}
              </button>
            ) : (
              <div className={klasy}>{tresc}</div>
            )}
          </li>
        );
      })}
    </ol>
  );
}
