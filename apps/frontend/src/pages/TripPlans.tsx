import { useCallback, useEffect, useState } from 'react';
import { miniatura, SZEROKOSC } from '@/lib/zdjecia';
import { zakresDat } from '@/lib/daty';
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
      .select('id, name, destination, days, trip_type, updated_at, created_at, start_date, end_date')
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
                {/* Własne pole dla siatki: bez niego „pozostałe" zlewały się
                    z kartą wyjazdu w trakcie stojącą wyżej. */}
                <div className="mt-10 rounded-md bg-surface/70 border border-border/40 p-6 sm:p-8">
                {reszta.length > 0 && (() => {
                  // Rozkład etapów liczony raz, dla nagłówka. Ta sama reguła co
                  // na kartach, więc liczby nad siatką zgadzają się z etykietami w niej.
                  const etap = (w: any) => {
                    const cel = w.days ?? 0;
                    const dni = dniPlanu[w.id] ?? 0;
                    if (cel === 0 || dni === 0) return 'miejsca';
                    return dni >= cel ? 'gotowy' : 'uklada';
                  };
                  const gotowe = reszta.filter((w) => etap(w) === 'gotowy').length;
                  const ukladane = reszta.filter((w) => etap(w) === 'uklada').length;
                  const miejsca = reszta.filter((w) => etap(w) === 'miejsca').length;
                  const czesci = [
                    gotowe ? `${gotowe} ${odmiana(gotowe, 'gotowy', 'gotowe', 'gotowych')}` : null,
                    ukladane ? `${ukladane} w układaniu` : null,
                    miejsca ? `${miejsca} ${odmiana(miejsca, 'bez planu', 'bez planu', 'bez planu')}` : null,
                  ].filter(Boolean);
                  return (
                    <div className="flex flex-wrap items-baseline justify-between gap-3">
                      <span className="font-narrow uppercase tracking-[0.18em] text-[11px] text-muted-foreground">
                        Pozostałe · {reszta.length}
                      </span>
                      <span className="font-mono text-[11px] tabular-nums text-muted-foreground">
                        {czesci.join(' · ')}
                      </span>
                    </div>
                  );
                })()}
                <div className="mt-5 grid gap-7 sm:grid-cols-2 lg:grid-cols-3">
                  {reszta.map((w) => {
                    const q = podglad[w.id];
                    const ile = q?.ile ?? 0;
                    const dniW = dniPlanu[w.id] ?? 0;
                    const celW = w.days ?? 0;
                    const zdjeciaW = (q?.zdjecia ?? []).filter(Boolean);
                    const terminW = (w as any).start_date
                      ? zakresDat((w as any).start_date, (w as any).end_date)
                      : celW > 0 ? `${celW} ${odmiana(celW, 'dzień', 'dni', 'dni')}` : 'bez dat';
                    const etapW = celW === 0
                      ? 'Same miejsca'
                      : dniW === 0 ? 'Same miejsca'
                        : dniW >= celW ? 'Plan gotowy' : 'W układaniu';
                    return (
                      <button key={w.id} onClick={() => navigate(`/plany/${w.id}`)}
                        className="text-left rounded-md border border-border bg-card overflow-hidden
                                   shadow-token-sm hover:shadow-token-md transition-shadow flex flex-col">
                        {/* Mozaika tylko wtedy, gdy ma z czego: poniżej trzech zdjęć
                            małe pola robią się skrawkami przy karcie ~300 px. */}
                        <div className="relative h-[248px] bg-placeholder-photo">
                          {zdjeciaW.length >= 3 ? (
                            <div className="grid grid-cols-[2fr_1fr] grid-rows-2 gap-0.5 h-full">
                              {zdjeciaW.slice(0, 3).map((z, i) => (
                                <div key={i} className={`relative overflow-hidden bg-placeholder-photo ${i === 0 ? 'row-span-2' : ''}`}>
                                  <img src={miniatura(z, SZEROKOSC.kafelek)} alt="" loading="lazy"
                                    className="w-full h-full object-cover" />
                                  {i === 2 && ile > 3 && (
                                    <span className="absolute right-1.5 bottom-1.5 rounded-sm bg-ink/70 px-1.5 py-0.5
                                                     font-mono text-[11px] tabular-nums text-background">
                                      +{ile - 3}
                                    </span>
                                  )}
                                </div>
                              ))}
                            </div>
                          ) : (
                            zdjeciaW[0] && (
                              <img src={miniatura(zdjeciaW[0], SZEROKOSC.kafelek)} alt="" loading="lazy"
                                className="w-full h-full object-cover" />
                            )
                          )}
                          {/* Etap wyjazdu na zdjęciu — z listy widać, gdzie się skończyło,
                              bez wchodzenia w każdą tablicę po kolei. */}
                          <span className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-ink/70 to-transparent
                                           px-3 pt-6 pb-2 font-narrow uppercase tracking-[0.18em]
                                           text-[10px] text-background">
                            {etapW}
                          </span>
                        </div>

                        <div className="p-5 flex-1 flex flex-col">
                          <div className="font-display text-[20px] leading-snug truncate">{w.name}</div>
                          <div className="font-mono text-[11px] tabular-nums text-muted-foreground mt-1.5 truncate">
                            {[w.destination, terminW,
                              ile > 0 ? `${ile} ${odmiana(ile, 'miejsce', 'miejsca', 'miejsc')}` : 'szkic']
                              .filter(Boolean).join(' · ')}
                          </div>

                          <div className="border-t border-border/60 mt-3.5 pt-3.5">
                            <div className="flex items-baseline gap-4">
                              <span className="flex items-baseline gap-1.5">
                                <span className="font-display text-[22px] text-primary tabular-nums">{q?.must ?? 0}</span>
                                <span className="text-[12px] text-muted-foreground">na pewno</span>
                              </span>
                              <span className="flex items-baseline gap-1.5">
                                <span className="font-display text-[22px] text-accent tabular-nums">{q?.nice ?? 0}</span>
                                <span className="text-[12px] text-muted-foreground">być może</span>
                              </span>
                            </div>
                          </div>

                          <div className="mt-auto pt-3.5">
                            {celW > 0 ? (
                              <>
                                {/* Pasek dzielony na dni, nie ciągły procent: „dzień 1 z 2"
                                    to jednostka, w której plan naprawdę powstaje. */}
                                <div className="flex gap-1">
                                  {Array.from({ length: celW }).map((_, i) => (
                                    <span key={i} className={`h-1 flex-1 rounded-full ${
                                      i < dniW ? 'bg-primary' : 'bg-muted'}`} />
                                  ))}
                                </div>
                                <p className="font-mono text-[11px] tabular-nums text-muted-foreground mt-2">
                                  {dniW === 0
                                    ? 'Plan jeszcze nie ułożony'
                                    : dniW >= celW
                                      ? `Plan gotowy na ${celW === 2 ? 'oba dni' : `wszystkie ${celW} dni`}`
                                      : `Plan gotowy na dzień ${dniW} z ${celW}`}
                                </p>
                              </>
                            ) : (
                              <span className="font-mono text-[11px] text-primary underline underline-offset-4
                                               decoration-primary/40">
                                Ułóż plan dni
                              </span>
                            )}
                          </div>
                        </div>
                      </button>
                    );
                  })}

                  <button onClick={() => navigate('/start')}
                    className="rounded-md border border-dashed border-border min-h-[420px]
                               flex flex-col items-center justify-center gap-2 text-muted-foreground
                               hover:border-foreground/30 hover:text-foreground transition-colors">
                    <Plus className="w-5 h-5" />
                    <span className="text-sm">Zacznij nowy wyjazd</span>
                  </button>
                </div>
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
