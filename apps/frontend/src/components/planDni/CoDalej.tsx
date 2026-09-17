import { Download, Loader2, Route } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { dziesietna } from '@/lib/liczby';

interface CoDalejProps {
  nrDnia: number;
  /** Zmierzony przebieg dnia; `'loading'` w trakcie liczenia, `null` przed. */
  przebieg: { km: number; h: number; track: [number, number][] | null } | 'loading' | null;
  /** Czy dzień ma co najmniej dwa punkty na mapie — bez tego nie ma czego wyznaczać. */
  mozna: boolean;
  cenaTrasy?: number;
  onWyznacz: () => void;
  onPobierzGpx: () => void;
  onKreator: () => void;
  onCalyWyjazd: () => void;
}

/**
 * Ostatni krok zakładki: z planu dnia do pliku, który idzie do zegarka.
 *
 * Ciemna karta mówiła dotąd „Zamień go w jedną trasę" i odsyłała do kreatora,
 * choć przebieg dnia liczy się tutaj tym samym wywołaniem i tą samą ceną — a plik
 * GPX powstaje z niego w przeglądarce. Teraz ścieżka jest wprost: wyznacz trasę
 * dnia, pobierz GPX. Kreator zostaje dla tych, którzy chcą trasę przerobić.
 */
export default function CoDalej({
  nrDnia, przebieg, mozna, cenaTrasy, onWyznacz, onPobierzGpx, onKreator, onCalyWyjazd,
}: CoDalejProps) {
  const { t } = useTranslation();
  const liczy = przebieg === 'loading';
  const gotowy = przebieg && przebieg !== 'loading' && przebieg.track?.length ? przebieg : null;

  return (
    <section id="co-dalej" aria-labelledby="co-dalej-tytul" className="rounded-md bg-foreground text-background p-5">
      <p className="font-narrow uppercase tracking-[0.18em] text-[11px] text-background/70">
        {t('plan.co_dalej')}
      </p>
      <h3 id="co-dalej-tytul" className="font-display font-light text-[24px] leading-tight mt-2">
        {t('plan.co_dalej_tytul', { nr: nrDnia })}
      </h3>
      <p className="text-[14px] text-background/80 mt-2 text-pretty">{t('plan.co_dalej_opis')}</p>

      {gotowy ? (
        <>
          <p className="font-mono text-[13px] tabular-nums text-background mt-4">
            {t('plan.trasa_zmierzona', { km: dziesietna(gotowy.km), minuty: Math.round(gotowy.h * 60) })}
          </p>
          <button type="button" onClick={onPobierzGpx}
            className="mt-3 w-full rounded-sm bg-background text-foreground py-2.5 text-sm font-medium
                       hover:bg-background/90 transition-colors flex items-center justify-center
                       focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
            <Download className="w-4 h-4 mr-2" aria-hidden /> {t('plan.pobierz_gpx', { nr: nrDnia })}
          </button>
          <p className="text-[12px] text-background/70 mt-2 text-center">{t('plan.gpx_opis')}</p>
        </>
      ) : (
        <>
          <button type="button" onClick={onWyznacz} disabled={!mozna || liczy}
            className="mt-4 w-full rounded-sm bg-background text-foreground py-2.5 text-sm font-medium
                       hover:bg-background/90 transition-colors flex items-center justify-center
                       disabled:opacity-60 disabled:cursor-not-allowed
                       focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
            {liczy
              ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" aria-hidden /> {t('plan.wyznaczam')}</>
              : <><Route className="w-4 h-4 mr-2" aria-hidden /> {t('plan.wyznacz_trase', { nr: nrDnia })}</>}
          </button>
          <p className="text-[12px] text-background/70 mt-2 text-center text-pretty">
            {mozna
              ? (cenaTrasy != null ? t('plan.cena_trasy', { koszt: t('plan.koszt', { count: cenaTrasy }) }) : null)
              : t('plan.za_malo_punktow')}
          </p>
        </>
      )}

      <div className="border-t border-background/20 mt-4 pt-3 flex flex-col items-start gap-1.5">
        <button type="button" onClick={onKreator}
          className="text-[13px] text-background/85 hover:text-background underline-offset-2 hover:underline
                     focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-sm">
          {t('plan.edytuj_w_kreatorze')} ↗
        </button>
        <button type="button" onClick={onCalyWyjazd}
          className="text-[13px] text-background/85 hover:text-background underline-offset-2 hover:underline
                     focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-sm">
          {t('plan.caly_wyjazd')} ↗
        </button>
      </div>
    </section>
  );
}
