import { useCallback, useEffect, useMemo, useState } from 'react';
import { miniatura, SZEROKOSC } from '@/lib/zdjecia';
import { useNavigate } from 'react-router-dom';
import { ArrowRight, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { apiPost } from '@/lib/api';
import { utworzWyjazd } from '@/lib/newTrip';
import { nazwaUzytkownika, inicjalyUzytkownika } from '@/lib/uzytkownik';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import PlannerHeader from '@/components/PlannerHeader';
import TablicaKafelek from '@/components/TablicaKafelek';
import { TRIP_PRESETS, EMPTY_AXES } from '@/lib/tripPresets';
import { useTranslation } from 'react-i18next';

type Priority = 'must' | 'nice' | 'rejected';

interface Project {
  id: string; name: string; destination: string | null; days: number | null;
  hours_per_day: number | null; trip_type: string | null; updated_at: string;
}
interface Place {
  id: string; project_id: string; name: string; priority: Priority;
  image_url: string | null; visit_minutes: number | null; opening_hours: string | null;
  catalog_id: string | null;
}
interface SavedPlan { project_id: string; start_date: string | null; plan: any; created_at: string }
interface PublicBoard {
  id: string; name: string; destination: string | null; days: number | null;
  author_display: string | null; copy_count: number; place_count: number;
  photos?: string[];
}

/** Pięć klimatów z projektu, w tej samej kolejności. */
const CLIMATES = ['family', 'couple', 'business', 'friends', 'solo'] as const;
const climateLabel = (id: string) =>
  id === 'solo' ? 'Solo' : TRIP_PRESETS.find((t) => t.id === id)?.label ?? id;

const MONTHS = ['stycznia', 'lutego', 'marca', 'kwietnia', 'maja', 'czerwca',
  'lipca', 'sierpnia', 'września', 'października', 'listopada', 'grudnia'];

/**
 * Termin wpisywany jednym polem, jak w projekcie. Rozpoznajemy kilka zapisów,
 * których ludzie faktycznie używają. Gdy żaden nie pasuje, wyjazd powstaje bez
 * dat jako szkic — to lepsze niż zgadywanie terminu albo blokowanie zapisu.
 */
function parseTerm(raw: string): { start: Date; days: number } | null {
  const t = raw.trim().toLowerCase().replace(/[–—]/g, '-');
  if (!t) return null;
  const year = new Date().getFullYear();

  // "12-14 września" albo "12 - 14 wrzesnia 2026"
  const slowny = t.match(/^(\d{1,2})\s*-\s*(\d{1,2})\s+([a-ząćęłńóśźż]+)\s*(\d{4})?$/);
  if (slowny) {
    const mi = MONTHS.findIndex((m) => m.startsWith(slowny[3].slice(0, 5)));
    if (mi >= 0) {
      const y = slowny[4] ? Number(slowny[4]) : year;
      const start = new Date(y, mi, Number(slowny[1]));
      const days = Number(slowny[2]) - Number(slowny[1]) + 1;
      if (days > 0 && days < 60) return { start, days };
    }
  }
  // "12.09-14.09" albo "12.09.2026 - 14.09.2026"
  const cyfry = t.match(/^(\d{1,2})[.\/](\d{1,2})(?:[.\/](\d{4}))?\s*-\s*(\d{1,2})[.\/](\d{1,2})(?:[.\/](\d{4}))?$/);
  if (cyfry) {
    const start = new Date(Number(cyfry[3] || year), Number(cyfry[2]) - 1, Number(cyfry[1]));
    const end = new Date(Number(cyfry[6] || cyfry[3] || year), Number(cyfry[5]) - 1, Number(cyfry[4]));
    const days = Math.round((end.getTime() - start.getTime()) / 86_400_000) + 1;
    if (days > 0 && days < 60) return { start, days };
  }
  return null;
}

const formatMinutes = (min: number) => {
  const h = Math.floor(min / 60), m = min % 60;
  return h && m ? `${h} g ${m} min` : h ? `${h} g` : `${m} min`;
};

const plural = (n: number, one: string, few: string, many: string) => {
  if (n === 1) return one;
  const l = n % 10, ll = n % 100;
  return l >= 2 && l <= 4 && (ll < 12 || ll > 14) ? few : many;
};

export default function Start() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [imie, setImie] = useState<string | null>(null);
  const [initials, setInitials] = useState<string | null>(null);
  const [projects, setProjects] = useState<Project[]>([]);
  const [places, setPlaces] = useState<Place[]>([]);
  const [plans, setPlans] = useState<SavedPlan[]>([]);
  const [boards, setBoards] = useState<PublicBoard[]>([]);
  const [copying, setCopying] = useState<string | null>(null);

  const [city, setCity] = useState('');
  const [term, setTerm] = useState('');
  const [climate, setClimate] = useState<string>('family');
  const [creating, setCreating] = useState(false);
  const [podglad, setPodglad] = useState<any[]>([]);
  const [zbieram, setZbieram] = useState(false);
  const [sprawdzone, setSprawdzone] = useState<string | null>(null);

  const load = useCallback(async () => {
    const { data: userData } = await supabase.auth.getUser();
    const u = userData.user;
    if (!u) { navigate('/auth'); return; }
    const nazwa = await nazwaUzytkownika();
    setImie(nazwa?.split(/\s+/)[0] ?? null);
    setInitials(await inicjalyUzytkownika());

    const [{ data: pr }, { data: pl }, { data: sp }] = await Promise.all([
      supabase.from('trip_projects')
        .select('id, name, destination, days, hours_per_day, trip_type, updated_at')
        .order('updated_at', { ascending: false }),
      supabase.from('trip_project_places')
        .select('id, project_id, name, priority, image_url, visit_minutes, opening_hours, catalog_id'),
      supabase.from('trip_plans')
        .select('project_id, start_date, plan, created_at')
        .order('created_at', { ascending: false }),
    ]);
    setProjects(pr ?? []);
    // Priorytet jest w bazie zwyklym tekstem; zawezamy go tutaj, zamiast
    // rzutowac cala tablice i zgadywac, ze kolumna trzyma tylko trzy wartosci.
    setPlaces((pl ?? []).map((r) => ({
      ...r,
      priority: (r.priority === 'must' || r.priority === 'rejected' ? r.priority : 'nice') as Priority,
    })));
    setPlans(sp ?? []);
    setLoading(false);

    // Publiczne tablice dobieramy pod kierunek aktywnego wyjazdu — cudza tablica
    // z innego kraju nie jest inspiracją, tylko szumem. Bez aktywnego wyjazdu
    // pokazujemy najczęściej kopiowane.
    const cel = (pr ?? [])[0]?.destination as string | undefined;
    let q = supabase.from('trip_projects')
      .select('id, name, destination, days, author_display, copy_count')
      .eq('is_public', true).neq('user_id', u.id)
      .order('copy_count', { ascending: false }).limit(3);
    if (cel) q = q.ilike('destination', `%${cel}%`);
    const { data: pubs } = await q;

    if (pubs?.length) {
      // Zdjęcia razem z liczeniem: kafelek bez ani jednego zdjęcia to trzy kolorowe
      // prostokąty, które wyglądają jak pusta tablica.
      const { data: cnt } = await supabase
        .from('trip_project_places').select('project_id, image_url')
        .in('project_id', pubs.map((b: any) => b.id));
      setBoards(pubs.map((b: any) => {
        const swoje = (cnt ?? []).filter((c: any) => c.project_id === b.id);
        return {
          ...b,
          place_count: swoje.length,
          photos: swoje.filter((c: any) => c.image_url).slice(0, 3).map((c: any) => c.image_url),
        };
      }));
    } else {
      setBoards([]);
    }
  }, [navigate]);

  useEffect(() => { load(); }, [load]);

  /**
   * Zamiar z landingu. Ktoś wpisał tam miasto i wybrał klimat, po czym musiał się
   * zalogować — bez tego przeniesienia trafiłby na pusty formularz i musiał wpisać
   * to samo drugi raz.
   */
  useEffect(() => {
    const raw = sessionStorage.getItem('rm_zamiar');
    if (!raw) return;
    sessionStorage.removeItem('rm_zamiar');
    (async () => {
      try {
        const { cel, klimat } = JSON.parse(raw);
        if (!cel) return;
        // Ktoś wpisał miasto na landingu i po drodze musiał się zalogować.
        // Dokończenie za niego jest sensem tego przeniesienia — wypełnione pole
        // i tak kazałoby kliknąć drugi raz to samo.
        await utworzWyjazd({ cel, klimat: klimat || 'family' });
        navigate('/odkrywaj?nowy=1');
      } catch { /* uszkodzony zapis albo nieudany zapis pomijamy */ }
    })();
  }, [navigate]);

  const active = projects[0] ?? null;
  const activePlaces = useMemo(
    () => places.filter((p) => p.project_id === active?.id),
    [places, active?.id]
  );
  const must = activePlaces.filter((p) => p.priority === 'must');
  const nice = activePlaces.filter((p) => p.priority === 'nice');
  const activePlan = useMemo(
    () => plans.find((p) => p.project_id === active?.id) ?? null,
    [plans, active?.id]
  );
  const daysPlanned = activePlan?.plan?.days?.length ?? 0;

  /** Ile dni do wyjazdu — liczone z daty startu ostatniego planu, bo projekt sam daty nie ma. */
  const countdown = useMemo(() => {
    if (!activePlan?.start_date) return null;
    const d = Math.ceil((new Date(activePlan.start_date).getTime() - Date.now()) / 86_400_000);
    return d > 0 ? d : null;
  }, [activePlan]);

  /**
   * Komunikat agenta z prawdziwych danych planu. Prototyp pokazuje tu zdanie
   * o przejazdach autem — takiej analizy nie mamy zapisanej, więc mówimy to,
   * co faktycznie wiemy, zamiast układać zdanie, które brzmi jak analiza.
   */
  const agentNote = useMemo(() => {
    if (!active) return null;
    if (!activePlan) {
      return must.length > 0
        ? `Masz ${must.length} ${plural(must.length, 'miejsce', 'miejsca', 'miejsc')} oznaczone „na pewno”. Wystarczy, żeby ułożyć z nich dni.`
        : 'Tablica jest pusta. Zacznij od kilku miejsc, które chcesz zobaczyć na pewno.';
    }
    const w = activePlan.plan?.warnings?.[0];
    if (w) return w;
    const items = (activePlan.plan?.days ?? []).flatMap((d: any) => d.items ?? []);
    const min = items.reduce((s: number, it: any) => s + (it.minutes || 0), 0);
    return `Plan na ${daysPlanned} ${plural(daysPlanned, 'dzień', 'dni', 'dni')} jest gotowy — ${items.length} ${
      plural(items.length, 'punkt', 'punkty', 'punktów')}, ${(min / 60).toFixed(1)} h zwiedzania.`;
  }, [active, activePlan, must.length, daysPlanned]);

  /** Zdanie przy nierozstrzygniętym miejscu — z jego własnych danych, nie z domysłu. */
  const decisionNote = (p: Place): string => {
    const okno = active?.hours_per_day ? Number(active.hours_per_day) : null;
    if (p.visit_minutes && okno && p.visit_minutes / 60 >= okno * 0.5) {
      return `Zajmie ${formatMinutes(p.visit_minutes)} z ${okno} h dnia — po nim zmieści się już niewiele.`;
    }
    if (p.opening_hours) {
      return `Godziny otwarcia: ${p.opening_hours}. Sprawdź, czy mieszczą się w Waszym oknie.`;
    }
    return 'Dopóki jest w „być może”, agent pomija to miejsce przy układaniu planu.';
  };

  const decide = async (p: Place, priority: Priority) => {
    setPlaces((prev) => prev.map((x) => (x.id === p.id ? { ...x, priority } : x)));
    const { error } = await supabase
      .from('trip_project_places').update({ priority }).eq('id', p.id);
    if (error) {
      setPlaces((prev) => prev.map((x) => (x.id === p.id ? { ...x, priority: 'nice' } : x)));
      toast.error(error.message);
    }
  };

  /**
   * Miejsca pokazujemy od razu po wpisaniu miasta, jeszcze przed założeniem wyjazdu.
   * Samo pole z nazwą miasta niczego nie dowodzi — dopóki nic się pod nim nie pojawia,
   * wpisanie destynacji wygląda jak wypełnianie formularza, a nie jak początek planowania.
   */
  useEffect(() => {
    const c = city.trim();
    if (c.length < 3) { setPodglad([]); setSprawdzone(null); return; }
    const t = setTimeout(async () => {
      const { data } = await supabase.from('place_catalog')
        .select('id, slug, name, city, kind, category, photos, visit_minutes')
        .ilike('city', `%${c}%`)
        .order('waznosc', { ascending: false, nullsFirst: false })
        .order('pin_count', { ascending: false }).limit(8);
      setPodglad(data ?? []);
      setSprawdzone(c);
    }, 400);
    return () => clearTimeout(t);
  }, [city]);

  const zbierzMiejsca = async () => {
    if (!city.trim()) return;
    setZbieram(true);
    try {
      const d = await apiPost<any>('/catalog/seed', { city: city.trim(), limit: 12 }, { timeoutMs: 180_000 });
      const { data } = await supabase.from('place_catalog')
        .select('id, slug, name, city, kind, category, photos, visit_minutes')
        .ilike('city', `%${d.city || city.trim()}%`)
        .order('waznosc', { ascending: false, nullsFirst: false })
        .order('pin_count', { ascending: false }).limit(8);
      setPodglad(data ?? []);
      toast.success(`Zebrałem ${d.added} miejsc w: ${d.city}`);
    } catch (e: any) {
      toast.error(e.message || 'Nie udało się zebrać miejsc');
    } finally {
      setZbieram(false);
    }
  };

  const startTrip = async () => {
    if (!city.trim()) return toast.error(t('start.podaj_miasto_lub_region'));
    setCreating(true);
    const parsed = parseTerm(term);
    const { data: userData } = await supabase.auth.getUser();
    if (!userData.user) { setCreating(false); return navigate('/auth'); }

    const label = climateLabel(climate).toLowerCase();
    const { data, error } = await supabase.from('trip_projects').insert({
      user_id: userData.user.id,
      name: `${city.trim()} ${label}`,
      destination: city.trim(),
      days: parsed?.days ?? null,
      trip_type: climate,
      ...(TRIP_PRESETS.find((t) => t.id === climate)?.axes ?? EMPTY_AXES),
    }).select('id').single();
    setCreating(false);
    if (error) return toast.error(error.message);

    if (term.trim() && !parsed) {
      toast.info(t('start.nie_rozpozna_em_terminu_wyjazd'));
    }
    navigate('/odkrywaj');
  };

  const copyBoard = async (b: PublicBoard) => {
    setCopying(b.id);
    const { data, error } = await supabase.rpc('copy_public_board', { p_source: b.id });
    setCopying(null);
    if (error) return toast.error(error.message);
    toast.success(`„${b.name}” trafiła do Twoich wyjazdów`);
    if (data) navigate(`/plany/${data}`);
    else load();
  };

  const statusOf = (p: Project): { label: string; variant: 'default' | 'outline' } => {
    if (p.id === active?.id) return { label: 'Aktywny', variant: 'default' };
    const plan = plans.find((s) => s.project_id === p.id);
    if (plan?.start_date && new Date(plan.start_date).getTime() < Date.now()) {
      return { label: 'Zakończony', variant: 'outline' };
    }
    const n = places.filter((x) => x.project_id === p.id).length;
    if (!p.days || n === 0) return { label: 'Szkic', variant: 'outline' };
    return { label: 'W toku', variant: 'outline' };
  };

  const metaOf = (p: Project): string => {
    const n = places.filter((x) => x.project_id === p.id).length;
    const plan = plans.find((s) => s.project_id === p.id);
    return [
      plan?.start_date
        ? new Date(plan.start_date).toLocaleDateString('pl-PL', { day: 'numeric', month: 'long', year: 'numeric' })
        : p.days ? `${p.days} ${plural(p.days, 'dzień', 'dni', 'dni')}` : 'bez terminu',
      `${n} ${plural(n, 'miejsce', 'miejsca', 'miejsc')}`,
      plan ? 'plan gotowy' : null,
    ].filter(Boolean).join(' · ');
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background">
        <PlannerHeader />
        <div className="flex items-center justify-center py-32 text-muted-foreground">
          <Loader2 className="w-5 h-5 animate-spin mr-2" /> Wczytuję…
        </div>
      </div>
    );
  }

  const noweWyjazdPanel = (
    <div className="rounded-md bg-foreground text-background p-7 flex flex-col">
      <p className="font-narrow uppercase tracking-[0.32em] text-[10px] text-primary-light">{t('start.nowy_wyjazd')}</p>
      <h2 className="font-display font-light text-[26px] leading-tight mt-2.5">{t('start.dokad_tym_razem')}</h2>

      <input value={city} onChange={(e) => setCity(e.target.value)} placeholder={t('start.miasto_lub_region')}
        className="mt-6 w-full rounded-sm bg-primary-foreground/[0.07] border border-primary-foreground/20
                   px-3.5 h-11 text-background placeholder:text-primary-foreground/45
                   focus:outline-none focus:border-primary-light transition-colors" />
      <input value={term} onChange={(e) => setTerm(e.target.value)} placeholder={t('start.termin_np_12_14_wrzesnia')}
        onKeyDown={(e) => e.key === 'Enter' && startTrip()}
        className="mt-3 w-full rounded-sm bg-primary-foreground/[0.07] border border-primary-foreground/20
                   px-3.5 h-11 text-background placeholder:text-primary-foreground/45
                   focus:outline-none focus:border-primary-light transition-colors" />

      <p className="font-narrow uppercase tracking-[0.18em] text-[10px] text-primary-foreground/60 mt-6">
        Klimat wyjazdu
      </p>
      <div className="flex flex-wrap gap-2 mt-2.5">
        {CLIMATES.map((id) => (
          <button key={id} onClick={() => setClimate(id)}
            className={`rounded-full px-3.5 py-1.5 text-[13px] border transition-colors ${
              climate === id
                ? 'bg-primary-light border-primary-light text-foreground'
                : 'border-primary-foreground/20 text-primary-foreground/80 hover:border-primary-foreground/40'
            }`}>
            {climateLabel(id)}
          </button>
        ))}
      </div>

      <button onClick={startTrip} disabled={creating}
        className="mt-7 w-full rounded-sm bg-primary-light text-foreground py-3 text-sm font-medium
                   hover:opacity-90 transition-opacity disabled:opacity-60 flex items-center justify-center gap-2">
        {creating ? <><Loader2 className="w-4 h-4 animate-spin" /> {t('start.zak_adam')}</> : <>{t('start.zacznij_planowac')} <ArrowRight className="w-4 h-4" /></>}
      </button>
      <p className="text-[12px] text-primary-foreground/70 mt-3 leading-relaxed">
        Agent zaproponuje pierwsze miejsca na podstawie klimatu i długości pobytu.
      </p>
    </div>
  );

  return (
    <div className="min-h-screen bg-background">
      <PlannerHeader
        context={active ? [active.destination, active.days ? `${active.days} dni` : null,
          active.trip_type ? climateLabel(active.trip_type).toLowerCase() : null].filter(Boolean).join(' · ') : null}
        initials={initials}
      />

      <main className="max-w-[1280px] mx-auto px-10 pt-10 pb-24">
        <div className="flex flex-wrap items-baseline justify-between gap-4">
          <h1 className="font-display font-light text-[34px] leading-none tracking-[-0.02em]">
            Dzień dobry{imie ? `, ${imie}` : ''}
          </h1>
          {countdown && active?.destination && (
            <p className="font-mono text-[12px] tabular-nums text-muted-foreground">
              Do wyjazdu do {active.destination} · {countdown} {plural(countdown, 'dzień', 'dni', 'dni')}
            </p>
          )}
        </div>

        {/* Nowy użytkownik: panel zakładania wyjazdu na pełną szerokość, bez reszty
            ekranu. To cały onboarding — nie ma sensu pokazywać pustych kart. */}
        {!active ? (
          <div className="mt-8 max-w-[640px]">{noweWyjazdPanel}</div>
        ) : (
          <div className="mt-8 grid lg:grid-cols-[minmax(0,1fr)_400px] gap-5 items-stretch">
            <div className="rounded-md bg-card border border-border p-7 flex flex-col">
              <p className="flex items-center gap-2.5">
                <span className="w-[7px] h-[7px] rounded-full bg-primary" />
                <span className="font-narrow uppercase tracking-[0.32em] text-[10px] text-muted-foreground">
                  {activePlan ? 'Plan gotowy' : 'Trwa planowanie'}
                </span>
              </p>
              <h2 className="font-display text-[30px] leading-tight mt-3">{active.name}</h2>
              <p className="font-mono text-[12px] tabular-nums text-muted-foreground mt-2">
                {[active.destination,
                  active.days ? `${active.days} ${plural(active.days, 'dzień', 'dni', 'dni')}` : null,
                  active.trip_type ? climateLabel(active.trip_type).toLowerCase() : null,
                ].filter(Boolean).join(' · ')}
              </p>

              <div className="grid grid-cols-3 border-y border-border mt-6">
                {[
                  ['Na pewno', String(must.length)],
                  ['Być może', String(nice.length)],
                  ['Dni ułożone', active.days ? `${daysPlanned} z ${active.days}` : String(daysPlanned)],
                ].map(([label, value], i) => (
                  <div key={label} className={`py-4 ${i > 0 ? 'border-l border-border pl-5' : ''}`}>
                    <div className="font-narrow uppercase tracking-[0.18em] text-[10px] text-muted-foreground">{label}</div>
                    <div className="font-mono text-[22px] tabular-nums mt-1">{value}</div>
                  </div>
                ))}
              </div>

              {must.length > 0 && (
                <div className="flex gap-2 mt-5">
                  {must.slice(0, 6).map((p) => (
                    <div key={p.id} title={p.name}
                      className="flex-1 h-14 rounded-sm bg-muted overflow-hidden">
                      {p.image_url && <img src={miniatura(p.image_url, SZEROKOSC.kafelek)} alt="" loading="lazy" className="w-full h-full object-cover" />}
                    </div>
                  ))}
                </div>
              )}

              {agentNote && (
                <div className="flex items-start gap-3 mt-5 rounded-md bg-muted px-4 py-3.5">
                  <span className="font-narrow uppercase tracking-[0.18em] text-[10px] text-muted-foreground
                                   border border-border rounded-full px-2.5 py-1 shrink-0 bg-background">
                    Agent
                  </span>
                  <p className="text-[14px] leading-relaxed text-foreground/85 text-pretty">{agentNote}</p>
                </div>
              )}

              <div className="flex flex-wrap gap-2.5 mt-auto pt-6">
                <Button onClick={() => navigate(`/plany/${active.id}${activePlan ? '?widok=plan' : ''}`)}
                  className="bg-foreground text-background hover:bg-foreground/90">
                  {activePlan ? 'Otwórz plan ↗' : 'Ułóż plan ↗'}
                </Button>
                <Button variant="outline" onClick={() => navigate('/odkrywaj')}>{t('start.dodaj_wiecej_miejsc')}</Button>
                <Button variant="ghost" onClick={() => navigate(`/plany/${active.id}`)}>{t('start.tablica')}</Button>
              </div>
            </div>

            {noweWyjazdPanel}
          </div>
        )}

        {/* Podgląd miejsc dla wpisywanej destynacji. Zapisanie któregoś wymaga wyjazdu,
            więc karty prowadzą do szczegółów, a zapisywanie zaczyna się dopiero
            w Odkrywaj — po założeniu wyjazdu przyciskiem obok. */}
        {city.trim().length >= 3 && (
          <section className="mt-5 rounded-md bg-card border border-border px-7 py-6">
            <div className="flex flex-wrap items-baseline justify-between gap-3">
              <h2 className="font-display text-[18px]">
                {podglad.length > 0 ? `Klasyki w: ${podglad[0].city ?? city.trim()}` : `Miejsca w: ${city.trim()}`}
              </h2>
              {podglad.length > 0 && (
                <span className="font-mono text-[12px] tabular-nums text-muted-foreground">
                  {podglad.length} z katalogu
                </span>
              )}
            </div>

            {podglad.length > 0 ? (
              <div className="mt-5 grid gap-3 [grid-template-columns:repeat(auto-fill,minmax(min(100%,168px),1fr))]">
                {podglad.map((m) => (
                  <button key={m.id} onClick={() => navigate(`/miejsce/${m.slug}`)}
                    className="text-left rounded-md border border-border bg-background overflow-hidden
                               hover:shadow-token-md transition-shadow">
                    <div className="h-[92px] bg-muted">
                      {m.photos?.[0] && (
                        <img src={miniatura(m.photos[0], SZEROKOSC.kafelek)} alt="" loading="lazy" className="w-full h-full object-cover" />
                      )}
                    </div>
                    <div className="p-2.5">
                      <div className="font-display text-[13px] leading-snug line-clamp-2">{m.name}</div>
                      {m.visit_minutes && (
                        <div className="font-mono text-[11px] tabular-nums text-muted-foreground mt-1">
                          {formatMinutes(m.visit_minutes)}
                        </div>
                      )}
                    </div>
                  </button>
                ))}
              </div>
            ) : sprawdzone === city.trim() ? (
              <div className="mt-4 flex flex-wrap items-center gap-4">
                <p className="text-[14px] text-muted-foreground text-pretty">
                  Nie mamy jeszcze miejsc dla tej destynacji. Mogę je zebrać — zajmie to kilkadziesiąt sekund.
                </p>
                <Button size="sm" onClick={zbierzMiejsca} disabled={zbieram}
                  className="bg-foreground text-background hover:bg-foreground/90">
                  {zbieram
                    ? <><Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> Zbieram…</>
                    : 'Zbierz miejsca'}
                </Button>
              </div>
            ) : (
              <p className="mt-4 text-[14px] text-muted-foreground flex items-center gap-2">
                <Loader2 className="w-4 h-4 animate-spin" /> Sprawdzam katalog…
              </p>
            )}
          </section>
        )}

        {active && (
          <section className="mt-5 rounded-md bg-card border border-border">
            <div className="flex items-start justify-between gap-4 px-7 pt-6 pb-5">
              <div>
                <h2 className="font-display text-[18px]">{t('start.wymaga_decyzji')}</h2>
                <p className="text-[13px] text-muted-foreground mt-1">
                  Miejsca w „być może” blokują agentowi ułożenie ostatecznej trasy.
                </p>
              </div>
              <button onClick={() => navigate(`/plany/${active.id}`)}
                className="text-[13px] text-muted-foreground hover:text-foreground transition-colors shrink-0">
                Cała tablica ↗
              </button>
            </div>

            {nice.length === 0 ? (
              <div className="border-t border-border px-7 py-12 text-center">
                <p className="text-[14px] text-muted-foreground text-balance">
                  Wszystko rozstrzygnięte. Agent ma komplet danych do ułożenia planu.
                </p>
              </div>
            ) : (
              <div className="border-t border-border grid md:grid-cols-2 lg:grid-cols-3">
                {nice.slice(0, 3).map((p, i) => (
                  <div key={p.id} className={`px-6 py-5 ${i > 0 ? 'lg:border-l border-border' : ''}`}>
                    <div className="flex items-start gap-3.5">
                      <div className="w-[52px] h-[52px] rounded-sm bg-muted shrink-0 overflow-hidden">
                        {p.image_url && <img src={miniatura(p.image_url, SZEROKOSC.kafelek)} alt="" loading="lazy" className="w-full h-full object-cover" />}
                      </div>
                      <div className="min-w-0">
                        <h3 className="font-display text-[16px] leading-snug">{p.name}</h3>
                        <p className="font-mono text-[11px] tabular-nums text-muted-foreground mt-1">
                          {p.visit_minutes ? formatMinutes(p.visit_minutes) : '—'}
                        </p>
                      </div>
                    </div>
                    <p className="text-[13px] leading-relaxed text-muted-foreground mt-3.5 text-pretty">
                      {decisionNote(p)}
                    </p>
                    <div className="flex gap-2 mt-4">
                      <Button size="sm" variant="outline" onClick={() => decide(p, 'must')}>{t('start.na_pewno')}</Button>
                      <Button size="sm" variant="outline" onClick={() => decide(p, 'rejected')}>{t('start.nie_tym_razem')}</Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
            {nice.length > 3 && (
              <div className="border-t border-border px-7 py-3.5 text-center">
                <button onClick={() => navigate(`/plany/${active.id}`)}
                  className="text-[13px] text-muted-foreground hover:text-foreground transition-colors">
                  Pokaż wszystkie ({nice.length}) ↗
                </button>
              </div>
            )}
          </section>
        )}

        {projects.length > 0 && (
          <div className="mt-10 grid lg:grid-cols-2 gap-5 items-start">
          <section>
            <div className="flex items-baseline justify-between gap-4">
              <h2 className="font-display text-[18px]">{t('start.twoje_wyjazdy')}</h2>
              <span className="font-mono text-[13px] tabular-nums text-muted-foreground">{projects.length}</span>
            </div>
            <div className="mt-4 grid gap-4 [grid-template-columns:repeat(auto-fill,minmax(min(100%,240px),1fr))]">
              {projects.map((p) => {
                const st = statusOf(p);
                const zdjecia = places
                  .filter((x) => x.project_id === p.id && x.image_url)
                  .slice(0, 3)
                  .map((x) => x.image_url);
                return (
                  <TablicaKafelek
                    key={p.id}
                    nazwa={p.name}
                    meta={metaOf(p)}
                    zdjecia={zdjecia}
                    aktywny={p.id === active?.id}
                    odznaka={<Badge variant={st.variant} className="shrink-0">{st.label}</Badge>}
                    onClick={() => navigate(`/plany/${p.id}`)}
                  />
                );
              })}
            </div>
          </section>

          {/* Tablice od podróżników. Pokazujemy je tylko wtedy, gdy ktoś naprawdę
              coś opublikował — pusta sekcja z zachętą sugerowałaby społeczność,
              której jeszcze nie ma. */}
          {boards.length > 0 && (
            <section>
              <div className="flex items-baseline justify-between gap-4">
                <h2 className="font-display text-[18px]">{t('start.tablice_od_podroznikow')}</h2>
                {active?.destination && (
                  <span className="text-[13px] text-muted-foreground">{active.destination}</span>
                )}
              </div>
              <div className="mt-4 grid gap-4 [grid-template-columns:repeat(auto-fill,minmax(min(100%,240px),1fr))]">
                {boards.map((b) => (
                  <TablicaKafelek
                    key={b.id}
                    nazwa={b.name}
                    meta={[`${b.place_count} ${plural(b.place_count, 'miejsce', 'miejsca', 'miejsc')}`,
                      b.copy_count > 0
                        ? `${b.copy_count} ${plural(b.copy_count, 'kopia', 'kopie', 'kopii')}`
                        : null].filter(Boolean).join(' · ')}
                    zdjecia={b.photos ?? []}
                    autor={b.author_display || 'Podróżnik'}
                    akcja={
                      <Button size="sm" variant="outline" disabled={copying === b.id}
                        onClick={() => copyBoard(b)}>
                        {copying === b.id
                          ? <><Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> {t('start.kopiuje')}</>
                          : 'Skopiuj'}
                      </Button>
                    }
                  />
                ))}
              </div>
            </section>
          )}
          </div>
        )}
      </main>
    </div>
  );
}
