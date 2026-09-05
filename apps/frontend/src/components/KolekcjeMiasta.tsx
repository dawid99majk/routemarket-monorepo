import Zdjecie from '@/components/Zdjecie';
import { kolekcjeMiasta, type Kolekcja } from '@/lib/kolekcje';

interface Miejsce {
  id: string;
  name: string;
  photos?: string[] | null;
  vibe_tags?: string[] | null;
}

interface Props {
  miejsca: Miejsce[];
  onWybierz: (k: Kolekcja) => void;
}

/**
 * Wejście do miasta przez motywy zamiast przez płaską siatkę.
 *
 * Siatka sześćdziesięciu kafelków ułożonych po ważności odpowiada na pytanie
 * „co tu jest najważniejsze", ale nie na „na co mam dziś ochotę". Kolekcje
 * odpowiadają na to drugie i dają miejsce, od którego przeglądanie się zaczyna.
 *
 * Liczone z tego, co już wczytane — bez dodatkowego zapytania. Motyw pokazuje się
 * tylko wtedy, gdy ma w tym mieście co najmniej pięć miejsc, więc kafelek nigdy
 * nie prowadzi do pustki.
 */
export default function KolekcjeMiasta({ miejsca, onWybierz }: Props) {
  const zestawy = kolekcjeMiasta(miejsca);
  if (zestawy.length === 0) return null;

  return (
    <div className="mb-6">
      <div className="flex items-center justify-between mb-3">
        <p className="font-narrow uppercase tracking-[0.2em] text-[10.5px] font-semibold text-primary">
          Od czego zacząć
        </p>
        <span className="text-xs text-muted-foreground">
          {zestawy.length} {zestawy.length === 1 ? 'kolekcja' : zestawy.length < 5 ? 'kolekcje' : 'kolekcji'}
        </span>
      </div>

      <div className="flex gap-4 overflow-x-auto pb-2 -mx-1 px-1 scrollbar-none snap-x">
        {zestawy.map(({ kolekcja, miejsca: w }) => {
          const fotki = w.map((m) => (m.photos ?? []).filter(Boolean)[0])
            .filter(Boolean).slice(0, 4) as string[];
          return (
            <button
              key={kolekcja.id}
              onClick={() => onWybierz(kolekcja)}
              className="group text-left rounded-2xl border border-border/70 bg-card overflow-hidden
                         hover:border-primary/50 hover:shadow-md hover:-translate-y-0.5 transition-all duration-300 w-[230px] shrink-0 snap-start shadow-xs flex flex-col"
            >
              <div className="grid grid-cols-2 grid-rows-2 gap-0.5 bg-border/40 aspect-[16/10] overflow-hidden">
                {Array.from({ length: 4 }).map((_, i) => (
                  <div key={i} className="bg-muted overflow-hidden">
                    {fotki[i] && (
                      <Zdjecie src={fotki[i]} gdzie="kafelek" alt=""
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
                    )}
                  </div>
                ))}
              </div>
              <div className="p-3.5 flex-1 flex flex-col justify-between">
                <div>
                  <p className="font-display text-[15px] font-semibold leading-snug text-foreground group-hover:text-primary transition-colors line-clamp-1">
                    {kolekcja.nazwa}
                  </p>
                  <p className="text-[12px] text-muted-foreground leading-snug mt-1 line-clamp-1">
                    {kolekcja.podpis}
                  </p>
                </div>
                <p className="font-mono tabular-nums text-[11px] text-muted-foreground/80 mt-2 font-medium">
                  {w.length} miejsc
                </p>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
