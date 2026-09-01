import { useEffect, useRef, useState } from 'react';
import { Loader2, Plus, Check } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import i18n from '@/i18n';
import Zdjecie from '@/components/Zdjecie';

/** Pełny kształt miejsca — taki, jaki zwraca `podobne_miejsca`. Kafelek prowadzi
 *  do otwarcia karty i do dopięcia na tablicę, więc niesie komplet danych. */
export interface PodobneMiejsce {
  id: string;
  slug: string | null;
  name: string;
  city: string | null;
  country: string | null;
  lat: number;
  lng: number;
  category: string | null;
  kind: string | null;
  description: string | null;
  photos: (string | null)[] | null;
  opening_hours: string | null;
  website: string | null;
  vibe_tags: string[] | null;
  visit_minutes: number | null;
  pin_count: number | null;
  waznosc: number | null;
  wspolne: number;
  trafnosc: number;
}

interface Props {
  /** Identyfikator miejsca w katalogu. Bez niego pasek się nie pokazuje. */
  idKatalogu: string;
  /** Miejsca już przypięte do tablicy — nie proponujemy tego, co ktoś ma. */
  pomin?: string[];
  /** Klik w kafelek: otwiera to miejsce w tym samym oknie. */
  onOtworz: (m: PodobneMiejsce) => void;
  /** Dopięcie bez otwierania. Bez tej funkcji przycisk się nie pokazuje.
      Zwracana wartość jest nieistotna — dopinające kończą się toastem. */
  onDodaj?: (m: PodobneMiejsce) => unknown;
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
 * „Jeśli to Ci się podoba, rozważ też…" — sąsiedzi tego miejsca w tym mieście.
 *
 * Dobór robi baza (`podobne_miejsca`), nie model: wspólne `vibe_tags` ważone
 * rzadkością tagu, próg dwóch wspólnych i ważność jako rozstrzygnięcie remisu.
 * Żadnego wywołania płatnego dostawcy — to jest zwykłe zapytanie, 11-15 ms.
 *
 * Kafelek otwiera miejsce w tym samym oknie zamiast przenosić na inną stronę,
 * bo o to chodzi w przeglądaniu: wchodzisz głębiej i wracasz tam, gdzie byłeś.
 * Dopięcie ląduje w „być może" — „warto też rozważyć" to dokładnie ten kubełek,
 * a nie decyzja podjęta za użytkownika.
 */
export default function PodobneMiejsca({ idKatalogu, pomin, onOtworz, onDodaj }: Props) {
  const [lista, setLista] = useState<PodobneMiejsce[]>([]);
  const [laduje, setLaduje] = useState(true);
  const [dodane, setDodane] = useState<Set<string>>(new Set());

  // Wykluczenia czytamy przez referencję: zapytanie ma dostać aktualną listę,
  // ale jej zmiana NIE MOŻE przeliczać paska — patrz komentarz przy efekcie.
  const pominRef = useRef<string[]>(pomin ?? []);
  pominRef.current = pomin ?? [];

  useEffect(() => {
    let aktualne = true;
    setLaduje(true);
    setDodane(new Set());
    (async () => {
      const { data, error } = await (supabase as any).rpc('podobne_miejsca', {
        p_place: idKatalogu,
        p_limit: 6,
        p_pomin: pominRef.current,
        p_jezyk: i18n.language?.split('-')[0] || 'pl',
      });
      if (!aktualne) return;
      if (error) {
        // Pasek jest dodatkiem — jego awaria nie może psuć karty miejsca.
        console.warn('[podobne]', error.message);
        setLista([]);
      } else {
        setLista((data ?? []) as PodobneMiejsce[]);
      }
      setLaduje(false);
    })();
    return () => { aktualne = false; };
    // Zależność WYŁĄCZNIE od miejsca, nigdy od wykluczeń. Gdy efekt zależał też
    // od `pomin`, dopięcie kafelka wyrzucało go z własnej listy i podmieniało na
    // inny — zamiast potwierdzenia było przetasowanie pod palcem.
  }, [idKatalogu]);

  if (laduje) {
    return (
      <p className="flex items-center gap-2 border-t border-border pt-3.5 text-[13px] text-muted-foreground">
        <Loader2 className="w-3.5 h-3.5 animate-spin" /> Szukam podobnych…
      </p>
    );
  }

  // Miejsce bez sąsiadów nie dostaje pustego nagłówka — sekcja po prostu znika.
  if (lista.length === 0) return null;

  return (
    <div className="border-t border-border pt-3.5">
      <p className="font-narrow uppercase tracking-[0.18em] text-[10px] text-secondary mb-2.5">
        Jeśli to Ci się podoba
      </p>

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
        {lista.map((m) => {
          const foto = (m.photos ?? []).filter(Boolean)[0] as string | undefined;
          const juzDodane = dodane.has(m.id);
          return (
            <div key={m.id} className="group relative rounded-md border border-border bg-card overflow-hidden">
              <button onClick={() => onOtworz(m)} className="block w-full text-left">
                <div className="aspect-[4/3] bg-placeholder-photo">
                  {foto && (
                    <Zdjecie src={foto} gdzie="kafelek" alt={m.name}
                      className="w-full h-full object-cover" />
                  )}
                </div>
                <div className="px-2.5 py-2">
                  <p className="text-[13px] leading-snug line-clamp-2">{m.name}</p>
                  {czas(m.visit_minutes) && (
                    <p className="mt-0.5 font-mono tabular-nums text-[11px] text-muted-foreground">
                      {czas(m.visit_minutes)}
                    </p>
                  )}
                </div>
              </button>

              {onDodaj && (
                <button
                  onClick={async () => {
                    if (juzDodane) return;
                    await onDodaj(m);
                    setDodane((s) => new Set(s).add(m.id));
                  }}
                  aria-label={juzDodane ? `${m.name} — dodane` : `Dodaj ${m.name} do „być może"`}
                  title={juzDodane ? 'Dodane do „być może"' : 'Dodaj do „być może"'}
                  className={`absolute top-1.5 right-1.5 w-7 h-7 rounded-full flex items-center
                              justify-center transition-colors ${
                    juzDodane
                      ? 'bg-accent text-accent-foreground'
                      : 'bg-card/90 border border-border text-secondary hover:bg-accent hover:text-accent-foreground hover:border-accent'
                  }`}>
                  {juzDodane ? <Check className="w-3.5 h-3.5" /> : <Plus className="w-3.5 h-3.5" />}
                </button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
