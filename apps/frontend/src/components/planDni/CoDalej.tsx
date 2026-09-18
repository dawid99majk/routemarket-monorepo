import { Download, Loader2, RefreshCw, Route } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { dziesietna } from '@/lib/liczby';

interface CoDalejProps {
  nrDnia: number;
  /** Zmierzony przebieg dnia; `'loading'` w trakcie liczenia, `null` przed. */
  przebieg: { km: number; h: number; track: unknown[] | null } | 'loading' | null;
  /** Czy dzień ma co najmniej dwa punkty na mapie — bez tego nie ma czego wyznaczać. */
  mozna: boolean;
  cenaTrasy?: number;
  /** Trasa tego dnia została już opłacona — każde kolejne przeliczenie jest bez opłaty. */
  oplacona: boolean;
  tryb: 'pieszo' | 'rower';
  podejscieM: number;
  onWyznacz: () => void;
  onPobierzGpx: () => void;
  dniZTrasa: number;
  wszystkichDni: number;
  onPobierzGpxWyjazdu: () => void;
}

/**
 * Ostatni krok zakładki: z planu dnia do pliku, który idzie do zegarka.
 *
 * Dotąd prowadził do osobnego kreatora, który zakładał własny projekt i tracił
 * związek z planem. Teraz trasa jest częścią dnia: wyznacza się tutaj, zapisuje
 * w planie, a po poprawkach przelicza sama — i stąd pobiera się plik.
 */
export default function CoDalej({
  nrDnia, przebieg, mozna, cenaTrasy, oplacona, tryb, podejscieM, onWyznacz, onPobierzGpx,
  dniZTrasa, wszystkichDni, onPobierzGpxWyjazdu,
}: CoDalejProps) {
  const { t } = useTranslation();
  const liczy = przebieg === 'loading';
  const gotowy = przebieg && przebieg !== 'loading' && przebieg.track?.length ? przebieg : null;
  const przycisk = `mt-3 w-full rounded-sm bg-background text-foreground py-2.5 text-sm font-medium
                    hover:bg-background/90 transition-colors flex items-center justify-center
                    disabled:opacity-60 disabled:cursor-not-allowed
                    focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring`;

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
            {t(tryb === 'rower' ? 'plan.trasa_zmierzona_rower' : 'plan.trasa_zmierzona',
              { km: dziesietna(gotowy.km), minuty: Math.round(gotowy.h * 60) })}
            {podejscieM > 0 && t('plan.podejscie', { m: podejscieM })}
          </p>
          <button type="button" onClick={onPobierzGpx} className={przycisk}>
            <Download className="w-4 h-4 mr-2" aria-hidden /> {t('plan.pobierz_gpx', { nr: nrDnia })}
          </button>
          <p className="text-[12px] text-background/70 mt-2 text-center text-pretty">{t('plan.gpx_opis')}</p>
        </>
      ) : (
        <>
          <button type="button" onClick={onWyznacz} disabled={!mozna || liczy} className={`${przycisk} mt-4`}>
            {liczy
              ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" aria-hidden /> {t('plan.wyznaczam')}</>
              : oplacona
                ? <><RefreshCw className="w-4 h-4 mr-2" aria-hidden /> {t('plan.przelicz_bez_oplaty', { nr: nrDnia })}</>
                : <><Route className="w-4 h-4 mr-2" aria-hidden /> {t('plan.wyznacz_trase', { nr: nrDnia })}</>}
          </button>
          <p className="text-[12px] text-background/70 mt-2 text-center text-pretty">
            {!mozna
              ? t('plan.za_malo_punktow')
              : !oplacona && cenaTrasy != null
                ? t('plan.cena_trasy', { koszt: t('plan.koszt', { count: cenaTrasy }) })
                : null}
          </p>
        </>
      )}

      <div className="border-t border-background/20 mt-4 pt-3">
        <button type="button" onClick={onPobierzGpxWyjazdu} disabled={dniZTrasa === 0}
          className="inline-flex items-center gap-1.5 text-[13px] text-background/85 hover:text-background
                     underline-offset-2 enabled:hover:underline disabled:opacity-60 disabled:cursor-not-allowed
                     focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-sm">
          <Download className="w-3.5 h-3.5" aria-hidden /> {t('plan.gpx_wyjazdu')}
        </button>
        <p className="text-[12px] text-background/70 mt-1">
          {dniZTrasa > 0
            ? t('plan.gpx_wyjazdu_ile', { ile: dniZTrasa, wszystkie: wszystkichDni })
            : t('plan.gpx_wyjazdu_brak')}
        </p>
      </div>
    </section>
  );
}
