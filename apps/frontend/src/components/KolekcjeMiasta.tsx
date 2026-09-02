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
      <p className="font-narrow uppercase tracking-[0.18em] text-[10px] text-secondary mb-3">
        Od czego zacząć
      </p>

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
        {zestawy.map(({ kolekcja, miejsca: w }) => {
          // Cztery pierwsze zdjęcia z miejsc o najwyższej ważności — lista
          // przychodzi już w tej kolejności, więc nic tu nie sortujemy.
          const fotki = w.map((m) => (m.photos ?? []).filter(Boolean)[0])
            .filter(Boolean).slice(0, 4) as string[];
          return (
            <button key={kolekcja.id} onClick={() => onWybierz(kolekcja)}
              className="group text-left rounded-md border border-border bg-card overflow-hidden
                         hover:border-foreground/30 transition-colors">
              <div className="grid grid-cols-2 grid-rows-2 gap-px bg-border aspect-[4/3]">
                {Array.from({ length: 4 }).map((_, i) => (
                  <div key={i} className="bg-placeholder-photo overflow-hidden">
                    {fotki[i] && (
                      <Zdjecie src={fotki[i]} gdzie="kafelek" alt=""
                        className="w-full h-full object-cover" />
                    )}
                  </div>
                ))}
              </div>
              <div className="px-3 py-2.5">
                <p className="font-display text-[15px] leading-snug">{kolekcja.nazwa}</p>
                <p className="text-[12px] text-muted-foreground leading-snug mt-0.5">
                  {kolekcja.podpis}
                </p>
                <p className="font-mono tabular-nums text-[11px] text-muted-foreground mt-1.5">
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
