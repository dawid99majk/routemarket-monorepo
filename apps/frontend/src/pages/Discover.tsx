import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowUpRight, Heart, Loader2, MapPin, Search, Sparkles } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import PlannerHeader from '@/components/PlannerHeader';
import { apiPost } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';

interface CatalogPlace {
  id: string;
  slug: string;
  name: string;
  city: string | null;
  lat: number;
  lng: number;
  category: string;
  kind: string | null;
  description: string;
  photos: string[];
  opening_hours: string | null;
  visit_minutes: number | null;
  vibe_tags: string[];
  pin_count: number;
}

type Bucket = 'must' | 'nice' | 'rejected';

/** Pigułki filtrów feedu — logika wprost z dokumentu przekazania projektu. */
const FILTERS = [
  { id: 'all',    label: 'Wszystko' },
  { id: 'kids',   label: 'Z dziećmi' },
  { id: 'short',  label: 'Do 1 godziny' },
  { id: 'walk',   label: 'Pieszo od bazy' },
  { id: 'rain',   label: 'Na deszcz' },
] as const;
type FilterId = typeof FILTERS[number]['id'];

const KIDS_TAGS = ['dla-dzieci', 'zielone', 'nadwodne', 'spacerowe'];
const RAIN_KINDS = ['museum', 'gallery', 'attraction', 'theatre'];

/** Czas zwiedzania w formacie z projektu: „1 g 30 min". */
function formatDuration(min: number | null): string | null {
  if (!min) return null;
  const h = Math.floor(min / 60);
  const m = min % 60;
  if (h && m) return `${h} g ${m} min`;
  if (h) return `${h} g`;
  return `${m} min`;
}

/**
 * Wysokość zdjęcia w mozaice. Projekt zakłada zakres 160–260 px i wprost nazywa
 * zróżnicowanie celowym — to ono daje rytm feedu. Liczymy ją deterministycznie
 * z identyfikatora, żeby karta nie skakała przy każdym przerysowaniu.
 */
function photoHeight(id: string): number {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) % 1000;
  return 160 + (h % 5) * 25;
}

/** Odmiana po liczbie: 1 popołudnie, 2-4 popołudnia, 5+ i „kilka" popołudni. */
function popoludnia(n: number | null | undefined): string {
  if (n == null) return 'popołudni';
  if (n === 1) return 'popołudnie';
  const j = n % 10, d = n % 100;
  return j >= 2 && j <= 4 && (d < 12 || d > 14) ? 'popołudnia' : 'popołudni';
}

export default function Discover() {
  const navigate = useNavigate();
  const [city, setCity] = useState('');
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<FilterId>('all');
  const [places, setPlaces] = useState<CatalogPlace[]>([]);
  const [loading, setLoading] = useState(true);
  const [seeding, setSeeding] = useState(false);
  const [favorites, setFavorites] = useState<Set<string>>(new Set());
  const [boards, setBoards] = useState<{ id: string; name: string; destination: string; days: number | null }[]>([]);
  const [activeBoard, setActiveBoard] = useState<string | null>(null);
  const [marks, setMarks] = useState<Record<string, Bucket>>({});
  const [cities, setCities] = useState<string[]>([]);
  const [initials, setInitials] = useState<string | null>(null);
  const [zbieraneSekundy, setZbieraneSekundy] = useState(0);
  const [opisyWToku, setOpisyWToku] = useState(false);
  /** Ile kart pokazujemy. Rośnie przy przewijaniu, nie przy każdym zapytaniu. */
  const [ileWidocznych, setIleWidocznych] = useState(24);
  const wartownik = useRef<HTMLDivElement | null>(null);
  /** Miasta, dla których zbieranie już ruszyło — żeby nie powtórzyć go w kółko. */
  const proboweane = useRef<Set<string>>(new Set());

  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getUser();
      const pelne = (data.user?.user_metadata as any)?.full_name as string | undefined;
      setInitials(pelne
        ? pelne.split(/\s+/).slice(0, 2).map((c) => c[0]).join('').toUpperCase()
        : (data.user?.email ?? '').slice(0, 2).toUpperCase() || null);
    })();
  }, []);

  const board = boards.find((b) => b.id === activeBoard) ?? null;

  useEffect(() => {
    if (!seeding) { setZbieraneSekundy(0); return; }
    const t = setInterval(() => setZbieraneSekundy((n) => n + 1), 1000);
    return () => clearInterval(t);
  }, [seeding]);

  /**
   * Miasto dopasowujemy zawierając, nie na równość. Wpisane "nowy york" nigdy nie
   * zrówna się z "New York", które zapisuje geokoder — a to była przyczyna pustej
   * listy po wyszukaniu: rekordy powstawały, tylko filtr ich nie widział.
   *
   * Nazwę można podać wprost, bo po zasianiu znamy postać znormalizowaną wcześniej,
   * niż stan zdąży się odświeżyć.
   */
  const loadSeq = useRef(0);

  const load = useCallback(async (cityOverride?: string) => {
    const c = (cityOverride ?? city).trim();
    const seq = ++loadSeq.current;
    setLoading(true);
    let q = (supabase as any).from('place_catalog').select('*').limit(Math.max(60, ileWidocznych + 24));
    if (c) q = q.ilike('city', `%${c}%`);
    const { data } = await q.order('pin_count', { ascending: false }).order('created_at', { ascending: false });
    // Odpowiedź starszego zapytania nie może nadpisać nowszego. To była przyczyna
    // pustej listy po wyszukaniu: wpisanie "nowy york" wysyłało dziewięć zapytań,
    // po jednym na znak, a wracały w dowolnej kolejności. Wynik dla "nowy yor"
    // potrafił dotrzeć po wyniku dla pełnej nazwy i wyczyścić listę. Odświeżenie
    // strony pomagało, bo puszczało jedno zapytanie zamiast dziewięciu.
    if (seq !== loadSeq.current) return;
    setPlaces(data ?? []);
    setLoading(false);
  }, [city, ileWidocznych]);

  // Odpytujemy po chwili przerwy w pisaniu, a nie po każdym znaku.
  useEffect(() => {
    const t = setTimeout(() => { load(); }, 300);
    return () => clearTimeout(t);
  }, [load]);

  useEffect(() => {
    (async () => {
      const { data: userData } = await supabase.auth.getUser();
      if (!userData.user) return;
      const [{ data: favs }, { data: projs }, { data: allCities }] = await Promise.all([
        (supabase as any).from('place_favorites').select('place_id').eq('user_id', userData.user.id),
        (supabase as any).from('trip_projects').select('id, name, destination, days').order('updated_at', { ascending: false }),
        (supabase as any).from('place_catalog').select('city').not('city', 'is', null).limit(500),
      ]);
      setFavorites(new Set((favs ?? []).map((f: any) => f.place_id)));
      setBoards(projs ?? []);
      setCities([...new Set((allCities ?? []).map((r: any) => r.city))].sort() as string[]);
      if ((projs ?? []).length > 0) {
        setActiveBoard(projs[0].id);
        if (!city.trim() && projs[0].destination) setCity(projs[0].destination);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** Kubełki bieżącej tablicy — sterują podświetleniem przycisków w stopce karty. */
  useEffect(() => {
    if (!activeBoard) { setMarks({}); return; }
    (async () => {
      const { data } = await (supabase as any)
        .from('trip_project_places').select('catalog_id, priority').eq('project_id', activeBoard);
      const next: Record<string, Bucket> = {};
      for (const row of data ?? []) if (row.catalog_id) next[row.catalog_id] = row.priority as Bucket;
      setMarks(next);
    })();
  }, [activeBoard]);

  /** Filtrowanie na bieżąco, filtr i wyszukiwarka działają łącznie. */
  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return places.filter((p) => {
      if (q && !(`${p.name} ${p.kind ?? ''} ${p.description}`.toLowerCase().includes(q))) return false;
      if (filter === 'kids')  return (p.vibe_tags ?? []).some((t) => KIDS_TAGS.includes(t));
      if (filter === 'short') return (p.visit_minutes ?? 999) <= 60;
      if (filter === 'walk')  return true;
      if (filter === 'rain')  return RAIN_KINDS.includes((p.kind ?? '').toLowerCase()) || p.category === 'attraction';
      return true;
    });
  }, [places, query, filter]);

  /** Widoczny wycinek. Filtrowanie idzie po całości, przycinamy dopiero na końcu. */
  const widoczne = useMemo(() => visible.slice(0, ileWidocznych), [visible, ileWidocznych]);

  const savedCount = Object.values(marks).filter((m) => m === 'must').length;
  const maybeCount = Object.values(marks).filter((m) => m === 'nice').length;

  /**
   * Kliknięcie oznacza, ponowne kliknięcie tego samego kubełka usuwa oznaczenie,
   * kliknięcie innego przenosi. Bez potwierdzeń i bez okien — tak mówi projekt.
   */
  const mark = async (place: CatalogPlace, bucket: Bucket) => {
    if (!activeBoard) return toast.error('Najpierw wybierz wyjazd, do którego zapisujemy');
    const current = marks[place.id];

    if (current === bucket) {
      setMarks((prev) => { const n = { ...prev }; delete n[place.id]; return n; });
      await (supabase as any).from('trip_project_places')
        .delete().eq('project_id', activeBoard).eq('catalog_id', place.id);
      return;
    }

    setMarks((prev) => ({ ...prev, [place.id]: bucket }));
    if (current) {
      await (supabase as any).from('trip_project_places')
        .update({ priority: bucket }).eq('project_id', activeBoard).eq('catalog_id', place.id);
      return;
    }
    const { error } = await (supabase as any).from('trip_project_places').insert({
      project_id: activeBoard,
      catalog_id: place.id,
      name: place.name,
      category: place.category,
      priority: bucket,
      lat: place.lat,
      lng: place.lng,
      description: place.description,
      opening_hours: place.opening_hours,
      visit_minutes: place.visit_minutes,
      image_url: place.photos?.[0] ?? null,
      source: 'catalog',
    });
    if (error) {
      setMarks((prev) => { const n = { ...prev }; delete n[place.id]; return n; });
      toast.error(error.message);
    }
  };

  const toggleFavorite = async (place: CatalogPlace) => {
    const { data: userData } = await supabase.auth.getUser();
    if (!userData.user) return navigate('/auth');
    if (favorites.has(place.id)) {
      await (supabase as any).from('place_favorites').delete()
        .eq('user_id', userData.user.id).eq('place_id', place.id);
      setFavorites((prev) => { const n = new Set(prev); n.delete(place.id); return n; });
    } else {
      await (supabase as any).from('place_favorites').insert({ user_id: userData.user.id, place_id: place.id });
      setFavorites((prev) => new Set(prev).add(place.id));
    }
  };

  /**
   * Świeżo założony wyjazd trafia tu z pustym katalogiem. Kazanie użytkownikowi
   * kliknąć jeszcze raz "Zbierz miejsca" było zbędnym krokiem tuż po tym, jak
   * właśnie powiedział, dokąd jedzie. Zbieramy sami, ale tylko dla miasta jego
   * wyjazdu — nie dla czegokolwiek, co wpisze w filtr — i tylko raz na miasto.
   */
  useEffect(() => {
    const c = city.trim();
    const cel = board?.destination?.trim();
    if (!c || !cel || loading || seeding) return;
    if (places.length > 0) return;
    if (c.toLowerCase() !== cel.toLowerCase()) return;
    if (proboweane.current.has(c.toLowerCase())) return;
    proboweane.current.add(c.toLowerCase());
    seedCity();
  }, [city, places.length, loading, seeding, board?.destination]);

  /**
   * Doładowywanie przy przewijaniu. Obserwator na końcu listy podnosi limit,
   * zamiast czekać na kliknięcie „pokaż więcej" — przy feedzie mozaikowym przycisk
   * na dole i tak trzeba najpierw znaleźć.
   */
  // Efekt musi się powtórzyć, kiedy wartownik pojawi się w drzewie. Przy pustym
  // zestawie zależności podpinał się raz, przy montowaniu — a wtedy elementu
  // jeszcze nie było, bo renderuje się dopiero, gdy jest co doładowywać.
  const jestCoDoladowac = ileWidocznych < visible.length;
  useEffect(() => {
    const el = wartownik.current;
    if (!el || !jestCoDoladowac) return;
    const obs = new IntersectionObserver((wpisy) => {
      if (wpisy[0]?.isIntersecting) setIleWidocznych((n) => n + 24);
    }, { rootMargin: '600px' });
    obs.observe(el);
    return () => obs.disconnect();
  }, [jestCoDoladowac]);

  // Zmiana miasta albo filtra zaczyna oglądanie od początku.
  useEffect(() => { setIleWidocznych(24); }, [city, filter, query]);

  const seedCity = async () => {
    if (!city.trim()) return toast.error('Podaj miasto, które mamy przejrzeć');
    setSeeding(true);
    try {
      const data = await apiPost<any>('/catalog/seed', { city: city.trim(), limit: 24 }, { timeoutMs: 180_000 });
      // Pole dostaje nazwę w postaci, w jakiej miejsca faktycznie zapisano — inaczej
      // filtr dalej szukałby tego, co użytkownik wpisał, a nie tego, co jest w bazie.
      if (data.city) setCity(data.city);
      await load(data.city || city);

      // Opisy dochodzą osobno, bo to zapytanie do modelu trwa dwadzieścia kilka
      // sekund. Karty stoją już z nazwami, godzinami i zdjęciami; treść dosypuje
      // się do nich w tle, bez blokowania ekranu.
      if (data.needs_enrich) {
        setOpisyWToku(true);
        apiPost<any>('/catalog/enrich', { city: data.city || city.trim() }, { timeoutMs: 180_000 })
          .then(() => load(data.city || city))
          .catch((e) => console.warn('Nie udało się dociągnąć opisów:', e))
          .finally(() => setOpisyWToku(false));
      }
      toast.success(
        data.added > 0
          ? `Dodano ${data.added} ${data.added === 1 ? 'miejsce' : 'miejsc'} w: ${data.city}`
          : `Nie znalazłem nowych miejsc w: ${data.city}`
      );
    } catch (err: any) {
      toast.error(err.message || 'Nie udało się zebrać miejsc');
    } finally {
      setSeeding(false);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Pasek górny: 64 px, półprzezroczysty z rozmyciem, dolna linia — jak w projekcie */}
      {/* Wspólny pasek zamiast własnego. Ten nagłówek miał inny logotyp, brakowało
          w nim zakładki Start, a "Plan" prowadził na tablicę zamiast do planu —
          przez co ta sama zakładka robiła co innego zależnie od tego, skąd się
          w nią kliknęło. */}
      <PlannerHeader
        context={board ? [board.destination, board.days ? `${board.days} dni` : null].filter(Boolean).join(' · ') : null}
        initials={initials}
      />

      <main className="max-w-[1280px] mx-auto px-10 pb-24">
        {/* Nagłówek dwukolumnowy */}
        <div className="pt-12 flex flex-wrap items-start justify-between gap-8">
          <div className="max-w-[560px]">
            <p className="font-narrow uppercase tracking-[0.32em] text-[11px] text-muted-foreground">
              {board ? `Wyjazd · ${board.destination}` : 'Odkrywanie miejsc'}
            </p>
            <h1 className="font-display font-light text-[40px] leading-[1.1] tracking-[-0.02em] mt-3">
              {board ? `Atrakcje na ${board.days ?? 'kilka'} ${popoludnia(board.days)}` : 'Miejsca warte rozważenia'}
            </h1>
            <p className="text-[15px] text-muted-foreground mt-3 leading-relaxed text-pretty">
              Zapisuj, co Cię interesuje. Kiedy tablica będzie pełna, agent ułoży z niej realny plan.
            </p>
          </div>

          <div className="text-right">
            <p className="font-mono text-[13px] text-muted-foreground tabular-nums">
              {savedCount} zapisanych · {maybeCount} do rozważenia
            </p>
            <Button className="mt-3 bg-primary hover:bg-primary/90" onClick={() => navigate('/plany')}>
              Zbuduj plan z tablicy <ArrowUpRight className="w-4 h-4 ml-1.5" />
            </Button>
          </div>
        </div>

        {/* Pasek wyszukiwania z pigułkami filtrów */}
        <div className="mt-8 rounded-md border border-border bg-card px-4 py-3 flex flex-wrap items-center gap-3">
          <Search className="w-4 h-4 text-muted-foreground shrink-0" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Szukaj: plaża, ruiny, deszczowy dzień…"
            className="flex-1 min-w-[180px] bg-transparent outline-none text-sm placeholder:text-muted-foreground"
          />
          <div className="w-px self-stretch bg-border hidden sm:block" />
          <div className="flex flex-wrap gap-1.5">
            {FILTERS.map((f) => (
              <button
                key={f.id}
                onClick={() => setFilter(f.id)}
                className={`rounded-full px-3 py-1 text-xs border transition-colors ${
                  filter === f.id
                    ? 'bg-primary border-primary text-primary-foreground'
                    : 'bg-background border-border hover:bg-muted'
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>
          <div className="relative">
            <MapPin className="w-4 h-4 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input list="miasta" value={city} onChange={(e) => setCity(e.target.value)}
              placeholder="Miasto" className="pl-8 h-8 w-36 text-sm" />
            <datalist id="miasta">{cities.map((c) => <option key={c} value={c} />)}</datalist>
          </div>
        </div>

        {/* Pasek agenta */}
        {board && places.length > 0 && (
          <div className="mt-4 rounded-md bg-muted border border-border px-4 py-3 flex items-start gap-3">
            <span className="font-narrow uppercase tracking-[0.18em] text-[10px] text-muted-foreground border border-border rounded-full px-2 py-0.5 shrink-0 mt-0.5">
              Agent
            </span>
            <p className="text-sm text-foreground/80 leading-relaxed">
              {savedCount === 0
                ? 'Zacznij od kilku miejsc, które na pewno chcesz zobaczyć. Resztę dobiorę tak, żeby dzień się spinał.'
                : `Masz ${savedCount} pewnych i ${maybeCount} do rozważenia. Kiedy uznasz, że wystarczy, ułożę z tego plan dni.`}
            </p>
          </div>
        )}

        {/* Feed mozaikowy */}
        {loading ? (
          <p className="text-muted-foreground flex items-center gap-2 py-16">
            <Loader2 className="w-4 h-4 animate-spin" /> Wczytuję miejsca…
          </p>
        ) : visible.length === 0 ? (
          <div className="text-center py-20 space-y-4">
            {seeding ? (
              <>
                <Loader2 className="w-9 h-9 text-primary/60 mx-auto animate-spin" />
                <p className="font-display text-[20px]">Zbieram miejsca w: {city.trim()}</p>
                <p className="text-muted-foreground max-w-md mx-auto text-pretty">
                  Przeglądam otwarte dane o atrakcjach, sprawdzam godziny otwarcia i dobieram zdjęcia.
                </p>
                {/* Licznik zamiast udawanych etapów — postępu z serwera nie mamy,
                    a upływ czasu i widełki są prawdziwe. */}
                <p className="font-mono text-[13px] tabular-nums text-muted-foreground">
                  {zbieraneSekundy} s · zwykle 40–60 s
                </p>
                <div className="grid gap-4 max-w-4xl mx-auto pt-4
                                [grid-template-columns:repeat(auto-fill,minmax(min(100%,200px),1fr))]">
                  {Array.from({ length: 8 }).map((_, i) => (
                    <div key={i} className="rounded-md border border-border overflow-hidden">
                      <div className="h-[120px] bg-muted animate-pulse" />
                      <div className="p-3 space-y-2">
                        <div className="h-3 bg-muted rounded animate-pulse" />
                        <div className="h-3 w-2/3 bg-muted rounded animate-pulse" />
                      </div>
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <>
            <Sparkles className="w-9 h-9 text-muted-foreground/40 mx-auto" />
            <p className="text-muted-foreground max-w-md mx-auto">
              {city.trim()
                ? `Nie mamy jeszcze miejsc dla: ${city}. Możemy je zebrać — potrwa to kilkadziesiąt sekund.`
                : 'Wpisz miasto, żeby zobaczyć, co w nim jest.'}
            </p>
            {city.trim() && (
              <Button onClick={seedCity} className="bg-primary hover:bg-primary/90">
                Zbierz miejsca dla: {city}
              </Button>
            )}
              </>
            )}
          </div>
        ) : (
          <div className="mt-6 [column-gap:20px] columns-1 sm:columns-2 lg:columns-3 xl:columns-4">
            {widoczne.map((p) => {
              const mk = marks[p.id];
              const duration = formatDuration(p.visit_minutes);
              return (
                /* Bez transformacji na hoverze. Przesunięcie o piksel promuje kartę do
                   własnej warstwy kompozycji, a w układzie wielokolumnowym to znany powód
                   kart, które przy najechaniu gasną. Cień i ramka dają ten sam sygnał bez
                   ruszania warstw. Z tego samego powodu przejście dotyczy tylko cienia
                   i koloru, a nie wszystkiego jak leci. */
                <article
                  key={p.id}
                  className="group mb-5 break-inside-avoid rounded-md border border-border bg-card overflow-hidden
                             transition-[box-shadow,border-color] duration-200 hover:border-foreground/25 hover:shadow-token-md"
                >
                  <button onClick={() => navigate(`/miejsce/${p.slug}`)} className="block w-full text-left">
                    <div className="relative bg-muted" style={{ height: photoHeight(p.id) }}>
                      {p.photos?.[0] && (
                        <img src={p.photos[0]} alt={p.name} loading="lazy" className="w-full h-full object-cover" />
                      )}
                      {p.kind && (
                        <span className="absolute left-2.5 bottom-2.5 font-narrow uppercase tracking-[0.18em] text-[10px]
                                         bg-background/85 backdrop-blur-sm px-2 py-1 rounded-sm">
                          {p.kind}
                        </span>
                      )}
                      {p.vibe_tags?.[0] && (
                        <span className="absolute right-2.5 top-2.5 text-[10px] bg-background/85 backdrop-blur-sm
                                         px-2 py-1 rounded-full">
                          {p.vibe_tags[0]}
                        </span>
                      )}
                      <button
                        onClick={(e) => { e.stopPropagation(); toggleFavorite(p); }}
                        aria-label="Do ulubionych"
                        className="absolute right-2.5 bottom-2.5 w-7 h-7 rounded-full bg-background/85 backdrop-blur-sm
                                   flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                      >
                        <Heart className={`w-3.5 h-3.5 ${favorites.has(p.id) ? 'fill-accent text-accent' : 'text-muted-foreground'}`} />
                      </button>
                    </div>

                    <div className="p-3.5">
                      <h3 className="font-display text-[16px] font-medium leading-snug">{p.name}</h3>
                      {p.description && (
                        <p className="text-[13px] text-muted-foreground mt-1.5 leading-relaxed line-clamp-3 text-pretty">
                          {p.description}
                        </p>
                      )}
                      {(duration || p.opening_hours) && (
                        <div className="mt-2.5 flex flex-wrap gap-x-3 font-mono text-[11px] text-muted-foreground tabular-nums">
                          {duration && <span>{duration}</span>}
                          {duration && p.opening_hours && <span>·</span>}
                          {p.opening_hours && <span className="truncate max-w-[140px]">{p.opening_hours}</span>}
                        </div>
                      )}
                    </div>
                  </button>

                  {/* Stopka: trzy kubełki w równym podziale, rozdzielone cienkimi liniami */}
                  <div className="grid grid-cols-3 border-t border-border text-[12px]">
                    {([
                      ['must', 'Na pewno', 'bg-primary text-primary-foreground'],
                      ['nice', 'Może', 'bg-dusty-blue text-dusty-blue-foreground'],
                      ['rejected', 'Nie', 'bg-clay text-clay-foreground'],
                    ] as const).map(([b, label, active], i) => (
                      <button
                        key={b}
                        onClick={(e) => { e.stopPropagation(); mark(p, b as Bucket); }}
                        className={`py-2 transition-colors ${i > 0 ? 'border-l border-border' : ''} ${
                          mk === b ? active : 'text-muted-foreground hover:bg-muted'
                        }`}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </article>
              );
            })}
          </div>
        )}

        {/* Wartownik doładowywania i informacja o dociąganych opisach. */}
        {/* Doładowywanie idzie samo przy przewijaniu, ale przycisk zostaje: obserwator
            przecięć milczy w części przeglądarek wbudowanych w aplikacje i w widokach
            o zerowej wysokości okna, a wtedy lista kończyłaby się bez wyjścia. */}
        {widoczne.length < visible.length && (
          <div ref={wartownik} className="py-10 flex flex-col items-center gap-3">
            <span className="font-mono text-[12px] tabular-nums text-muted-foreground">
              {widoczne.length} z {visible.length}
            </span>
            <Button variant="outline" onClick={() => setIleWidocznych((n) => n + 24)}>
              Pokaż więcej miejsc
            </Button>
          </div>
        )}
        {opisyWToku && (
          <p className="py-6 text-center text-[13px] text-muted-foreground flex items-center justify-center gap-2">
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
            Karty są już gotowe — dociągam do nich opisy i czas zwiedzania.
          </p>
        )}
      </main>
    </div>
  );
}
