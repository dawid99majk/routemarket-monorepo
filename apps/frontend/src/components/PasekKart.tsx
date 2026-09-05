import { useEffect, useMemo, useRef } from 'react';
import { Loader2, MapPin, Plus } from 'lucide-react';
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
  /*
   * PASEK JEST WIDOCZNY ZAWSZE. Pierwsza wersja zwijała go do pigułki po
   * wyborze — żeby oszczędzić pion na wąskim ekranie. W użyciu okazało się to
   * odwrotnością tego, po co pasek powstał: przełącznik kontekstu, który znika,
   * gdy kontekst już masz, przestaje być przełącznikiem. Zmiana miasta albo
   * wyjazdu wymagała wtedy dwóch kliknięć zamiast jednego, a wybrana karta
   * przestawała być widoczna dokładnie wtedy, gdy zaczyna coś znaczyć.
   */
  /**
    * Miasto, którego katalog właśnie zbieramy. Trwa to kilkadziesiąt sekund —
    * najdłuższe oczekiwanie w całej aplikacji — więc musi być widać, że coś się
    * dzieje, i to w tym samym miejscu, gdzie za chwilę stanie gotowa karta.
    */
  zbierane?: string | null;
}

const ZAKLADKI: { id: ZakladkaPaska; etykieta: string }[] = [
  { id: 'tablice', etykieta: 'Twoje wyjazdy' },
  { id: 'ostatnie', etykieta: 'Ostatnio oglądane' },
  { id: 'polecane', etykieta: 'Warto zobaczyć' },
];

export default function PasekKart({
  zakladka, onZakladka, tablice, ostatnie, polecane,
  wybranaTablica, wybraneMiasto, onWybierzTablice, onWybierzMiasto, onNowyWyjazd,
  onWszystkieWyjazdy, zbierane,
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

  /**
   * Wybrany wyjazd jest na liście zawsze, nawet gdy nie mieści się w pierwszej
   * ósemce. Kolejność idzie za datą zmiany, więc przyjście z „Dodaj miejsca"
   * do starszego wyjazdu pokazywałoby pasek BEZ karty tego wyjazdu — czyli
   * dokładnie bez tej jednej, która w tym momencie coś znaczy.
   */
  const doPokazania = useMemo(() => {
    const pierwsze = tablice.slice(0, MAKS_KART);
    if (!wybranaTablica || pierwsze.some((w) => w.id === wybranaTablica)) return pierwsze;
    const wybrana = tablice.find((w) => w.id === wybranaTablica);
    return wybrana ? [wybrana, ...pierwsze.slice(0, MAKS_KART - 1)] : pierwsze;
  }, [tablice, wybranaTablica]);

  /* Podświetlenie poza kadrem nie jest podświetleniem — przewijamy do niego. */
  const wybranaRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    wybranaRef.current?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }, [wybranaTablica, wybraneMiasto, czynna]);

  return (
    <section className="mt-6" aria-label="Wybierz, czym się teraz zajmujesz">
      <div className="mb-3">
        {/* Zawijanie, nie przewijanie: trzy krótkie zakładki mieszczą się w dwóch
            wierszach nawet na 375 px, a przewijany rząd ucinał ostatnią w połowie
            słowa („WARTO ZO…") i wyglądało to jak kolizja z przyciskiem obok. */}
        <div className="flex flex-wrap items-center gap-1 min-w-0">
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
      </div>

      <div
        ref={przewijak}
        className="flex gap-3 overflow-x-auto pb-2 -mx-1 px-1
                   [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {zbierane && (
          <div className="shrink-0 w-[170px] rounded-xl border border-primary/40 bg-primary/5
                          overflow-hidden" aria-live="polite">
            <div className="h-[86px] flex items-center justify-center">
              <Loader2 className="w-5 h-5 text-primary animate-spin" />
            </div>
            <div className="px-3 py-2">
              <p className="font-display text-[14px] leading-tight truncate">{zbierane}</p>
              <p className="font-mono text-[10.5px] text-muted-foreground truncate mt-0.5">
                zbieram miejsca…
              </p>
            </div>
          </div>
        )}

        {czynna === 'tablice' && doPokazania.map((w) => {
          const wybrana = w.id === wybranaTablica;
          return (
            <button
              key={w.id}
              ref={wybrana ? wybranaRef : undefined}
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

        {czynna === 'tablice' && tablice.length > doPokazania.length && (
          <button
            onClick={onWszystkieWyjazdy}
            className="shrink-0 w-[170px] rounded-xl border border-border bg-card
                       hover:border-primary/40 transition-colors
                       flex flex-col items-center justify-center gap-1 py-6"
          >
            <span className="font-display text-[15px]">+{tablice.length - doPokazania.length}</span>
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
              ref={wybrane ? wybranaRef : undefined}
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
