import { useEffect, useState } from 'react';
import { CalendarDays, Clock, ExternalLink, Loader2, MapPin } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import Zdjecie from '@/components/Zdjecie';
import PodobneMiejsca, { type PodobneMiejsce } from '@/components/PodobneMiejsca';
import { formatujGodziny } from '@/lib/godziny';
import AgentDymek from '@/components/AgentDymek';
import PrzelacznikDecyzji from '@/components/PrzelacznikDecyzji';
import GaleriaZdjec from '@/components/GaleriaZdjec';

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
export { formatujGodziny };

export default function KartaMiejsca({ miejsce, onZamknij, decyzja, onDecyzja, ladowanie,
                                       idKatalogu, pomin, tablica, onOtworzPodobne, onDodajPodobne }: Props) {
  if (!miejsce) return null;
  const zdjecia = (miejsce.photos ?? []).filter(Boolean) as string[];
  const sformatowaneGodziny = formatujGodziny(miejsce.opening_hours);

  return (
    <Dialog open onOpenChange={(o) => !o && onZamknij()}>
      <DialogContent
        className="max-w-3xl max-h-[calc(100dvh-3rem)] p-0 flex flex-col overflow-hidden"
        onPointerDownOutside={(e) => {
          const target = e.target as HTMLElement | null;
          if (document.querySelector('.rm-lightbox-portal') || target?.closest?.('.rm-lightbox-portal')) {
            e.preventDefault();
          }
        }}
        onInteractOutside={(e) => {
          const target = e.target as HTMLElement | null;
          if (document.querySelector('.rm-lightbox-portal') || target?.closest?.('.rm-lightbox-portal')) {
            e.preventDefault();
          }
        }}
        onEscapeKeyDown={(e) => {
          if (document.querySelector('.rm-lightbox-portal')) {
            e.preventDefault();
          }
        }}
      >
        <DialogHeader className="px-5 py-3.5 sm:px-6 sm:py-4 border-b border-border/60 shrink-0 bg-card flex items-center justify-between">
          <DialogTitle className="flex items-center gap-2.5 pr-8 font-display text-xl sm:text-[24px] font-bold">
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
          <div className="flex flex-col gap-5">
          {/* Kolumna lewa: Galeria zdjęć i powiązane */}
          <div className="flex flex-col gap-2">
            <GaleriaZdjec
              zdjecia={zdjecia}
              nazwaMiejsca={miejsce.name}
              aspectRatio="aspect-[16/7]"
            />

            {miejsce.slug && (
              <a href={`/miejsce/${miejsce.slug}`}
                className="inline-flex items-center gap-1.5 text-[12px] text-muted-foreground hover:text-foreground transition-colors mt-2 pt-1">
                Otwórz pełną stronę miejsca <ExternalLink className="w-3 h-3" />
              </a>
            )}
          </div>

          {/* Kolumna prawa: Treść, wyróżnik, godziny, decyzje */}
          <div className="flex flex-col gap-4">
            <div className="space-y-3.5">
              {ladowanie && !miejsce.description && (
                <p className="flex items-center gap-2 text-[13px] text-muted-foreground">
                  <Loader2 className="w-3.5 h-3.5 animate-spin" /> Dociągam opis i wskazówki…
                </p>
              )}

              {miejsce.wyroznik && (
                <div className="rounded-md bg-secondary p-3.5 flex items-start gap-2.5">
                  <span className="text-[12px] font-bold text-muted-foreground shrink-0 mt-0.5">
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

              {/* Wskazówka agenta — jego głos, więc jego dymek. */}
              {miejsce.note && <AgentDymek maly>{miejsce.note}</AgentDymek>}
            </div>

            <div className="pt-3 border-t border-border/80 space-y-3">
              {/* Metadane: godziny, czas, www */}
              <div className="text-[13px] tabular-nums flex flex-wrap items-stretch gap-2">
                {czas(miejsce.visit_minutes) && (
                  <span className="flex items-center gap-2 rounded-md bg-secondary px-3.5 py-2.5 font-semibold">
                    <Clock className="w-3.5 h-3.5 text-muted-foreground" />
                    <span>Czas: {czas(miejsce.visit_minutes)}</span>
                  </span>
                )}
                {sformatowaneGodziny ? (
                  <span className="flex items-center gap-2 min-w-0 rounded-md bg-secondary px-3.5 py-2.5 font-semibold" title={miejsce.opening_hours || ''}>
                    <CalendarDays className="w-3.5 h-3.5 text-muted-foreground" />
                    <span className="truncate">{sformatowaneGodziny}</span>
                  </span>
                ) : (
                  <a
                    href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(miejsce.name)}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1 rounded-md bg-secondary px-3.5 py-2.5 font-semibold text-foreground underline underline-offset-2 hover:no-underline"
                  >
                    <span>Godziny: sprawdź w Google ↗</span>
                  </a>
                )}
                {miejsce.price_hint && <span className="min-w-0 truncate rounded-md bg-secondary px-3.5 py-2.5 font-semibold">Koszt: {miejsce.price_hint}</span>}
                <a
                  href={miejsce.website || `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(miejsce.name)}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1 self-center text-foreground underline underline-offset-2 hover:no-underline ml-auto text-[13px] font-semibold"
                >
                  <span>{miejsce.website ? 'Strona obiektu ↗' : 'Otwórz na mapie ↗'}</span>
                </a>
              </div>

              {/* Decyzja — ta sama pigułka co w Odkrywaj i na tablicy. */}
              {onDecyzja && (
                <PrzelacznikDecyzji rozmiar="lg" className="max-w-[440px]" stan={decyzja}
                  onDecyzja={(k) => onDecyzja(k as Decyzja)} />
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
