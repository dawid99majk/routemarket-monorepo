import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Loader2, Plus } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import PlannerHeader from '@/components/PlannerHeader';
import TablicaKafelek from '@/components/TablicaKafelek';
import TripProjects from '@/components/TripProjects';
import { inicjalyUzytkownika } from '@/lib/uzytkownik';

interface Wyjazd {
  id: string; name: string; destination: string | null; days: number | null;
  trip_type: string | null; updated_at: string; created_at: string;
}

/**
 * Porządek listy. Domyślnie „ostatnio używane", bo do wyjazdu wraca się częściej
 * niż zakłada nowy — a przy piętnastu tablicach o tych samych nazwach („Paryż
 * z dziećmi" dwa razy) data założenia nie mówi nic o tym, przy której się pracuje.
 *
 * Terminu wyjazdu tu nie ma celowo: datę nosi plan, nie tablica, a plan z datą ma
 * na razie 3 z 15 tablic — sortowanie zostawiałoby resztę bez klucza.
 */
const PORZADKI = [
  { id: 'ostatnie', label: 'Ostatnio używane' },
  { id: 'nowe', label: 'Najnowsze' },
  { id: 'nazwa', label: 'Nazwa A–Z' },
  { id: 'miejsca', label: 'Najwięcej miejsc' },
] as const;
type Porzadek = typeof PORZADKI[number]['id'];

const odmiana = (n: number, jeden: string, kilka: string, wiele: string) => {
  if (n === 1) return jeden;
  const l = n % 10, ll = n % 100;
  return l >= 2 && l <= 4 && (ll < 12 || ll > 14) ? kilka : wiele;
};

/**
 * Lista wyjazdów i pojedyncza tablica to teraz dwa osobne miejsca.
 *
 * Wcześniej mieszkały na jednej stronie: kafelki u góry, treść wybranej tablicy
 * pod nimi. Kliknięcie kafelka zmieniało coś poniżej linii wzroku, lista zostawała
 * na ekranie i nic nie mówiło, którą tablicę się właśnie ogląda. Adres też się nie
 * zmieniał, więc odświeżenie gubiło wybór.
 */
export default function TripPlans() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [initials, setInitials] = useState<string | null>(null);
  const [context, setContext] = useState<string | null>(null);

  const [wyjazdy, setWyjazdy] = useState<Wyjazd[]>([]);
  const [podglad, setPodglad] = useState<Record<string, { zdjecia: string[]; ile: number }>>({});
  const [ladowanie, setLadowanie] = useState(true);
  const [porzadek, setPorzadek] = useState<Porzadek>(() => {
    try { return (localStorage.getItem('rm_porzadek_tablic') as Porzadek) || 'ostatnie'; }
    catch { return 'ostatnie'; }
  });

  const ustawPorzadek = (p: Porzadek) => {
    setPorzadek(p);
    try { localStorage.setItem('rm_porzadek_tablic', p); } catch { /* tryb prywatny */ }
  };

  useEffect(() => { (async () => setInitials(await inicjalyUzytkownika()))(); }, []);

  // Ostatnio otwarta tablica: zakładki w pasku mają wracać tam, gdzie się skończyło.
  useEffect(() => { if (id) localStorage.setItem('rm_ostatnia_tablica', id); }, [id]);

  const wczytajListe = useCallback(async () => {
    setLadowanie(true);
    const { data } = await (supabase as any)
      .from('trip_projects')
      .select('id, name, destination, days, trip_type, updated_at, created_at')
      .order('updated_at', { ascending: false });
    setWyjazdy(data ?? []);

    if (data?.length) {
      const { data: miejsca } = await (supabase as any)
        .from('trip_project_places')
        .select('project_id, image_url')
        .in('project_id', data.map((p: any) => p.id));
      const wg: Record<string, { zdjecia: string[]; ile: number }> = {};
      for (const m of miejsca ?? []) {
        const w = (wg[m.project_id] ??= { zdjecia: [], ile: 0 });
        w.ile++;
        if (m.image_url && w.zdjecia.length < 3) w.zdjecia.push(m.image_url);
      }
      setPodglad(wg);
    }
    setLadowanie(false);
  }, []);

  useEffect(() => { if (!id) wczytajListe(); }, [id, wczytajListe]);

  // ── Pojedyncza tablica ────────────────────────────────────────────────────
  if (id) {
    return (
      <div className="min-h-screen bg-background">
        <PlannerHeader context={context} initials={initials} />
        <main className="max-w-[1400px] mx-auto px-6 py-8">
          <TripProjects projectId={id} onContextChange={setContext} />
        </main>
      </div>
    );
  }

  // ── Lista wyjazdów ────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-background">
      <PlannerHeader initials={initials} />
      <main className="max-w-[1400px] mx-auto px-6 py-8">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="font-narrow uppercase tracking-[0.32em] text-[11px] text-muted-foreground">
              Twoje wyjazdy
            </p>
            <h1 className="font-display font-light text-[40px] leading-[1.05] tracking-[-0.02em] mt-2">
              Wszystkie tablice
            </h1>
            <p className="text-sm text-muted-foreground mt-2">
              Otwórz wyjazd, żeby zobaczyć jego tablicę i plan.
            </p>
          </div>
          <div className="flex items-center gap-3 flex-wrap">
            {/* Pigułki zamiast listy rozwijanej: cztery pozycje mieszczą się w rzędzie,
                a wybrany porządek widać bez otwierania czegokolwiek. */}
            <div className="flex flex-wrap gap-1.5">
              {PORZADKI.map((p) => (
                <button key={p.id} onClick={() => ustawPorzadek(p.id)}
                  aria-pressed={porzadek === p.id}
                  className={`rounded-full px-3 py-1 text-xs border transition-colors ${
                    porzadek === p.id
                      ? 'bg-foreground border-foreground text-background'
                      : 'bg-background border-border hover:bg-muted text-muted-foreground'
                  }`}>
                  {p.label}
                </button>
              ))}
            </div>
            <Button onClick={() => navigate('/start')} className="bg-primary hover:bg-primary/90">
              <Plus className="w-4 h-4 mr-1.5" /> Nowy wyjazd
            </Button>
          </div>
        </div>

        {ladowanie ? (
          <p className="flex items-center gap-2 text-muted-foreground py-16">
            <Loader2 className="w-4 h-4 animate-spin" /> Wczytuję wyjazdy…
          </p>
        ) : wyjazdy.length === 0 ? (
          <div className="rounded-md border border-border bg-card px-6 py-16 text-center mt-8">
            <h2 className="font-display font-light text-[24px]">Nie masz jeszcze żadnego wyjazdu</h2>
            <p className="text-sm text-muted-foreground mt-2 max-w-[44ch] mx-auto text-pretty">
              Zacznij od miasta — resztę, łącznie z pierwszymi miejscami, podsunie agent.
            </p>
            <Button className="mt-6 bg-primary hover:bg-primary/90" onClick={() => navigate('/start')}>
              Zaplanuj pierwszy wyjazd ↗
            </Button>
          </div>
        ) : (
          <div className="mt-8 grid gap-4 [grid-template-columns:repeat(auto-fill,minmax(min(100%,248px),1fr))]">
            {[...wyjazdy].sort((a, b) => {
              if (porzadek === 'nazwa') return a.name.localeCompare(b.name, 'pl');
              if (porzadek === 'nowe') return b.created_at.localeCompare(a.created_at);
              if (porzadek === 'miejsca') return (podglad[b.id]?.ile ?? 0) - (podglad[a.id]?.ile ?? 0);
              return b.updated_at.localeCompare(a.updated_at);
            }).map((w) => {
              const p = podglad[w.id];
              const ile = p?.ile ?? 0;
              return (
                <TablicaKafelek
                  key={w.id}
                  nazwa={w.name}
                  meta={[w.destination, ile > 0 ? `${ile} ${odmiana(ile, 'miejsce', 'miejsca', 'miejsc')}` : null]
                    .filter(Boolean).join(' · ') || 'szkic'}
                  zdjecia={p?.zdjecia ?? []}
                  odznaka={ile === 0
                    ? <Badge variant="outline" className="shrink-0">Pusta</Badge>
                    : undefined}
                  onClick={() => navigate(`/plany/${w.id}`)}
                />
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
}
