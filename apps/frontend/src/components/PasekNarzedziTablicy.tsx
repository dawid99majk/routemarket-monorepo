import { useEffect, useRef, type ReactNode } from 'react';
import { X } from 'lucide-react';

export type NarzedzieId = 'prefs' | 'szukaj' | 'wydarzenia' | 'udostepnij';

export interface NarzedzieTablicy {
  id: NarzedzieId;
  /** Nadtytuł na kaflu, wersalikami — np. „Szukaj miejsc". */
  etykieta: string;
  /** Druga linia: stan narzędzia, żeby pasek informował także zamknięty. */
  meta: string;
  /** Tytuł panelu po otwarciu. */
  tytul: string;
  /** Zdanie pod tytułem. Bez niego panel otwiera się bez kontekstu. */
  opis?: string;
  tresc: ReactNode;
}

interface PasekNarzedziTablicyProps {
  narzedzia: NarzedzieTablicy[];
  otwarte: NarzedzieId | null;
  onZmiana: (id: NarzedzieId | null) => void;
}

/**
 * Pasek narzędzi pod kubełkami tablicy. Wcześniej wszystkie narzędzia leżały pod
 * spodem jednocześnie, a kliknięcie kafla podmieniało treść w tym samym szarym
 * bloku — nie było widać ani co jest otwarte, ani że kliknięcie w ogóle zadziałało.
 *
 * Teraz kafel jest zakładką: aktywny dostaje wypełnienie kolorem wiodącym i dziobek
 * wskazujący panel, a otwarte jest zawsze dokładnie jedno narzędzie. Na wąskim
 * ekranie ten sam panel wjeżdża jako arkusz przy dolnej krawędzi, bo rozwinięty
 * pod paskiem wypadałby poniżej widoku.
 */
export default function PasekNarzedziTablicy({
  narzedzia, otwarte, onZmiana,
}: PasekNarzedziTablicyProps) {
  const aktywne = narzedzia.find((n) => n.id === otwarte) ?? null;
  const kotwica = useRef<HTMLDivElement>(null);

  /**
   * Panel otwiera się pod paskiem, a pasek stoi nisko na stronie — bez przewinięcia
   * kliknięcie nie dawało żadnego widocznego skutku. Przewijamy tylko po kliknięciu
   * użytkownika, nie przy otwarciu ustawionym z zewnątrz, żeby wejście na pustą
   * tablicę nie szarpało stroną w dół.
   */
  const przewinDoPanelu = () => {
    const plynnie = !window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    requestAnimationFrame(() => {
      kotwica.current?.scrollIntoView({ behavior: plynnie ? 'smooth' : 'auto', block: 'start' });
    });
  };

  useEffect(() => {
    if (!aktywne) return;
    const naKlawisz = (e: KeyboardEvent) => { if (e.key === 'Escape') onZmiana(null); };
    window.addEventListener('keydown', naKlawisz);
    return () => window.removeEventListener('keydown', naKlawisz);
  }, [aktywne, onZmiana]);

  return (
    <div ref={kotwica} className="scroll-mt-20">
      <div role="tablist" aria-label="Narzędzia tablicy" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {narzedzia.map((n) => {
          const czyAktywne = n.id === otwarte;
          return (
            <button
              key={n.id}
              role="tab"
              aria-selected={czyAktywne}
              aria-controls={`narzedzie-${n.id}`}
              onClick={() => {
                onZmiana(czyAktywne ? null : n.id);
                if (!czyAktywne) przewinDoPanelu();
              }}
              className={`relative text-left rounded-md border px-4 py-3 transition-colors ${
                czyAktywne
                  ? 'bg-primary border-primary text-primary-foreground'
                  : 'bg-card border-border hover:border-primary'
              }`}
            >
              <span className={`block font-narrow uppercase tracking-[0.22em] text-[10px] ${
                czyAktywne ? 'text-primary-foreground/75' : 'text-muted-foreground'
              }`}>
                {n.etykieta}
              </span>
              <span className="block text-[15px] mt-1">{n.meta}</span>

              {/* Dziobek pokazuje, z którego kafla wyszedł panel. Tylko tam, gdzie
                  panel faktycznie jest pod paskiem — na telefonie to arkusz. */}
              {czyAktywne && (
                <span className="hidden lg:block absolute -bottom-[6px] left-1/2 -ml-[5px] w-[11px] h-[11px] rotate-45 bg-primary" />
              )}
            </button>
          );
        })}
      </div>

      {aktywne && (
        <>
          {/* Przygaszenie tylko na telefonie: tam panel jest arkuszem nad treścią. */}
          <div
            onClick={() => onZmiana(null)}
            className="lg:hidden fixed inset-0 z-[1450] bg-ink/35 animate-in fade-in duration-150"
          />
          <div
            id={`narzedzie-${aktywne.id}`}
            role="tabpanel"
            className="fixed inset-x-0 bottom-0 z-[1460] max-h-[76vh] overflow-auto rounded-t-md border-t border-primary bg-card
                       lg:static lg:mt-4 lg:max-h-none lg:overflow-visible lg:rounded-md lg:border lg:shadow-token-sm"
          >
            <div className="lg:hidden flex justify-center pt-2.5">
              <span className="w-9 h-1 rounded-full bg-border" />
            </div>

            <div className="relative p-5 sm:p-6">
              <button
                onClick={() => onZmiana(null)}
                aria-label="Zamknij narzędzie"
                className="absolute top-4 right-4 w-8 h-8 rounded-full border border-border bg-card
                           flex items-center justify-center text-muted-foreground hover:border-primary hover:text-primary transition-colors"
              >
                <X className="w-4 h-4" />
              </button>

              <p className="font-narrow uppercase tracking-[0.28em] text-[10px] text-muted-foreground">
                {aktywne.etykieta}
              </p>
              <h3 className="font-display text-[21px] leading-snug mt-1.5 pr-10">{aktywne.tytul}</h3>
              {aktywne.opis && (
                <p className="text-sm text-muted-foreground mt-1.5 max-w-[52ch]">{aktywne.opis}</p>
              )}

              <div className="mt-5">{aktywne.tresc}</div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
