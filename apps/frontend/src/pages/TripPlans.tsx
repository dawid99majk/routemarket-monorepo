import { useCallback, useEffect, useState } from 'react';
import { Skeleton } from '@/components/ui/skeleton';
import Zdjecie from '@/components/Zdjecie';
import { zakresDat } from '@/lib/daty';
import { useNavigate, useParams } from 'react-router-dom';
import { Loader2, Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import PlannerHeader from '@/components/PlannerHeader';
import TripProjects from '@/components/TripProjects';
import { inicjalyUzytkownika } from '@/lib/uzytkownik';

interface Wyjazd {
  id: string; name: string; destination: string | null; days: number | null;
  trip_type: string | null; updated_at: string; created_at: string;
  /** Publiczny przykład RouteMarket, nie prywatny wyjazd -- kosz się dla niego nie pokazuje. */
  is_example: boolean | null;
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

  const [doUsuniecia, setDoUsuniecia] = useState<Wyjazd | null>(null);
  const [usuwanie, setUsuwanie] = useState(false);

  const usunWyjazd = async () => {
    if (!doUsuniecia) return;
    setUsuwanie(true);
    const { error } = await supabase.from('trip_projects').delete().eq('id', doUsuniecia.id);
    setUsuwanie(false);
    if (error) { toast.error(error.message); return; }
    setWyjazdy((prev) => prev.filter((w) => w.id !== doUsuniecia.id));
    toast.success(`Usunięto „${doUsuniecia.name}"`);
    setDoUsuniecia(null);
  };

  useEffect(() => { (async () => setInitials(await inicjalyUzytkownika()))(); }, []);

  // Ostatnio otwarta tablica: zakładki w pasku mają wracać tam, gdzie się skończyło.
  useEffect(() => { if (id) localStorage.setItem('rm_ostatnia_tablica', id); }, [id]);

  const wczytajListe = useCallback(async () => {
    setLadowanie(true);
    const { data } = await supabase
      .from('trip_projects')
      .select('id, name, destination, days, trip_type, updated_at, created_at, start_date, end_date, is_example')
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
          <div className="mt-8" aria-busy="true" aria-label="Wczytuję wyjazdy">
            <Skeleton className="h-[190px] w-full rounded-2xl" />
            <div className="mt-8 rounded-2xl bg-card border border-border/60 p-6 sm:p-8">
              <div className="flex items-baseline justify-between gap-3">
                <Skeleton className="h-4 w-28 rounded-full" />
                <Skeleton className="h-4 w-40 rounded-full" />
              </div>
              <div className="mt-6 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
                {[0, 1, 2].map((i) => (
                  <div key={i} className="rounded-2xl border border-border/60 bg-card overflow-hidden">
                    <Skeleton className="h-[170px] w-full rounded-none" />
                    <div className="p-4 space-y-2.5">
                      <Skeleton className="h-5 w-3/4 rounded-md" />
                      <Skeleton className="h-3 w-1/2 rounded-md" />
                      <Skeleton className="h-1 w-full mt-3 rounded-full" />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
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
            const ileW = p?.ile ?? 0;
            const dniCel = wTrakcie.days ?? 0;
            const postep = dniCel > 0 ? Math.min(100, Math.round((dniGotowe / dniCel) * 100)) : 0;
            return (
              <>
                {/* Wyjazd w trakcie: elegancki, wyniesiony ponad tło */}
                <div className="relative group mt-8 rounded-2xl border border-border bg-card overflow-hidden
                                 shadow-sm hover:shadow-md transition-all duration-300">
                {!wTrakcie.is_example && (
                  <button onClick={(e) => { e.stopPropagation(); setDoUsuniecia(wTrakcie); }}
                    aria-label="Usuń wyjazd"
                    className="absolute top-3 right-3 z-10 w-8 h-8 rounded-full bg-background/80 backdrop-blur-sm
                               flex items-center justify-center text-muted-foreground opacity-70
                               hover:opacity-100 hover:text-destructive transition-opacity shadow-xs">
                    <Trash2 className="w-4 h-4" />
                  </button>
                )}
                <button onClick={() => navigate(`/plany/${wTrakcie.id}`)}
                  className="w-full text-left flex flex-col sm:flex-row">
                  <div className="w-full sm:w-[260px] h-[190px] shrink-0 bg-muted overflow-hidden">
                    {p?.zdjecia?.[0] ? (
                      <Zdjecie src={p.zdjecia[0]} gdzie="kafelek" alt="" className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
                    ) : (
                      <div className="w-full h-full flex flex-col items-center justify-center bg-gradient-to-br from-primary/10 via-muted/40 to-accent/10 text-muted-foreground">
                        <span className="text-xs font-mono uppercase tracking-wider text-muted-foreground/70">W trakcie</span>
                      </div>
                    )}
                  </div>
                  <div className="flex-1 min-w-0 p-5 sm:p-6 flex flex-col justify-between">
                    <div>
                      <p className="font-narrow uppercase tracking-[0.22em] text-[10.5px] font-semibold text-primary">
                        W trakcie układania
                      </p>
                      <h2 className="font-display font-semibold text-[24px] sm:text-[26px] leading-[1.15] tracking-tight mt-1 truncate group-hover:text-primary transition-colors">
                        {wTrakcie.name}
                      </h2>
                      <p className="font-mono text-[12px] tabular-nums text-muted-foreground mt-1.5">
                        {[
                          (wTrakcie as any).start_date
                            ? zakresDat((wTrakcie as any).start_date, (wTrakcie as any).end_date)
                            : null,
                          ileW > 0 ? `${ileW} ${odmiana(ileW, 'miejsce', 'miejsca', 'miejsc')}` : 'pusta tablica',
                          wTrakcie.trip_type,
                        ].filter(Boolean).join(' · ')}
                      </p>
                    </div>

                    <div className="flex items-baseline gap-5 mt-3">
                      <span className="flex items-baseline gap-1.5">
                        <span className="font-display font-semibold text-[22px] tabular-nums text-primary">{p?.must ?? 0}</span>
                        <span className="text-[11.5px] text-muted-foreground">na pewno</span>
                      </span>
                      <span className="flex items-baseline gap-1.5">
                        <span className="font-display font-semibold text-[22px] tabular-nums text-accent">{p?.nice ?? 0}</span>
                        <span className="text-[11.5px] text-muted-foreground">być może</span>
                      </span>
                      <span className="flex items-baseline gap-1.5">
                        <span className="font-display font-semibold text-[22px] tabular-nums text-muted-foreground">{p?.rejected ?? 0}</span>
                        <span className="text-[11.5px] text-muted-foreground">odrzucone</span>
                      </span>
                    </div>

                    <div className="mt-3 pt-3 border-t border-border/50">
                      {dniCel > 0 ? (
                        <div className="flex gap-1">
                          {Array.from({ length: dniCel }).map((_, i) => (
                            <span key={i} className={`h-1.5 flex-1 rounded-full ${
                              i < dniGotowe ? 'bg-primary' : 'bg-muted'}`} />
                          ))}
                        </div>
                      ) : (
                        <div className="h-1.5 rounded-full bg-muted" />
                      )}
                      <p className="font-mono text-[11px] tabular-nums text-muted-foreground mt-1.5">
                        {dniCel === 0
                          ? 'Bez ustawionej długości wyjazdu'
                          : dniGotowe === 0
                            ? `Planu jeszcze nie ma · ${dniCel} ${odmiana(dniCel, 'dzień', 'dni', 'dni')} do ułożenia`
                            : `Plan gotowy na dzień ${dniGotowe} z ${dniCel}`}
                      </p>
                    </div>
                  </div>
                </button>
                </div>

                {/* Reszta: zbalansowana siatka z wyraźną przestrzenną elewacją */}
                <div className="mt-12">
                {reszta.length > 0 && (() => {
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
                    <div className="flex flex-wrap items-baseline justify-between gap-3 pb-3 mb-6 border-b border-border">
                      <span className="font-narrow uppercase tracking-[0.2em] text-[11px] font-semibold text-foreground/80">
                        Pozostałe tablice · {reszta.length}
                      </span>
                      <span className="font-mono text-[11px] tabular-nums text-muted-foreground">
                        {czesci.join(' · ')}
                      </span>
                    </div>
                  );
                })()}
                <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
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
                      <div key={w.id} className="relative group rounded-2xl border border-border bg-card overflow-hidden
                                                  shadow-sm hover:shadow-xl hover:border-primary/50 hover:-translate-y-1 transition-all duration-300 flex flex-col">
                      {!w.is_example && (
                        <button onClick={(e) => { e.stopPropagation(); setDoUsuniecia(w); }}
                          aria-label="Usuń wyjazd"
                          className="absolute top-2.5 right-2.5 z-10 w-7 h-7 rounded-full bg-background/80 backdrop-blur-sm
                                     flex items-center justify-center text-muted-foreground opacity-70
                                     hover:opacity-100 hover:text-destructive transition-opacity shadow-xs">
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                      <button onClick={() => navigate(`/plany/${w.id}`)}
                        className="text-left flex flex-col flex-1">
                        <div className="relative h-[160px] bg-muted overflow-hidden">
                          {zdjeciaW.length >= 3 ? (
                            <div className="grid grid-cols-[2fr_1fr] grid-rows-2 gap-0.5 h-full">
                              {zdjeciaW.slice(0, 3).map((z, i) => (
                                <div key={i} className={`relative overflow-hidden bg-muted ${i === 0 ? 'row-span-2' : ''}`}>
                                  <Zdjecie src={z} gdzie="kafelek" alt=""
                                    className="w-full h-full object-cover" />
                                  {i === 2 && ile > 3 && (
                                    <span className="absolute right-1.5 bottom-1.5 rounded-full bg-background/85 backdrop-blur-sm px-1.5 py-0.5
                                                     font-mono text-[10px] tabular-nums text-foreground shadow-xs">
                                      +{ile - 3}
                                    </span>
                                  )}
                                </div>
                              ))}
                            </div>
                          ) : zdjeciaW[0] ? (
                            <Zdjecie src={zdjeciaW[0]} gdzie="kafelek" alt=""
                              className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
                          ) : (
                            <div className="w-full h-full flex flex-col items-center justify-center bg-gradient-to-br from-primary/10 via-muted/30 to-accent/10 text-muted-foreground">
                              <span className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground/70">Tablica</span>
                            </div>
                          )}
                          <span className="absolute left-2.5 bottom-2.5 bg-background/85 backdrop-blur-md
                                           px-2.5 py-0.5 rounded-full font-medium text-[10.5px] text-foreground shadow-xs border border-white/20">
                            {etapW}
                          </span>
                        </div>

                        <div className="p-4 flex-1 flex flex-col justify-between">
                          <div>
                            <div className="font-display text-[16.5px] font-semibold leading-snug truncate group-hover:text-primary transition-colors">{w.name}</div>
                            <div className="font-mono text-[11px] tabular-nums text-muted-foreground mt-1 truncate">
                              {[w.destination, terminW,
                                ile > 0 ? `${ile} ${odmiana(ile, 'miejsce', 'miejsca', 'miejsc')}` : 'szkic']
                                .filter(Boolean).join(' · ')}
                            </div>
                          </div>

                          <div className="border-t border-border/50 mt-3 pt-2.5">
                            <div className="flex items-baseline gap-3.5">
                              <span className="flex items-baseline gap-1">
                                <span className="font-display font-semibold text-[17px] text-primary tabular-nums">{q?.must ?? 0}</span>
                                <span className="text-[11px] text-muted-foreground">na pewno</span>
                              </span>
                              <span className="flex items-baseline gap-1">
                                <span className="font-display font-semibold text-[17px] text-accent tabular-nums">{q?.nice ?? 0}</span>
                                <span className="text-[11px] text-muted-foreground">być może</span>
                              </span>
                            </div>
                          </div>

                          <div className="mt-2.5 pt-2 border-t border-border/40">
                            {celW > 0 ? (
                              <>
                                <div className="flex gap-1">
                                  {Array.from({ length: celW }).map((_, i) => (
                                    <span key={i} className={`h-1 flex-1 rounded-full ${
                                      i < dniW ? 'bg-primary' : 'bg-muted'}`} />
                                  ))}
                                </div>
                                <p className="font-mono text-[10.5px] tabular-nums text-muted-foreground mt-1.5 truncate">
                                  {dniW === 0
                                    ? 'Plan jeszcze nie ułożony'
                                    : dniW >= celW
                                      ? `Plan gotowy (${celW} dni)`
                                      : `Plan: dzień ${dniW} z ${celW}`}
                                </p>
                              </>
                            ) : (
                              <span className="font-mono text-[11px] text-primary">
                                Ułóż plan ↗
                              </span>
                            )}
                          </div>
                        </div>
                      </button>
                      </div>
                    );
                  })}
                  <button
                    onClick={() => navigate('/start')}
                    className="rounded-2xl border-2 border-dashed border-border/80 min-h-[280px]
                               flex flex-col items-center justify-center gap-2.5 text-muted-foreground
                               hover:border-primary/50 hover:text-primary transition-all duration-300 group bg-muted/20"
                  >
                    <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center text-primary group-hover:scale-110 transition-transform">
                      <Plus className="w-5 h-5" />
                    </div>
                    <span className="text-sm font-medium">Zacznij nowy wyjazd</span>
                  </button>
                </div>
                </div>
              </>
            );
          })()}
          </>
        )}
      </main>

      {/* Skutek usunięcia wypisany wprost, z prawdziwą liczbą -- "czy na pewno"
          bez konkretów nie mówi nic o tym, co się właśnie traci. */}
      <AlertDialog open={!!doUsuniecia} onOpenChange={(o) => !o && setDoUsuniecia(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Usunąć „{doUsuniecia?.name}"?</AlertDialogTitle>
            <AlertDialogDescription>
              {(() => {
                const ile = doUsuniecia ? (podglad[doUsuniecia.id]?.ile ?? 0) : 0;
                const maPlan = doUsuniecia ? (dniPlanu[doUsuniecia.id] ?? 0) > 0 : false;
                return `Zniknie ${ile > 0 ? `${ile} ${odmiana(ile, 'przypięte miejsce', 'przypięte miejsca', 'przypiętych miejsc')}` : 'pusta tablica'}${maPlan ? ' i ułożony plan dni' : ''}. Tego nie da się cofnąć.`;
              })()}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={usuwanie}>Zostaw</AlertDialogCancel>
            <AlertDialogAction onClick={usunWyjazd} disabled={usuwanie}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              {usuwanie ? 'Usuwam…' : 'Usuń'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
