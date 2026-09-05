import { useMemo, useRef } from 'react';
import { ChevronDown, MapPin, Plus } from 'lucide-react';
import Zdjecie from '@/components/Zdjecie';
import type { WyjazdDoPrzelaczenia } from '@/components/PrzelacznikWyjazdu';
import { odmien } from '@/lib/odmiana';

/**
 * Pasek kart nad feedem: czym w tej chwili się zajmujesz.
 *
 * REGUŁA, KTÓRA NIESIE CAŁĄ RESZTĘ. Podświetlona karta jest jednocześnie tym,
 * co oglądasz, i tym, do czego trafia decyzja. Wcześniej były to dwie
 * niezależne rzeczy — miasto w polu wyszukiwania i „aktywny wyjazd" gdzieś
 * w tle — i dało się oglądać Pragę, odkładając miejsca do wyjazdu do Rzymu,
 * bez żadnego sygnału, że tak się dzieje.
 *
 * Stąd dwa rodzaje kart w jednym rzędzie i jedna zasada: karta wyjazdu ustawia
 * miasto ORAZ cel decyzji, karta miasta ustawia samo miasto i CZYŚCI cel.
 * Pierwsze „Na pewno" bez celu pyta o tablicę — zamiast żądać jej na wejściu.
 */

/**
 * Pasek pokazuje kilka ostatnich wyjazdów, nie wszystkie. Na żywym koncie było
 * ich czterdzieści cztery — rząd czterdziestu czterech kart nie jest wyborem,
 * tylko listą do przewijania, a od list jest osobny ekran.
 */
const MAKS_KART = 8;

export type ZakladkaPaska = 'tablice' | 'ostatnie' | 'polecane';

export interface KartaMiasta {
  miasto: string;
  zdjecie?: string | null;
}

interface Props {
  zakladka: ZakladkaPaska;
  onZakladka: (z: ZakladkaPaska) => void;
  tablice: WyjazdDoPrzelaczenia[];
  ostatnie: KartaMiasta[];
  polecane: KartaMiasta[];
  wybranaTablica: string | null;
  wybraneMiasto: string;
  onWybierzTablice: (id: string) => void;
  onWybierzMiasto: (miasto: string) => void;
  onNowyWyjazd: () => void;
  onWszystkieWyjazdy: () => void;
  /** Po wyborze pasek się zwija — przy 375 px inaczej zajmuje cały pierwszy ekran. */
  zwiniety: boolean;
  onPrzelaczZwiniecie: () => void;
}

const ZAKLADKI: { id: ZakladkaPaska; etykieta: string }[] = [
  { id: 'tablice', etykieta: 'Twoje wyjazdy' },
  { id: 'ostatnie', etykieta: 'Ostatnio oglądane' },
  { id: 'polecane', etykieta: 'Warto zobaczyć' },
];

export default function PasekKart({
  zakladka, onZakladka, tablice, ostatnie, polecane,
  wybranaTablica, wybraneMiasto, onWybierzTablice, onWybierzMiasto, onNowyWyjazd,
  onWszystkieWyjazdy,
  zwiniety, onPrzelaczZwiniecie,
}: Props) {
  const przewijak = useRef<HTMLDivElement>(null);

  /* Zakładka bez ani jednej karty to ślepy zaułek — nie pokazujemy jej wcale. */
  const dostepne = useMemo(
    () => ZAKLADKI.filter((z) =>
      z.id === 'tablice' ? tablice.length > 0
        : z.id === 'ostatnie' ? ostatnie.length > 0
          : polecane.length > 0),
    [tablice.length, ostatnie.length, polecane.length]);

  const czynna = dostepne.some((z) => z.id === zakladka) ? zakladka : dostepne[0]?.id ?? 'polecane';

  const opisWyboru = wybranaTablica
    ? tablice.find((t) => t.id === wybranaTablica)?.name ?? wybraneMiasto
    : wybraneMiasto;

  if (zwiniety && opisWyboru) {
    return (
      <button
        onClick={onPrzelaczZwiniecie}
        className="mt-6 inline-flex items-center gap-2 rounded-full border border-primary/25 bg-primary/5
                   px-4 py-2 text-[13px] text-foreground hover:bg-primary/10 transition-colors"
      >
        <MapPin className="w-3.5 h-3.5 text-primary shrink-0" />
        <span className="font-medium">{opisWyboru}</span>
        {wybranaTablica && (
          <span className="font-mono text-[11px] text-muted-foreground">twój wyjazd</span>
        )}
        <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" />
      </button>
    );
  }

  return (
    <section className="mt-6" aria-label="Wybierz, czym się teraz zajmujesz">
      <div className="flex items-center justify-between gap-4 mb-3">
        <div className="flex items-center gap-1 overflow-x-auto min-w-0
                        [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {dostepne.map((z) => (
            <button
              key={z.id}
              onClick={() => onZakladka(z.id)}
              className={`shrink-0 px-3 py-1.5 rounded-full font-narrow uppercase tracking-[0.1em]
                          text-[11px] transition-colors ${
                z.id === czynna
                  ? 'bg-foreground text-background'
                  : 'text-muted-foreground hover:bg-muted/60'
              }`}
            >
              {z.etykieta}
            </button>
          ))}
        </div>
        {opisWyboru && (
          <button
            onClick={onPrzelaczZwiniecie}
            className="shrink-0 font-mono text-[11px] text-muted-foreground hover:text-foreground transition-colors"
          >
            zwiń ↑
          </button>
        )}
      </div>

      <div
        ref={przewijak}
        className="flex gap-3 overflow-x-auto pb-2 -mx-1 px-1
                   [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {czynna === 'tablice' && tablice.slice(0, MAKS_KART).map((w) => {
          const wybrana = w.id === wybranaTablica;
          return (
            <button
              key={w.id}
              onClick={() => onWybierzTablice(w.id)}
              aria-pressed={wybrana}
              className={`shrink-0 w-[170px] text-left rounded-xl overflow-hidden border transition-all ${
                wybrana
                  ? 'border-primary bg-primary/5 shadow-token-sm -translate-y-0.5'
                  : 'border-border bg-card hover:border-primary/40'
              }`}
            >
              <div className="h-[86px] bg-placeholder-photo">
                {w.miniatura
                  ? <Zdjecie src={w.miniatura} alt={w.destination} gdzie="kafelek"
                             className="w-full h-full object-cover" />
                  : <div className="w-full h-full flex items-center justify-center">
                      <MapPin className="w-5 h-5 text-foreground/30" />
                    </div>}
              </div>
              <div className="px-3 py-2">
                <p className="font-display text-[14px] leading-tight truncate">{w.destination || w.name}</p>
                <p className="font-mono text-[10.5px] text-muted-foreground truncate mt-0.5">
                  twój wyjazd{typeof w.liczba_miejsc === 'number'
                    ? ` · ${w.liczba_miejsc} ${odmien(w.liczba_miejsc, 'miejsce', 'miejsca', 'miejsc')}`
                    : ''}
                </p>
              </div>
            </button>
          );
        })}

        {czynna === 'tablice' && tablice.length > MAKS_KART && (
          <button
            onClick={onWszystkieWyjazdy}
            className="shrink-0 w-[170px] rounded-xl border border-border bg-card
                       hover:border-primary/40 transition-colors
                       flex flex-col items-center justify-center gap-1 py-6"
          >
            <span className="font-display text-[15px]">+{tablice.length - MAKS_KART}</span>
            <span className="font-mono text-[10.5px] text-muted-foreground">wszystkie wyjazdy</span>
          </button>
        )}

        {czynna === 'tablice' && (
          <button
            onClick={onNowyWyjazd}
            className="shrink-0 w-[170px] rounded-xl border border-dashed border-border
                       hover:border-primary/50 hover:bg-muted/40 transition-colors
                       flex flex-col items-center justify-center gap-1.5 py-6 text-muted-foreground"
          >
            <Plus className="w-4 h-4" />
            <span className="text-[12.5px]">Nowy wyjazd</span>
          </button>
        )}

        {czynna !== 'tablice' && (czynna === 'ostatnie' ? ostatnie : polecane).map((m) => {
          const wybrane = !wybranaTablica
            && m.miasto.toLowerCase() === (wybraneMiasto || '').toLowerCase();
          return (
            <button
              key={m.miasto}
              onClick={() => onWybierzMiasto(m.miasto)}
              aria-pressed={wybrane}
              className={`shrink-0 w-[170px] text-left rounded-xl overflow-hidden border transition-all ${
                wybrane
                  ? 'border-primary bg-primary/5 shadow-token-sm -translate-y-0.5'
                  : 'border-border bg-card hover:border-primary/40'
              }`}
            >
              <div className="h-[86px] bg-placeholder-photo">
                {m.zdjecie
                  ? <Zdjecie src={m.zdjecie} alt={m.miasto} gdzie="kafelek"
                             className="w-full h-full object-cover" />
                  : <div className="w-full h-full flex items-center justify-center">
                      <MapPin className="w-5 h-5 text-foreground/30" />
                    </div>}
              </div>
              <div className="px-3 py-2">
                <p className="font-display text-[14px] leading-tight truncate">{m.miasto}</p>
                <p className="font-mono text-[10.5px] text-muted-foreground truncate mt-0.5">
                  {czynna === 'ostatnie' ? 'ostatnio oglądane' : 'warto zobaczyć'}
                </p>
              </div>
            </button>
          );
        })}
      </div>
    </section>
  );
}
