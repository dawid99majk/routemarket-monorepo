import { useCallback, useEffect, useState } from 'react';
import { miniatura, SZEROKOSC } from '@/lib/zdjecia';
import { useNavigate, useParams } from 'react-router-dom';
import { Loader2, Plus } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import PlannerHeader from '@/components/PlannerHeader';
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
  const [podglad, setPodglad] = useState<Record<string,
    { zdjecia: string[]; ile: number; must: number; nice: number; rejected: number }>>({});
  /** Ile dni ma już gotowy plan — klucz to projekt. */
  const [dniPlanu, setDniPlanu] = useState<Record<string, number>>({});
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
    const { data } = await supabase
      .from('trip_projects')
      .select('id, name, destination, days, trip_type, updated_at, created_at')
      .order('updated_at', { ascending: false });
    setWyjazdy(data ?? []);

    if (data?.length) {
      const { data: miejsca } = await supabase
        .from('trip_project_places')
        .select('project_id, image_url, priority')
        .in('project_id', data.map((p: any) => p.id));
      const wg: Record<string,
        { zdjecia: string[]; ile: number; must: number; nice: number; rejected: number }> = {};
      for (const m of miejsca ?? []) {
        const w = (wg[m.project_id] ??= { zdjecia: [], ile: 0, must: 0, nice: 0, rejected: 0 });
        w.ile++;
        if (m.priority === 'must') w.must++;
        else if (m.priority === 'nice') w.nice++;
        else if (m.priority === 'rejected') w.rejected++;
        if (m.image_url && w.zdjecia.length < 3) w.zdjecia.push(m.image_url);
      }
      setPodglad(wg);

      // Gotowość planu: liczba dni w NAJŚWIEŻSZYM zapisanym planie wyjazdu.
      const { data: plany } = await supabase
        .from('trip_plans')
        .select('project_id, plan, created_at')
        .in('project_id', data.map((p: any) => p.id))
        .order('created_at', { ascending: false });
      const wgPlanu: Record<string, number> = {};
      for (const pl of (plany ?? []) as any[]) {
        if (wgPlanu[pl.project_id] != null) continue;   // pierwszy = najświeższy
        const dni = Array.isArray(pl.plan?.days) ? pl.plan.days.length : 0;
        wgPlanu[pl.project_id] = dni;
      }
      setDniPlanu(wgPlanu);
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
              Planowanie
            </p>
            <h1 className="font-display font-light text-[40px] leading-[1.05] tracking-[-0.02em] mt-2">
              Twoje wyjazdy
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
            <Button onClick={() => navigate('/start')}
              className="bg-foreground text-background hover:bg-foreground/90">
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
            <Button className="mt-6 bg-foreground text-background hover:bg-foreground/90" onClick={() => navigate('/start')}>
              Zaplanuj pierwszy wyjazd ↗
            </Button>
          </div>
        ) : (
          <>
          {(() => {
            const posortowane = [...wyjazdy].sort((a, b) => {
              if (porzadek === 'nazwa') return a.name.localeCompare(b.name, 'pl');
              if (porzadek === 'nowe') return b.created_at.localeCompare(a.created_at);
              if (porzadek === 'miejsca') return (podglad[b.id]?.ile ?? 0) - (podglad[a.id]?.ile ?? 0);
              return b.updated_at.localeCompare(a.updated_at);
            });
            const [wTrakcie, ...reszta] = posortowane;
            const p = podglad[wTrakcie.id];
            const dniGotowe = dniPlanu[wTrakcie.id] ?? 0;
            const dniCel = wTrakcie.days ?? 0;
            const postep = dniCel > 0 ? Math.min(100, Math.round((dniGotowe / dniCel) * 100)) : 0;
            return (
              <>
                {/* Wyjazd w trakcie: osobno i wyraźnie większy. To on odróżnia ten
                    ekran od galerii — reszta idzie w spokojną siatkę poniżej. */}
                <button onClick={() => navigate(`/plany/${wTrakcie.id}`)}
                  className="mt-8 w-full text-left rounded-md border border-border bg-card overflow-hidden
                             flex flex-col sm:flex-row shadow-token-sm hover:shadow-token-md transition-shadow">
                  <div className="w-full sm:w-[300px] h-[224px] shrink-0 bg-placeholder-photo overflow-hidden">
                    {p?.zdjecia?.[0] && (
                      <img src={miniatura(p.zdjecia[0], SZEROKOSC.kafelek)} alt="" loading="lazy" className="w-full h-full object-cover" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0 p-6 flex flex-col">
                    <p className="font-narrow uppercase tracking-[0.26em] text-[10px] text-accent">
                      W trakcie układania
                    </p>
                    <h2 className="font-display font-light text-[30px] leading-[1.1] tracking-[-0.02em] mt-2 truncate">
                      {wTrakcie.name}
                    </h2>
                    <p className="font-mono text-[12px] tabular-nums text-muted-foreground mt-2">
                      {[wTrakcie.destination,
                        dniCel ? `${dniCel} ${odmiana(dniCel, 'dzień', 'dni', 'dni')}` : null,
                        wTrakcie.trip_type].filter(Boolean).join(' · ')}
                    </p>

                    {/* Trzy liczby w kolorach decyzji: szałwia „na pewno",
                        terakota „być może", wyszarzone odrzucone. */}
                    <div className="flex items-baseline gap-6 mt-5">
                      <span className="flex items-baseline gap-1.5">
                        <span className="font-display font-light text-[26px] tabular-nums text-primary">{p?.must ?? 0}</span>
                        <span className="text-[12px] text-muted-foreground">na pewno</span>
                      </span>
                      <span className="flex items-baseline gap-1.5">
                        <span className="font-display font-light text-[26px] tabular-nums text-accent">{p?.nice ?? 0}</span>
                        <span className="text-[12px] text-muted-foreground">być może</span>
                      </span>
                      <span className="flex items-baseline gap-1.5">
                        <span className="font-display font-light text-[26px] tabular-nums text-muted-foreground">{p?.rejected ?? 0}</span>
                        <span className="text-[12px] text-muted-foreground">odrzucone</span>
                      </span>
                    </div>

                    {/* Pasek mówi o PLANIE, nie o tablicy — zebranie miejsc to
                        jeszcze nie jest wyjazd, który da się przejść. */}
                    <div className="mt-auto pt-5">
                      <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                        <div className="h-full rounded-full bg-primary transition-[width]"
                             style={{ width: `${postep}%` }} />
                      </div>
                      <p className="font-mono text-[11px] tabular-nums text-muted-foreground mt-2">
                        {dniCel === 0
                          ? 'Bez ustawionej długości wyjazdu'
                          : dniGotowe === 0
                            ? `Planu jeszcze nie ma · ${dniCel} ${odmiana(dniCel, 'dzień', 'dni', 'dni')} do ułożenia`
                            : `Plan gotowy na dzień ${dniGotowe} z ${dniCel}`}
                      </p>
                    </div>
                  </div>
                </button>

                {/* Reszta: spokojna siatka trzech. Ostatnia komórka to kreska —
                    założenie wyjazdu jest częścią tej listy, nie osobnym ekranem. */}
                <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {reszta.map((w) => {
                    const q = podglad[w.id];
                    const ile = q?.ile ?? 0;
                    const dniW = dniPlanu[w.id] ?? 0;
                    const celW = w.days ?? 0;
                    const postepW = celW > 0 ? Math.min(100, Math.round((dniW / celW) * 100)) : 0;
                    return (
                      <button key={w.id} onClick={() => navigate(`/plany/${w.id}`)}
                        className="text-left rounded-md border border-border bg-card overflow-hidden
                                   shadow-token-sm hover:shadow-token-md transition-shadow flex flex-col">
                        <div className="h-[132px] bg-placeholder-photo overflow-hidden">
                          {q?.zdjecia?.[0] && (
                            <img src={miniatura(q.zdjecia[0], SZEROKOSC.kafelek)} alt="" loading="lazy" className="w-full h-full object-cover" />
                          )}
                        </div>
                        <div className="p-4 flex-1 flex flex-col">
                          <div className="font-display text-[17px] leading-snug truncate">{w.name}</div>
                          <div className="font-mono text-[11px] tabular-nums text-muted-foreground mt-1.5 truncate">
                            {[w.destination, ile > 0 ? `${ile} ${odmiana(ile, 'miejsce', 'miejsca', 'miejsc')}` : 'szkic']
                              .filter(Boolean).join(' · ')}
                          </div>
                          <div className="mt-auto pt-4">
                            <div className="h-1 rounded-full bg-muted overflow-hidden">
                              <div className="h-full rounded-full bg-primary" style={{ width: `${postepW}%` }} />
                            </div>
                          </div>
                        </div>
                      </button>
                    );
                  })}

                  <button onClick={() => navigate('/start')}
                    className="rounded-md border border-dashed border-border min-h-[248px]
                               flex flex-col items-center justify-center gap-2 text-muted-foreground
                               hover:border-foreground/30 hover:text-foreground transition-colors">
                    <Plus className="w-5 h-5" />
                    <span className="text-sm">Zacznij nowy wyjazd</span>
                  </button>
                </div>
              </>
            );
          })()}
          </>
        )}
      </main>
    </div>
  );
}
