import { useEffect, useState } from 'react';
import { ExternalLink, Loader2 } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import Zdjecie from '@/components/Zdjecie';
import PodobneMiejsca, { type PodobneMiejsce } from '@/components/PodobneMiejsca';

export type Decyzja = 'must' | 'nice' | 'rejected';

export interface MiejsceKarty {
  name: string;
  /** Adres strony miejsca — okno linkuje do niej, nie zastępuje jej. */
  slug?: string | null;
  photos?: (string | null | undefined)[];
  description?: string | null;
  /** Jedno zdanie: czym to miejsce różni się od podobnych w tym mieście. */
  wyroznik?: string | null;
  opening_hours?: string | null;
  visit_minutes?: number | null;
  /** Orientacyjny koszt wstępu -- tylko dla propozycji agenta, katalog tego nie ma. */
  price_hint?: string | null;
  website?: string | null;
  /** Wskazówka agenta przy pozycji planu. */
  note?: string | null;
  /** Numer pinezki na mapie, jeśli miejsce jest w planie. */
  nr?: number | null;
}

interface Props {
  miejsce: MiejsceKarty | null;
  onZamknij: () => void;
  /** Bieżąca decyzja; bez `onDecyzja` przyciski się nie pokazują (widok do odczytu). */
  decyzja?: Decyzja | null;
  onDecyzja?: (d: Decyzja) => void;
  /** Dane jeszcze się dociągają — pokazujemy to, co już mamy. */
  ladowanie?: boolean;
  /** Identyfikator w katalogu. Bez niego pasek podobnych miejsc się nie pokazuje
      — propozycja agenta spoza katalogu nie ma sąsiadów do policzenia. */
  idKatalogu?: string | null;
  /** Miejsca już przypięte do tablicy — nie proponujemy tego, co ktoś ma. */
  pomin?: string[];
  onOtworzPodobne?: (m: PodobneMiejsce) => void;
  onDodajPodobne?: (m: PodobneMiejsce) => unknown;
}

const czas = (min?: number | null) => {
  if (!min) return null;
  const g = Math.floor(min / 60);
  const m = min % 60;
  if (g && m) return `${g} g ${m} min`;
  if (g) return `${g} g`;
  return `${m} min`;
};

/**
 * Karta atrakcji jako okno — jedna dla całej aplikacji.
 *
 * Wcześniej tablica otwierała okno, a Odkrywaj przenosiło na osobną stronę:
 * to samo miejsce, dwa różne zachowania i dwa różne wyglądy. Okno wygrywa
 * w przeglądaniu, bo nie gubi kontekstu — wracasz do listy i mapy tam, gdzie
 * byłeś, a decyzję podejmujesz bez opuszczania ekranu.
 *
 * STRONA MIEJSCA ZOSTAJE i okno do niej linkuje. To nie jest duplikat:
 * `/miejsce/:slug` jest kierowane przez nginx do API, które generuje znaczniki
 * dla wyszukiwarek i podglądów odnośników. Skasowanie jej zabrałoby RouteMarket
 * z wyników wyszukiwania — okno służy przeglądaniu, strona dzieleniu się.
 */
export default function KartaMiejsca({ miejsce, onZamknij, decyzja, onDecyzja, ladowanie,
                                       idKatalogu, pomin, onOtworzPodobne, onDodajPodobne }: Props) {
  const [foto, setFoto] = useState(0);
  useEffect(() => { setFoto(0); }, [miejsce?.name]);

  if (!miejsce) return null;
  const zdjecia = (miejsce.photos ?? []).filter(Boolean) as string[];
  const ile = zdjecia.length;
  const teraz = Math.min(foto, Math.max(0, ile - 1));
  const meta = [czas(miejsce.visit_minutes), miejsce.opening_hours, miejsce.price_hint].filter(Boolean);

  return (
    <Dialog open onOpenChange={(o) => !o && onZamknij()}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2.5 pr-6">
            {miejsce.nr != null && (
              <span className="w-6 h-6 rounded-full bg-foreground text-background shrink-0
                               flex items-center justify-center text-[12px] font-medium">
                {miejsce.nr}
              </span>
            )}
            <span className="min-w-0">{miejsce.name}</span>
          </DialogTitle>
        </DialogHeader>

        {ile > 0 && (
          <div>
            <div className="relative rounded-md overflow-hidden bg-placeholder-photo aspect-[4/3]">
              <Zdjecie src={zdjecia[teraz]} gdzie="bohater" alt={miejsce.name}
                className="w-full h-full object-cover" />
              {ile > 1 && (
                <span className="absolute top-2 right-2 rounded-full bg-ink/60 text-background
                                 font-mono tabular-nums text-[11px] px-2 py-0.5">
                  {teraz + 1}/{ile}
                </span>
              )}
            </div>
            {ile > 1 && (
              <div className="grid grid-cols-5 gap-2 mt-2">
                {zdjecia.slice(0, 5).map((z, i) => (
                  <button key={z} onClick={() => setFoto(i)}
                    aria-label={`Zdjęcie ${i + 1} z ${ile}`}
                    aria-current={i === teraz}
                    className={`h-16 rounded-sm overflow-hidden border transition-colors ${
                      i === teraz ? 'border-foreground/45' : 'border-border'
                    }`}>
                    <Zdjecie src={z} gdzie={250} alt="" className="w-full h-full object-cover" />
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {ladowanie && !miejsce.description && (
          <p className="flex items-center gap-2 text-[13px] text-muted-foreground">
            <Loader2 className="w-3.5 h-3.5 animate-spin" /> Dociągam opis…
          </p>
        )}

        {miejsce.wyroznik && (
          <p className="border-l-2 border-foreground/25 pl-3 text-[14px] leading-relaxed
                        text-foreground/90 text-pretty">
            {miejsce.wyroznik}
          </p>
        )}

        {miejsce.description && (
          <p className="text-[15px] leading-relaxed text-foreground/85 text-pretty">
            {miejsce.description}
          </p>
        )}

        {/* Głos agenta — terakota, tak jak wszędzie indziej w produkcie. */}
        {miejsce.note && (
          <p className="rounded-md border border-accent/30 bg-accent/5 px-3.5 py-2.5
                        text-[13px] leading-relaxed text-pretty">
            <span className="font-narrow uppercase tracking-[0.18em] text-[10px] text-accent mr-2">
              Agent
            </span>
            {miejsce.note}
          </p>
        )}

        {meta.length > 0 && (
          <div className="border-t border-border pt-3 font-mono text-[12px] tabular-nums
                          text-muted-foreground flex flex-wrap gap-x-4 gap-y-1">
            {czas(miejsce.visit_minutes) && <span>Czas: {czas(miejsce.visit_minutes)}</span>}
            {miejsce.opening_hours && <span className="min-w-0 truncate">Godziny: {miejsce.opening_hours}</span>}
            {miejsce.price_hint && <span className="min-w-0 truncate">Koszt: {miejsce.price_hint}</span>}
          </div>
        )}

        {onDecyzja && (
          <div className="flex flex-wrap items-center gap-2 border-t border-border pt-3.5">
            {([['must', 'Na pewno'], ['nice', 'Być może'], ['rejected', 'Nie tym razem']] as const)
              .map(([id, etykieta]) => {
                const wybrane = decyzja === id;
                return (
                  <button key={id} onClick={() => onDecyzja(id)}
                    aria-pressed={wybrane}
                    className={`rounded-full px-3.5 py-1.5 text-[13px] transition-colors ${
                      wybrane
                        ? id === 'must' ? 'bg-primary text-primary-foreground font-medium'
                          : id === 'nice' ? 'bg-accent text-accent-foreground font-medium'
                            : 'bg-muted text-muted-foreground line-through'
                        : 'bg-muted/60 hover:bg-muted text-secondary'
                    }`}>
                    {etykieta}
                  </button>
                );
              })}
          </div>
        )}

        {idKatalogu && onOtworzPodobne && (
          <PodobneMiejsca
            idKatalogu={idKatalogu}
            pomin={pomin}
            onOtworz={onOtworzPodobne}
            onDodaj={onDodajPodobne}
          />
        )}

        {/* Strona miejsca zostaje osobno: to ona ma adres do podzielenia się
            i to ją widzą wyszukiwarki. Okno służy przeglądaniu. */}
        {miejsce.slug && (
          <a href={`/miejsce/${miejsce.slug}`}
            className="inline-flex items-center gap-1.5 text-[13px] text-secondary
                       hover:text-foreground transition-colors">
            Pełna strona miejsca <ExternalLink className="w-3.5 h-3.5" />
          </a>
        )}
      </DialogContent>
    </Dialog>
  );
}
