import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowUpRight, Heart, Loader2, MapPin, Search, Sparkles } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import PlannerHeader from '@/components/PlannerHeader';
import DiscoverMap from '@/components/DiscoverMap';
import SzukanieMiejsc from '@/components/SzukanieMiejsc';
import { apiPost } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';

interface CatalogPlace {
  id: string;
  slug: string;
  name: string;
  city: string | null;
  country: string | null;
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
  const [pokazMape, setPokazMape] = useState(true);
  /** Miejsce pod kursorem albo wskazane pinezką — wiąże kartę z punktem na mapie. */
  const [aktywne, setAktywne] = useState<string | null>(null);
  const [startQuery, setStartQuery] = useState('');
  const [startPodpowiedzi, setStartPodpowiedzi] = useState<any[]>([]);
  const [lokalizowanie, setLokalizowanie] = useState(false);
  const kartyRef = useRef<Record<string, HTMLElement | null>>({});
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

  /**
   * `ciche` odróżnia dwa przypadki, które wcześniej były jednym. Zmiana miasta ma
   * prawo pokazać wczytywanie i zacząć listę od nowa. Doładowanie kolejnych kart
   * nie ma — a robiło dokładnie to: podnosiło stan wczytywania, przez co feed
   * znikał z drzewa, przewijanie wracało na górę i nowe karty trzeba było szukać
   * od początku.
   */
  const load = useCallback(async (cityOverride?: string, ciche = false) => {
    const c = (cityOverride ?? city).trim();
    const seq = ++loadSeq.current;
    if (!ciche) setLoading(true);
    // Stały limit zamiast rosnącego wraz z przewijaniem. Poprzednio doładowanie
    // podnosiło limit, co dociągało kolejne rekordy, przez co lista rosła, wartownik
    // znów wpadał w widok i cykl zaczynał się od nowa — strona migała bez końca.
    // Teraz jedno zapytanie na miasto, a przewijanie wyłącznie odsłania to,
    // co już jest w pamięci.
    let q = (supabase as any).from('place_catalog').select('*').limit(200);
    if (c) q = q.ilike('city', `%${c}%`);
    const { data } = await q.order('pin_count', { ascending: false }).order('created_at', { ascending: false });
    // Odpowiedź starszego zapytania nie może nadpisać nowszego. To była przyczyna
    // pustej listy po wyszukaniu: wpisanie "nowy york" wysyłało dziewięć zapytań,
    // po jednym na znak, a wracały w dowolnej kolejności. Wynik dla "nowy yor"
    // potrafił dotrzeć po wyniku dla pełnej nazwy i wyczyścić listę. Odświeżenie
    // strony pomagało, bo puszczało jedno zapytanie zamiast dziewięciu.
    if (seq !== loadSeq.current) return;
    setPlaces(data ?? []);
    if (!ciche) setLoading(false);
  }, [city]);

  // Miasto: odpytujemy po chwili przerwy w pisaniu, a nie po każdym znaku.
  useEffect(() => {
    const t = setTimeout(() => { load(); }, 300);
    return () => clearTimeout(t);
  }, [city]);



  useEffect(() => {
    (async () => {
      const { data: userData } = await supabase.auth.getUser();
      if (!userData.user) return;
      const [{ data: favs }, { data: projs }, { data: allCities }] = await Promise.all([
        (supabase as any).from('place_favorites').select('place_id').eq('user_id', userData.user.id),
        (supabase as any).from('trip_projects').select('id, name, destination, days, start_name, start_lat, start_lng').order('updated_at', { ascending: false }),
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
    // Twardy bezpiecznik: jedno automatyczne zbieranie na wejście do widoku.
    // Zbiór nazw sam w sobie nie wystarczy, bo zbieranie może zmienić miasto
    // w polu, a wtedy nowa nazwa nie byłaby jeszcze w zbiorze.
    if (proboweane.current.size >= 1) return;
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

  useEffect(() => {
    const q = startQuery.trim();
    if (q.length < 2 || !board?.destination) { setStartPodpowiedzi([]); return; }
    let aktualne = true;
    const t = setTimeout(async () => {
      try {
        const d = await apiPost<any>('/places/suggest',
          { query: q, city: board.destination, limit: 5 }, { timeoutMs: 12_000 });
        if (aktualne) setStartPodpowiedzi(d.suggestions ?? []);
      } catch { if (aktualne) setStartPodpowiedzi([]); }
    }, 300);
    return () => { aktualne = false; clearTimeout(t); };
  }, [startQuery, board?.destination]);

  const zapiszStart = async (nazwa: string, lat: number | null, lng: number | null) => {
    if (!board) return;
    const { error } = await (supabase as any).from('trip_projects')
      .update({ start_name: nazwa, start_lat: lat, start_lng: lng }).eq('id', board.id);
    if (error) return toast.error(error.message);
    setBoards((prev) => prev.map((b) => (b.id === board.id ? { ...b, start_name: nazwa, start_lat: lat, start_lng: lng } as any : b)));
    setStartQuery('');
    setStartPodpowiedzi([]);
    toast.success(`Start: ${nazwa}`);
  };

  /**
   * Położenie z urządzenia. Przeglądarka pyta o zgodę sama i bez niej nic nie
   * dostajemy — dlatego to osobny przycisk, a nie coś, co dzieje się przy wejściu.
   */
  const zUrzadzenia = () => {
    if (!navigator.geolocation) return toast.error('Ta przeglądarka nie udostępnia położenia');
    setLokalizowanie(true);
    navigator.geolocation.getCurrentPosition(
      (poz) => {
        setLokalizowanie(false);
        zapiszStart('Moje położenie', poz.coords.latitude, poz.coords.longitude);
      },
      (err) => {
        setLokalizowanie(false);
        toast.error(err.code === err.PERMISSION_DENIED
          ? 'Bez zgody na położenie nie odczytam lokalizacji'
          : 'Nie udało się odczytać położenia');
      },
      { timeout: 10_000 }
    );
  };

  const zPinezki = (id: string) => {
    setAktywne(id);
    kartyRef.current[id]?.scrollIntoView({ block: 'center', behavior: 'smooth' });
  };

  const seedCity = async () => {
    if (!city.trim()) return toast.error('Podaj miasto, które mamy przejrzeć');
    setSeeding(true);
    try {
      const data = await apiPost<any>('/catalog/seed', { city: city.trim(), limit: 24 }, { timeoutMs: 180_000 });
      // Pole dostaje nazwę w postaci, w jakiej miejsca faktycznie zapisano — inaczej
      // filtr dalej szukałby tego, co użytkownik wpisał, a nie tego, co jest w bazie.
      if (data.city) {
        proboweane.current.add(String(data.city).toLowerCase());
        setCity(data.city);
      }
      await load(data.city || city, true);

      // Opisy dochodzą osobno, bo to zapytanie do modelu trwa dwadzieścia kilka
      // sekund. Karty stoją już z nazwami, godzinami i zdjęciami; treść dosypuje
      // się do nich w tle, bez blokowania ekranu.
      if (data.needs_enrich) {
        setOpisyWToku(true);
        apiPost<any>('/catalog/enrich', { city: data.city || city.trim() }, { timeoutMs: 180_000 })
          .then(() => load(data.city || city, true))
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
            <div className="flex flex-wrap gap-2 justify-end mt-3">
              {/* Tablica dostępna też tutaj, nie tylko w pasku: zapisując miejsca
                  najczęściej chce się sprawdzić, co już się uzbierało. */}
              <Button variant="outline" onClick={() => navigate('/plany')}>Tablica</Button>
              <Button className="bg-primary hover:bg-primary/90" onClick={() => navigate('/plany?widok=plan')}>
                Zbuduj plan z tablicy <ArrowUpRight className="w-4 h-4 ml-1.5" />
              </Button>
            </div>
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
          <button onClick={() => setPokazMape((v) => !v)}
            className={`rounded-full px-3 py-1 text-xs border transition-colors ${
              pokazMape ? 'bg-foreground text-background border-foreground' : 'bg-background border-border hover:bg-muted'
            }`}>
            {pokazMape ? 'Ukryj mapę' : 'Pokaż mapę'}
          </button>
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
              <SzukanieMiejsc miasto={city.trim()} sekundy={zbieraneSekundy} />
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
          <div className={pokazMape ? 'mt-6 grid lg:grid-cols-[minmax(0,1fr)_minmax(0,44%)] gap-6 items-start' : 'mt-6'}>
          <div className={pokazMape
            ? '[column-gap:20px] columns-1 sm:columns-2'
            : '[column-gap:20px] columns-1 sm:columns-2 lg:columns-3 xl:columns-4'}>
            {widoczne.map((p, idx) => {
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
                  ref={(el) => { kartyRef.current[p.id] = el; }}
                  onMouseEnter={() => setAktywne(p.id)}
                  onMouseLeave={() => setAktywne(null)}
                  className={`group mb-5 break-inside-avoid rounded-md border bg-card overflow-hidden
                             transition-[box-shadow,border-color] duration-200 hover:shadow-token-md ${
                    aktywne === p.id ? 'border-primary shadow-token-md' : 'border-border hover:border-foreground/25'
                  }`}
                >
                  <button onClick={() => navigate(`/miejsce/${p.slug}`)} className="block w-full text-left">
                    <div className="relative bg-muted" style={{ height: photoHeight(p.id) }}>
                      {p.photos?.[0] && (
                        <img src={p.photos[0]} alt={p.name} loading="lazy" className="w-full h-full object-cover" />
                      )}
                      {pokazMape && (
                        <span className="absolute left-2.5 top-2.5 w-6 h-6 rounded-full bg-foreground text-background
                                         flex items-center justify-center text-[11px] font-medium">
                          {idx + 1}
                        </span>
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
                      {/* Skąd to miejsce jest. Feed pokazuje też katalog z innych
                          wyjazdów, więc bez tego wiersza atrakcja z Wrocławia wygląda
                          przy albańskiej tak samo — a to zupełnie inna decyzja. */}
                      {p.city && (
                        <p className={`font-mono text-[11px] mt-1 ${
                          board?.destination && p.city.toLowerCase() !== board.destination.toLowerCase()
                            ? 'text-accent' : 'text-muted-foreground'
                        }`}>
                          {p.city}{p.country ? ` / ${p.country}` : ''}
                        </p>
                      )}
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

          {pokazMape && (
            <aside className="hidden lg:block lg:sticky lg:top-[88px] space-y-3">
              {/* Punkt startowy nad mapą: patrząc na pinezki najczęściej chce się
                  wiedzieć, jak daleko to od miejsca, w którym się nocuje. */}
              <div className="rounded-md border border-border bg-card px-3.5 py-3">
                {(board as any)?.start_name ? (
                  <div className="flex items-center gap-2.5">
                    <MapPin className="w-4 h-4 text-primary shrink-0" />
                    <span className="text-sm truncate flex-1">{(board as any).start_name}</span>
                    <button onClick={() => zapiszStart('', null, null)}
                      className="text-[12px] text-muted-foreground hover:text-foreground transition-colors">
                      zmień
                    </button>
                  </div>
                ) : (
                  <div className="relative">
                    <div className="flex gap-2">
                      <div className="relative flex-1 min-w-0">
                        <MapPin className="w-4 h-4 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
                        <Input value={startQuery} onChange={(e) => setStartQuery(e.target.value)}
                          placeholder="Twój hotel, parking, dworzec…" className="pl-8 h-9 text-sm" />
                      </div>
                      <Button variant="outline" size="sm" onClick={zUrzadzenia} disabled={lokalizowanie}
                        className="shrink-0 h-9">
                        {lokalizowanie ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Moje położenie'}
                      </Button>
                    </div>
                    {startPodpowiedzi.length > 0 && (
                      <div className="absolute left-0 right-0 top-full mt-1.5 z-20 rounded-md border border-border
                                      bg-popover shadow-token-lg overflow-hidden">
                        {startPodpowiedzi.map((sug, i) => (
                          <button key={`${sug.name}-${i}`}
                            onClick={() => zapiszStart(sug.name, sug.lat ?? null, sug.lng ?? null)}
                            className="w-full text-left px-3 py-2 hover:bg-muted transition-colors
                                       border-b border-border last:border-b-0">
                            <div className="text-sm truncate">{sug.name}</div>
                            <div className="font-mono text-[11px] text-muted-foreground truncate">
                              {[sug.city, sug.country].filter(Boolean).join(' / ')}
                            </div>
                          </button>
                        ))}
                      </div>
                    )}
                    {startQuery.trim().length >= 3 && (
                      <button onClick={() => zapiszStart(startQuery.trim(), null, null)}
                        className="mt-2 text-[12px] text-primary hover:underline">
                        Użyj „{startQuery.trim()}" jako nazwy własnej
                      </button>
                    )}
                  </div>
                )}
              </div>

              <div className="rounded-md border border-border overflow-hidden bg-card">
                <DiscoverMap
                  places={widoczne.filter((p) => p.lat != null && p.lng != null)
                    .map((p) => ({ id: p.id, name: p.name, lat: p.lat, lng: p.lng }))}
                  aktywne={aktywne}
                  onPinClick={zPinezki}
                  onPinHover={setAktywne}
                  className="h-[calc(100vh-160px)] w-full"
                />
              </div>
            </aside>
          )}
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
