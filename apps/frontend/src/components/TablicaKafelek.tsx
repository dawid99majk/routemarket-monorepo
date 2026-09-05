import type { ReactNode } from 'react';
import Zdjecie from '@/components/Zdjecie';
import { useTranslation } from 'react-i18next';

interface TablicaKafelekProps {
  nazwa: string;
  /** Wiersz monospace pod nazwą, np. „11 miejsc · 4 kopie". */
  meta?: string | null;
  /** Do trzech zdjęć z tablicy. Braki wypełniamy tintami tokenów. */
  zdjecia?: (string | null | undefined)[];
  autor?: string | null;
  /**
   * Tablica przygotowana przez RouteMarket, nie relacja z czyjegoś wyjazdu.
   * Wyklucza się z `autor`: zamiast kółka z inicjałami — które deklaruje, że
   * za tablicą stoi człowiek — pokazujemy etykietę.
   */
  przyklad?: boolean;
  odznaka?: ReactNode;
  akcja?: ReactNode;
  aktywny?: boolean;
  onClick?: () => void;
}

/** Trzy tinty z palety, dobierane nazwą — ta sama tablica zawsze wygląda tak samo. */
const TINTY = ['bg-primary/15', 'bg-dusty-blue/20', 'bg-accent/20'];

function tint(nazwa: string, i: number) {
  let suma = 0;
  for (let k = 0; k < nazwa.length; k++) suma = (suma + nazwa.charCodeAt(k)) % 997;
  return TINTY[(suma + i) % TINTY.length];
}

const inicjaly = (t: string) =>
  t.trim().split(/\s+/).slice(0, 2).map((c) => c[0]).join('').toUpperCase();

/**
 * Kafelek tablicy w formie z projektu: mozaika trzech pól u góry, pod nią nazwa,
 * metryka i autor. Duże pole zajmuje oba rzędy, więc kafelek ma kierunek zamiast
 * być kwadratową siatką — to ta różnica, przez którą wygląda jak rzecz, a nie
 * jak wiersz listy.
 *
 * Zdjęcia z tablicy wchodzą w miejsce tintów, kiedy tylko są. Prototyp używa
 * samych tintów, ale wprost mówi, że docelowo mają tam być fotografie miejsc.
 */
export default function TablicaKafelek({
  nazwa, meta, zdjecia = [], autor, przyklad, odznaka, akcja, aktywny, onClick,
}: TablicaKafelekProps) {
  const { t } = useTranslation();
  const etykietaPrzykladu = t('galeria.przyklad');
  const pola = [0, 1, 2].map((i) => zdjecia[i] || null);

  return (
    <div
      onClick={onClick}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      onKeyDown={onClick ? (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick(); } } : undefined}
      className={`rounded-2xl border bg-card overflow-hidden transition-all duration-300 ${
        onClick ? 'cursor-pointer hover:shadow-md hover:-translate-y-0.5' : ''
      } ${aktywny ? 'border-primary shadow-xs' : 'border-border/70 shadow-xs'}`}
    >
      <div className="grid grid-cols-[2fr_1fr] grid-rows-2 gap-0.5 h-[132px]">
        {pola.map((zdj, i) => (
          <div key={i} className={`overflow-hidden ${i === 0 ? 'row-span-2' : ''} ${zdj ? 'bg-muted' : tint(nazwa, i)}`}>
            {zdj && <Zdjecie src={zdj} gdzie="kafelek" alt="" className="w-full h-full object-cover" />}
          </div>
        ))}
      </div>

      <div className="p-4">
        <div className="flex items-start justify-between gap-3">
          <h3 className="font-display text-[17px] leading-snug min-w-0 truncate">{nazwa}</h3>
          {odznaka}
        </div>
        {meta && (
          <p className="font-mono text-[11px] tabular-nums text-muted-foreground mt-1.5 truncate">{meta}</p>
        )}

        {(autor || przyklad || akcja) && (
          <div className="flex items-center gap-2.5 mt-3.5">
            {przyklad ? (
              <span className="inline-flex items-center rounded-full border border-primary/35
                               bg-primary/8 px-2.5 py-0.5 font-narrow uppercase tracking-[0.14em]
                               text-[10px] text-primary shrink-0">
                {etykietaPrzykladu}
              </span>
            ) : autor ? (
              <>
                <span className="w-7 h-7 rounded-full bg-accent/45 flex items-center justify-center
                                 text-[11px] font-medium shrink-0">
                  {inicjaly(autor)}
                </span>
                <span className="text-[13px] text-muted-foreground truncate">{autor}</span>
              </>
            ) : null}
            {akcja && <div className="ml-auto shrink-0">{akcja}</div>}
          </div>
        )}
      </div>
    </div>
  );
}
