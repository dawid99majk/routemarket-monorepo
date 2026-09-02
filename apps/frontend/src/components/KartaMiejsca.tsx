import { useEffect, useState } from 'react';
import { CalendarDays, Clock, ExternalLink, Loader2, MapPin } from 'lucide-react';
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
  /** Tablica, z której baza czyta gust przy doborze podobnych. */
  tablica?: string | null;
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
export function formatujGodziny(raw?: string | null): string | null {
  if (!raw) return null;
  let h = raw.trim();
  // Czyścimy reguły świąteczne zaśmiecające widok
  const czesci = h.split(';')
    .map(s => s.trim())
    .filter(s => !s.match(/^(PH|Dec\s*\d+|Jan\s*\d+|Nov\s*\d+|Easter)/i));
  if (czesci.length === 0) return raw;
  h = czesci.join(' · ')
    .replace(/\bMo\b/g, 'pn')
    .replace(/\bTu\b/g, 'wt')
    .replace(/\bWe\b/g, 'śr')
    .replace(/\bTh\b/g, 'czw')
    .replace(/\bFr\b/g, 'pt')
    .replace(/\bSa\b/g, 'sob')
    .replace(/\bSu\b/g, 'nd')
    .replace(/\boff\b/gi, 'nieczynne')
    .replace(/-/g, '–');
  return h.length > 60 ? h.slice(0, 58) + '…' : h;
}

export default function KartaMiejsca({ miejsce, onZamknij, decyzja, onDecyzja, ladowanie,
                                       idKatalogu, pomin, tablica, onOtworzPodobne, onDodajPodobne }: Props) {
  const [foto, setFoto] = useState(0);
  useEffect(() => { setFoto(0); }, [miejsce?.name]);

  if (!miejsce) return null;
  const zdjecia = (miejsce.photos ?? []).filter(Boolean) as string[];
  const ile = zdjecia.length;
  const teraz = Math.min(foto, Math.max(0, ile - 1));
  const sformatowaneGodziny = formatujGodziny(miejsce.opening_hours);

  return (
    <Dialog open onOpenChange={(o) => !o && onZamknij()}>
      <DialogContent className="max-w-3xl max-h-[calc(100dvh-3rem)] p-0 flex flex-col overflow-hidden">
        <DialogHeader className="px-5 py-3.5 sm:px-6 sm:py-4 border-b border-border/60 shrink-0 bg-background flex items-center justify-between">
          <DialogTitle className="flex items-center gap-2.5 pr-8 font-display text-lg sm:text-xl font-medium tracking-tight">
            {miejsce.nr != null && (
              <span className="w-5 h-5 rounded-full bg-foreground text-background shrink-0
                               flex items-center justify-center text-[11px] font-medium font-sans">
                {miejsce.nr}
              </span>
            )}
            <span className="min-w-0 truncate">{miejsce.name}</span>
          </DialogTitle>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto p-5 sm:p-6">
          <div className="grid grid-cols-1 md:grid-cols-12 gap-5">
          {/* Kolumna lewa: Galeria zdjęć i powiązane */}
          <div className="md:col-span-5 flex flex-col gap-2">
            {ile > 0 ? (
              <div>
                <div className="relative rounded-lg overflow-hidden bg-muted aspect-[16/11] border border-border/60 shadow-xs">
                  <Zdjecie src={zdjecia[teraz]} gdzie="bohater" alt={miejsce.name}
                    className="w-full h-full object-cover transition-transform duration-300" />
                  {ile > 1 && (
                    <span className="absolute bottom-2 right-2 rounded-full bg-ink/80 backdrop-blur-xs text-background
                                     font-mono tabular-nums text-[10px] px-2 py-0.5 shadow-xs">
                      {teraz + 1}/{ile}
                    </span>
                  )}
                </div>
                {ile > 1 && (
                  <div className="grid grid-cols-4 gap-1.5 mt-1.5">
                    {zdjecia.slice(0, 4).map((z, i) => (
                      <button key={z} onClick={() => setFoto(i)}
                        aria-label={`Zdjęcie ${i + 1} z ${ile}`}
                        aria-current={i === teraz}
                        className={`h-11 sm:h-12 rounded-md overflow-hidden border transition-all ${
                          i === teraz ? 'border-primary ring-1 ring-primary/40' : 'border-border/70 opacity-70 hover:opacity-100'
                        }`}>
                        <Zdjecie src={z} gdzie={150} alt="" className="w-full h-full object-cover" />
                      </button>
                    ))}
                  </div>
                )}
              </div>
            ) : (
              <div className="rounded-lg bg-gradient-to-br from-primary/10 via-muted/40 to-accent/10 aspect-[4/3] border border-border/60 flex flex-col items-center justify-center p-4 text-center">
                <MapPin className="w-8 h-8 text-primary/50 mb-2" />
                <span className="font-mono text-xs text-muted-foreground uppercase tracking-wider">Zdjęcia w przygotowaniu</span>
                <a
                  href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(miejsce.name)}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-3 text-xs text-primary font-medium hover:underline inline-flex items-center gap-1"
                >
                  Zobacz zdjęcia w Google ↗
                </a>
              </div>
            )}

            {miejsce.slug && (
              <a href={`/miejsce/${miejsce.slug}`}
                className="inline-flex items-center gap-1.5 text-[12px] text-muted-foreground hover:text-foreground transition-colors mt-auto pt-1">
                Otwórz pełną stronę miejsca <ExternalLink className="w-3 h-3" />
              </a>
            )}
          </div>

          {/* Kolumna prawa: Treść, wyróżnik, godziny, decyzje */}
          <div className="md:col-span-7 flex flex-col justify-between gap-4">
            <div className="space-y-3.5">
              {ladowanie && !miejsce.description && (
                <p className="flex items-center gap-2 text-[13px] text-muted-foreground">
                  <Loader2 className="w-3.5 h-3.5 animate-spin" /> Dociągam opis i wskazówki…
                </p>
              )}

              {miejsce.wyroznik && (
                <div className="rounded-lg border border-primary/30 bg-primary/5 p-3 flex items-start gap-2.5">
                  <span className="font-mono uppercase tracking-wider text-[10px] text-primary font-semibold shrink-0 mt-0.5 border border-primary/30 rounded-full px-2 py-0.5 bg-background shadow-2xs">
                    Wyróżnik
                  </span>
                  <p className="text-[13.5px] leading-snug text-foreground/90 text-pretty font-medium">
                    {miejsce.wyroznik}
                  </p>
                </div>
              )}

              {miejsce.description ? (
                <p className="text-[14.5px] leading-relaxed text-foreground/85 text-pretty">
                  {miejsce.description}
                </p>
              ) : (
                <p className="text-[13px] italic text-muted-foreground">
                  Opis tego miejsca jest przygotowywany.
                </p>
              )}

              {/* Wskazówka Agenta */}
              {miejsce.note && (
                <div className="rounded-lg border border-accent/30 bg-accent/5 p-3 flex items-start gap-2.5">
                  <span className="font-mono uppercase tracking-wider text-[10px] text-accent font-semibold shrink-0 mt-0.5 border border-accent/30 rounded-full px-2 py-0.5 bg-background shadow-2xs">
                    Wskazówka
                  </span>
                  <p className="text-[13px] leading-relaxed text-foreground/90 text-pretty">
                    {miejsce.note}
                  </p>
                </div>
              )}
            </div>

            <div className="pt-3 border-t border-border/80 space-y-3">
              {/* Metadane: godziny, czas, www */}
              <div className="font-mono text-[12px] tabular-nums text-muted-foreground/90 flex flex-wrap items-center gap-x-5 gap-y-2">
                {czas(miejsce.visit_minutes) && (
                  <span className="flex items-center gap-1.5">
                    <Clock className="w-3.5 h-3.5 text-primary/70" />
                    <span>Czas: {czas(miejsce.visit_minutes)}</span>
                  </span>
                )}
                {sformatowaneGodziny ? (
                  <span className="flex items-center gap-1.5 min-w-0" title={miejsce.opening_hours || ''}>
                    <CalendarDays className="w-3.5 h-3.5 text-primary/70" />
                    <span className="truncate">{sformatowaneGodziny}</span>
                  </span>
                ) : (
                  <a
                    href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(miejsce.name)}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1 text-accent hover:underline"
                  >
                    <span>Godziny: sprawdź w Google ↗</span>
                  </a>
                )}
                {miejsce.price_hint && <span className="min-w-0 truncate">Koszt: {miejsce.price_hint}</span>}
                <a
                  href={miejsce.website || `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(miejsce.name)}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1 text-primary hover:underline ml-auto text-[11.5px] font-sans"
                >
                  <span>{miejsce.website ? 'Strona obiektu ↗' : 'Otwórz na mapie ↗'}</span>
                </a>
              </div>

              {/* Przyciski decyzyjne */}
              {onDecyzja && (
                <div className="flex flex-wrap items-center gap-2 pt-1">
                  {([['must', 'Na pewno'], ['nice', 'Być może'], ['rejected', 'Nie tym razem']] as const)
                    .map(([id, etykieta]) => {
                      const wybrane = decyzja === id;
                      return (
                        <button key={id} onClick={() => onDecyzja(id)}
                          aria-pressed={wybrane}
                          className={`rounded-full px-4 py-1.5 text-[13px] transition-all shadow-2xs ${
                            wybrane
                              ? id === 'must' ? 'bg-primary text-primary-foreground font-medium'
                                : id === 'nice' ? 'bg-accent text-accent-foreground font-medium'
                                  : 'bg-muted text-muted-foreground line-through'
                              : 'bg-muted/60 hover:bg-muted text-secondary hover:text-foreground'
                          }`}>
                          {etykieta}
                        </button>
                      );
                    })}
                </div>
              )}
            </div>
          </div>
        </div>

        {idKatalogu && onOtworzPodobne && (
          <div className="pt-4 border-t border-border/60">
            <PodobneMiejsca
              idKatalogu={idKatalogu}
              pomin={pomin}
              tablica={tablica}
              onOtworz={onOtworzPodobne}
              onDodaj={onDodajPodobne}
            />
          </div>
        )}
      </div>
    </DialogContent>
  </Dialog>
);
}
