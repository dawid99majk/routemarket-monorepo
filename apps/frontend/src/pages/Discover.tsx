import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import KartaMiejsca from '@/components/KartaMiejsca';
import type { PodobneMiejsce } from '@/components/PodobneMiejsca';
import KolekcjeMiasta from '@/components/KolekcjeMiasta';
import { pasujeDoKolekcji, type Kolekcja } from '@/lib/kolekcje';
import PunktStartowy from '@/components/PunktStartowy';
import Zdjecie from '@/components/Zdjecie';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowUpRight, Heart, Loader2, MapPin, Search, Sparkles } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import PlannerHeader from '@/components/PlannerHeader';
import DiscoverMap from '@/components/DiscoverMap';
import SzukanieMiejsc from '@/components/SzukanieMiejsc';
import SzukamOdpowiedzi from '@/components/SzukamOdpowiedzi';
import PrzelacznikWyjazdu, { type WyjazdDoPrzelaczenia } from '@/components/PrzelacznikWyjazdu';
import { inicjalyUzytkownika } from '@/lib/uzytkownik';
import { apiPost } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { opisMiejsca, wyroznikMiejsca } from '@/lib/opis';
import { useTranslation } from 'react-i18next';
import { jakoZdjecia } from '@/lib/zBazy';

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
  description_i18n?: Record<string, string> | null;
  photos: string[];
  opening_hours: string | null;
  visit_minutes: number | null;
  vibe_tags: string[];
  pin_count: number;
  wyroznik?: string | null;
  wyroznik_i18n?: Record<string, string> | null;
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

/**
 * Kategoria to inne pytanie niż filtry powyżej. Tamte mówią, do czego miejsce się
 * nadaje („na deszcz", „z dziećmi"), ta mówi, czym ono jest. Mieszanie ich w jeden
 * rząd pigułek kazałoby wybierać między „na deszcz" a „jedzenie", choć to nie są
 * warianty tego samego.
 */
const KATEGORIE = [
  { id: 'wszystkie', label: 'Wszystko' },
  { id: 'attraction', label: 'Atrakcje' },
  { id: 'food', label: 'Jedzenie' },
  { id: 'nightlife', label: 'Wieczory' },
  { id: 'hotel', label: 'Nocleg' },
] as const;
type KategoriaId = typeof KATEGORIE[number]['id'];

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


export default function Discover() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [city, setCity] = useState('');
  const [query, setQuery] = useState('');
  /** Propozycje agenta — spoza katalogu, więc trzymane osobno od `places`. */
  const [wynikiAgenta, setWynikiAgenta] = useState<any[]>([]);
  /** Miejsce otwarte w oknie. Strona `/miejsce/:slug` zostaje dla odnośników. */
  const [karta, setKarta] = useState<CatalogPlace | null>(null);
  const [szukaAgent, setSzukaAgent] = useState(false);
  // Osobny stan od `karta` (podgląd z katalogu): propozycja agenta nie ma
  // id ani sluga, więc nie może dzielić typu z prawdziwym CatalogPlace.
  const [kartaAgenta, setKartaAgenta] = useState<any | null>(null);
  /** Sekundy od startu szukania. Zapytanie do agenta trwa ~50 s i bez
   *  licznika nie da się odróżnić długiego czekania od zawieszenia. */
  const [szukaSekundy, setSzukaSekundy] = useState(0);
  const [dopinane, setDopinane] = useState<Record<string, Bucket>>({});
  const [filter, setFilter] = useState<FilterId>('all');
  const [places, setPlaces] = useState<CatalogPlace[]>([]);
  const [loading, setLoading] = useState(true);
  const [seeding, setSeeding] = useState(false);
  const [favorites, setFavorites] = useState<Set<string>>(new Set());
  const [boards, setBoards] = useState<WyjazdDoPrzelaczenia[]>([]);
  const [activeBoard, setActiveBoard] = useState<string | null>(null);
  const [marks, setMarks] = useState<Record<string, Bucket>>({});
  const [cities, setCities] = useState<string[]>([]);
  const [initials, setInitials] = useState<string | null>(null);
  const [searchParams, setSearchParams] = useSearchParams();
  /** Wyjazd wskazany z tablicy. Bez tego Odkrywaj brał ostatnio zmieniany,
   *  więc wejście z tablicy Lipska mogło wylądować w innym mieście. */
  const wskazanyWyjazd = searchParams.get('wyjazd');
  const [zbieraneSekundy, setZbieraneSekundy] = useState(0);
  const [opisyWToku, setOpisyWToku] = useState(false);
  /** Ile kart pokazujemy. Rośnie przy przewijaniu, nie przy każdym zapytaniu. */
  const [ileWidocznych, setIleWidocznych] = useState(24);
  /** Wybrany motyw. `null` znaczy: pokaż kafelki kolekcji zamiast wejścia w jedną. */
  const [kolekcja, setKolekcja] = useState<Kolekcja | null>(null);
  const [pokazMape, setPokazMape] = useState(true);
  const [kategoria, setKategoria] = useState<KategoriaId>('wszystkie');
  /** Miejsce pod kursorem albo wskazane pinezką — wiąże kartę z punktem na mapie. */
  const [aktywne, setAktywne] = useState<string | null>(null);
  const [obszar, setObszar] = useState<{ pn: number; pd: number; wsch: number; zach: number } | null>(null);
  const [tylkoZObszaru, setTylkoZObszaru] = useState(true);
  const kartyRef = useRef<Record<string, HTMLElement | null>>({});
  const wartownik = useRef<HTMLDivElement | null>(null);
  /** Miasta, dla których zbieranie już ruszyło — żeby nie powtórzyć go w kółko. */
  const proboweane = useRef<Set<string>>(new Set());

  useEffect(() => {
    (async () => {
      setInitials(await inicjalyUzytkownika());
    })();
  }, []);

  const board = boards.find((b) => b.id === activeBoard) ?? null;

  /**
   * Zmiana wyjazdu przestawia też miasto. To jedna decyzja użytkownika („pracuję
   * teraz nad tym wyjazdem"), więc nie ma powodu, żeby wymagała dwóch ruchów —
   * ani żeby dało się zostawić te dwie rzeczy w sprzeczności.
   */
  const przelaczWyjazd = (id: string) => {
    const w = boards.find((b) => b.id === id);
    if (!w) return;
    setActiveBoard(id);
    if (w.destination) setCity(w.destination);
    setSearchParams(id ? { wyjazd: id } : {}, { replace: true });
  };

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
    // Jawna lista kolumn: karta feedu nie potrzebuje wiki_extract (bywa dłuższy
    // niż cała reszta wiersza razem wzięta) ani pól redakcyjnych.
    //
    // Limit to twarda ściana, nie paginacja — filtr mapy/wyszukiwarka/kategorie
    // działają w pamięci nad tym, co się zmieści. Prawdziwa keyset paginacja
    // wymagałaby przeniesienia tych filtrów na serwer (inaczej wyszukiwanie
    // "widziałoby" tylko załadowaną stronę, nie cały katalog miasta) — świadomie
    // odłożone: 01.09.2026 najzasobniejsze miasto (Rzym) miało 70 miejsc, więc
    // 500 to zapas z dużym marginesem, nie prowizorka na już pękającą granicę.
    let q = supabase.from('place_catalog')
      .select('id, slug, name, city, country, lat, lng, category, kind, description, description_i18n, photos, opening_hours, visit_minutes, vibe_tags, pin_count, waznosc, wyroznik, wyroznik_i18n, created_at')
      .limit(500);
    if (c) q = q.ilike('city', `%${c}%`);
    // Ważność przed przypięciami: przy braku użytkowników pin_count jest zerem
    // dla wszystkiego, więc sam z siebie niczego nie porządkuje.
    const { data } = await q
      .order('waznosc', { ascending: false, nullsFirst: false })
      .order('pin_count', { ascending: false })
      .order('created_at', { ascending: false });
    // Odpowiedź starszego zapytania nie może nadpisać nowszego. To była przyczyna
    // pustej listy po wyszukaniu: wpisanie "nowy york" wysyłało dziewięć zapytań,
    // po jednym na znak, a wracały w dowolnej kolejności. Wynik dla "nowy yor"
    // potrafił dotrzeć po wyniku dla pełnej nazwy i wyczyścić listę. Odświeżenie
    // strony pomagało, bo puszczało jedno zapytanie zamiast dziewięciu.
    if (seq !== loadSeq.current) return;
    // Osiągnięcie limitu znaczy, że miasto mogło urosnąć ponad to, co się mieści —
    // bez tego ściana obcina wyniki po cichu, dopóki ktoś przypadkiem nie zauważy.
    if ((data ?? []).length >= 500) {
      console.warn(`[Discover] "${c || '(wszystkie miasta)'}" osiągnęło limit 500 miejsc — część katalogu może być ucięta.`);
    }
    setPlaces((data ?? []).map((r) => ({ ...r, photos: jakoZdjecia(r.photos) })) as CatalogPlace[]);
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
        supabase.from('place_favorites').select('place_id').eq('user_id', userData.user.id),
        supabase.from('trip_projects')
          .select('id, name, destination, days, start_name, start_lat, start_lng, start_date, end_date, trip_type')
          .order('updated_at', { ascending: false }),
        // DISTINCT robi baza — wcześniej szło tu 500 surowych wierszy
        // i deduplikacja w przeglądarce, a miast powyżej limitu nie było wcale.
        supabase.rpc('catalog_cities'),
      ]);
      setFavorites(new Set((favs ?? []).map((f: any) => f.place_id)));

      // Liczba miejsc i pierwsza miniatura na tablicę -- ten sam wzorzec co
      // galeria publicznych tablic (Tablice.tsx): jedno zapytanie wsadowe,
      // a nie N osobnych przy każdym otwarciu przełącznika.
      const listaProjs = projs ?? [];
      let wgTablicy: Record<string, { ile: number; miniatura: string | null }> = {};
      if (listaProjs.length) {
        const { data: miejscaTablic } = await supabase.from('trip_project_places')
          .select('project_id, image_url').in('project_id', listaProjs.map((b: any) => b.id));
        for (const m of miejscaTablic ?? []) {
          const w = (wgTablicy[m.project_id] ??= { ile: 0, miniatura: null });
          w.ile++;
          if (!w.miniatura && m.image_url) w.miniatura = m.image_url;
        }
      }
      setBoards(listaProjs.map((b: any) => ({
        ...b,
        liczba_miejsc: wgTablicy[b.id]?.ile ?? 0,
        miniatura: wgTablicy[b.id]?.miniatura ?? null,
      })));
      setCities(((allCities ?? []) as { city: string }[]).map((r) => r.city));
      if ((projs ?? []).length > 0) {
        const wybrany = (wskazanyWyjazd && projs.find((p: any) => p.id === wskazanyWyjazd)) || projs[0];
        setActiveBoard(wybrany.id);
        if (wybrany.destination) setCity(wybrany.destination);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** Kubełki bieżącej tablicy — sterują podświetleniem przycisków w stopce karty. */
  useEffect(() => {
    if (!activeBoard) { setMarks({}); return; }
    (async () => {
      const { data } = await supabase
        .from('trip_project_places').select('catalog_id, priority').eq('project_id', activeBoard);
      const next: Record<string, Bucket> = {};
      for (const row of data ?? []) if (row.catalog_id) next[row.catalog_id] = row.priority as Bucket;
      setMarks(next);
    })();
  }, [activeBoard]);

  /** Filtrowanie na bieżąco, filtr i wyszukiwarka działają łącznie. */
  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    const tripType = board?.trip_type;

    const filtered = places.filter((p) => {
      // Wyszukiwanie semantyczno-tekstowe: przeszukuje nazwę, rodzaj, wyróżnik, tagi klimatu oraz opis
      if (q) {
        const szukanyTekst = `${p.name} ${p.kind ?? ''} ${p.wyroznik ?? ''} ${(p.vibe_tags ?? []).join(' ')} ${opisMiejsca(p)}`.toLowerCase();
        const slowa = q.split(/\s+/).filter(Boolean);
        const pasuje = slowa.every((s) => szukanyTekst.includes(s));
        if (!pasuje) return false;
      }

      if (kategoria === 'wszystkie' && (p.category ?? 'attraction') === 'hotel') return false;
      if (kategoria !== 'wszystkie' && (p.category ?? 'attraction') !== kategoria) return false;
      if (kolekcja && !pasujeDoKolekcji(p.vibe_tags, kolekcja)) return false;
      if (filter === 'kids')  return (p.vibe_tags ?? []).some((t) => KIDS_TAGS.includes(t));
      if (filter === 'short') return (p.visit_minutes ?? 999) <= 60;
      if (filter === 'walk')  return true;
      if (filter === 'rain')  return RAIN_KINDS.includes((p.kind ?? '').toLowerCase()) || p.category === 'attraction';
      return true;
    });

    // Inteligentne sortowanie uwzględniające profil wyjazdu i jakość karty
    return filtered.sort((a, b) => {
      // 1. Miejsca ze zdjęciami mają bezwzględne pierwszeństwo przed pustymi kafelkami
      const aMaFoto = (a.photos?.length ?? 0) > 0 ? 1 : 0;
      const bMaFoto = (b.photos?.length ?? 0) > 0 ? 1 : 0;
      if (bMaFoto !== aMaFoto) return bMaFoto - aMaFoto;

      // 2. Jeśli wyjazd rodzinny (family):
      if (tripType === 'family') {
        const aDlaDzieci = (a.vibe_tags ?? []).some((t) => KIDS_TAGS.includes(t)) ? 1 : 0;
        const bDlaDzieci = (b.vibe_tags ?? []).some((t) => KIDS_TAGS.includes(t)) ? 1 : 0;
        if (bDlaDzieci !== aDlaDzieci) return bDlaDzieci - aDlaDzieci;

        // Miejsca martyrologiczne i cmentarze na sam koniec
        const aCmentarz = /cmentarz|ofiarom|grobowiec|mauzoleum|stalinizmu|poleg[łl]/i.test(a.name) ? -1 : 0;
        const bCmentarz = /cmentarz|ofiarom|grobowiec|mauzoleum|stalinizmu|poleg[łl]/i.test(b.name) ? -1 : 0;
        if (aCmentarz !== bCmentarz) return aCmentarz - bCmentarz;
      }

      // 3. Miejsca z wyróżnikiem redakcyjnym wyżej
      const aWyr = a.wyroznik ? 1 : 0;
      const bWyr = b.wyroznik ? 1 : 0;
      if (bWyr !== aWyr) return bWyr - aWyr;

      return (b.pin_count ?? 0) - (a.pin_count ?? 0);
    });
  }, [places, query, filter, kategoria, kolekcja, board?.trip_type]);

  /**
   * Karty ograniczone do wycinka mapy. Przewijając mapę zawężasz listę obok —
   * miejsca poza kadrem znikają z niej, bo przy planowaniu dnia liczy się to,
   * co jest blisko siebie, a nie wszystko, co miasto ma do zaoferowania.
   * Miejsca bez współrzędnych zostają zawsze: nie da się orzec, czy są w kadrze.
   */
  const wObszarze = useMemo(() => {
    if (!pokazMape || !tylkoZObszaru || !obszar) return visible;
    // Kadr o zerowej rozpiętości znaczy, że mapa nie ma rozmiaru — filtrowanie
    // po nim wycięłoby wszystko.
    if (obszar.pn - obszar.pd < 1e-6 || obszar.wsch - obszar.zach < 1e-6) return visible;
    return visible.filter((p) => {
      if (p.lat == null || p.lng == null) return true;
      return p.lat <= obszar.pn && p.lat >= obszar.pd && p.lng <= obszar.wsch && p.lng >= obszar.zach;
    });
  }, [visible, obszar, tylkoZObszaru, pokazMape]);

  /** Widoczny wycinek. Filtrowanie idzie po całości, przycinamy dopiero na końcu. */
  const widoczne = useMemo(() => wObszarze.slice(0, ileWidocznych), [wObszarze, ileWidocznych]);

  /* Kolekcje to ekran startowy, nie kolejny filtr. Znikają, gdy użytkownik już
     czegoś szuka albo zawęził widok — wtedy odpowiedź jest na dole, nie na górze. */
  const pokazKolekcje = !kolekcja && !query.trim() && filter === 'all'
    && kategoria === 'wszystkie' && wynikiAgenta.length === 0 && places.length > 0;

  const savedCount = Object.values(marks).filter((m) => m === 'must').length;
  const maybeCount = Object.values(marks).filter((m) => m === 'nice').length;

  /**
   * Kliknięcie oznacza, ponowne kliknięcie tego samego kubełka usuwa oznaczenie,
   * kliknięcie innego przenosi. Bez potwierdzeń i bez okien — tak mówi projekt.
   */
  /** Drugi krok szukania: filtr nad katalogiem nie znajduje rzeczy opisanych
   *  zdaniem, więc pytamy agenta — tak samo jak wyszukiwarka na tablicy. */
  const szukajAgentem = async () => {
    const q = query.trim();
    if (!q || szukaAgent) return;
    const miasto = city.trim() || board?.destination;
    if (!miasto) return toast.info('Najpierw wpisz miasto.');
    setSzukaAgent(true);
    setWynikiAgenta([]);
    try {
      const d = await apiPost<any>('/discover-places',
        { query: q, destination: miasto }, { timeoutMs: 90_000 });
      const zn = d.places || [];
      setWynikiAgenta(zn);
      if (zn.length === 0) toast.info(`Agent nic nie znalazł dla: „${q}".`);
      else toast.success(`Agent znalazł ${zn.length} ${zn.length === 1 ? 'miejsce' : 'miejsc'} dla: „${q}".`);
    } catch (e: any) {
      toast.error(e.message || 'Nie udało się wyszukać');
    } finally {
      setSzukaAgent(false);
    }
  };

  /** Propozycja agenta nie ma wpisu w katalogu, więc idzie na tablicę bez
   *  `catalog_id` — tą samą drogą co propozycje w wyszukiwarce tablicy. */
  const dopnijZAgenta = async (p: any, bucket: Bucket) => {
    if (!activeBoard) return toast.error(t('odkrywaj.najpierw_wybierz_wyjazd_do_ktorego'));
    const klucz = String(p.name);
    if (dopinane[klucz]) return;
    setDopinane((prev) => ({ ...prev, [klucz]: bucket }));
    const { error } = await supabase.from('trip_project_places').insert({
      project_id: activeBoard,
      name: p.name,
      category: p.category || 'attraction',
      priority: bucket,
      lat: p.lat ?? null,
      lng: p.lng ?? null,
      description: p.description || '',
      visit_minutes: p.visit_minutes ?? null,
      image_url: p.photos?.[0] ?? p.image_url ?? null,
      source: 'discover',
    });
    if (error) {
      setDopinane((prev) => { const n = { ...prev }; delete n[klucz]; return n; });
      return toast.error(error.message);
    }
    toast.success(`Dodane: ${p.name}`);
  };

  /* Wiersz z `podobne_miejsca` niesie te same dane co feed, tylko z luźniejszymi
     typami (kolumny bazy bywają puste). Domykamy je raz, żeby i otwarcie karty,
     i dopięcie na tablicę dostały zwykły `CatalogPlace`. */
  const zPodobnego = (m: PodobneMiejsce): CatalogPlace => ({
    ...m,
    slug: m.slug ?? '',
    category: m.category ?? 'attraction',
    description: m.description ?? '',
    photos: jakoZdjecia(m.photos),
    vibe_tags: m.vibe_tags ?? [],
    pin_count: m.pin_count ?? 0,
  });

  const mark = async (place: CatalogPlace, bucket: Bucket) => {
    if (!activeBoard) return toast.error(t('odkrywaj.najpierw_wybierz_wyjazd_do_ktorego'));
    const current = marks[place.id];

    if (current === bucket) {
      setMarks((prev) => { const n = { ...prev }; delete n[place.id]; return n; });
      await supabase.from('trip_project_places')
        .delete().eq('project_id', activeBoard).eq('catalog_id', place.id);
      return;
    }

    setMarks((prev) => ({ ...prev, [place.id]: bucket }));
    if (current) {
      await supabase.from('trip_project_places')
        .update({ priority: bucket }).eq('project_id', activeBoard).eq('catalog_id', place.id);
      return;
    }
    const { error } = await supabase.from('trip_project_places').insert({
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
      await supabase.from('place_favorites').delete()
        .eq('user_id', userData.user.id).eq('place_id', place.id);
      setFavorites((prev) => { const n = new Set(prev); n.delete(place.id); return n; });
    } else {
      await supabase.from('place_favorites').insert({ user_id: userData.user.id, place_id: place.id });
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
  const jestCoDoladowac = ileWidocznych < wObszarze.length;
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
    if (!szukaAgent) return;
    setSzukaSekundy(0);
    const t = setInterval(() => setSzukaSekundy((s) => s + 1), 1000);
    return () => clearInterval(t);
  }, [szukaAgent]);

  const zapiszStart = async (nazwa: string, lat: number | null, lng: number | null) => {
    if (!board) return;
    const { error } = await supabase.from('trip_projects')
      .update({ start_name: nazwa, start_lat: lat, start_lng: lng }).eq('id', board.id);
    if (error) return toast.error(error.message);
    setBoards((prev) => prev.map((b) => (b.id === board.id ? { ...b, start_name: nazwa, start_lat: lat, start_lng: lng } as any : b)));
    toast.success(`Start: ${nazwa}`);
  };

  const zPinezki = (id: string) => {
    setAktywne(id);
    kartyRef.current[id]?.scrollIntoView({ block: 'center', behavior: 'smooth' });
    // Pinezka prowadzi tam, co kafelek: do karty miejsca ze zdjęciami i opisem.
    // Samo przewinięcie pokazywało tylko to, co i tak było widać na kafelku.
    const p = places.find((x) => x.id === id);
    if (p) setKarta(p);
  };

  const seedCity = async () => {
    if (!city.trim()) return toast.error(t('odkrywaj.podaj_miasto_ktore_mamy_przejrzec'));
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
        const miasto = data.city || city.trim();
        // Jedno wywołanie opisuje najwyżej dwadzieścia cztery miejsca. Haga miała
        // ich czterdzieści dwa -- bez pętli osiemnaście zostawało bez opisu na
        // zawsze, bo nic nie mówiło frontowi, że trzeba spytać drugi raz.
        // Limit dziesięciu rund to zabezpieczenie przed nieskończoną pętlą, gdyby
        // `remaining` z jakiegoś powodu nigdy nie doszło do zera -- w praktyce
        // miasto z pobierania ma kilkadziesiąt miejsc, więc dwie-trzy rundy
        // wystarczają.
        (async () => {
          for (let runda = 0; runda < 10; runda++) {
            const odp = await apiPost<any>('/catalog/enrich', { city: miasto }, { timeoutMs: 180_000 })
              .catch((e) => { console.warn('Nie udało się dociągnąć opisów:', e); return null; });
            if (!odp) break;
            await load(miasto, true);
            if (!odp.remaining) break;
          }

          // Wyróżniki DOPIERO TERAZ. Zdanie „czym to się różni od sąsiadów"
          // potrzebuje własnego opisu i tagów u sąsiadów, a jedno i drugie
          // powstaje w pętli wyżej. Puszczone równolegle dostałoby miasto bez
          // tagów i nie miałoby czego porównywać.
          for (let runda = 0; runda < 10; runda++) {
            const odp = await apiPost<any>('/catalog/wyrozniki', { city: miasto }, { timeoutMs: 180_000 })
              .catch((e) => { console.warn('Nie udało się dociągnąć wyróżników:', e); return null; });
            // Partia bez zapisu kończy przebieg. Odrzucone zdania zostają w puli
            // i wracałyby w kolejnej rundzie, więc bez tego warunku pętla chodzi
            // po tych samych miejscach do limitu rund i płaci za każdą próbę.
            if (!odp || !odp.opisane || !odp.pozostalo) break;
          }
          await load(miasto, true);
        })().finally(() => setOpisyWToku(false));
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
        ukryjPigulke
      />

      <main className="max-w-[1280px] mx-auto px-10 pb-24">
        {/* Lekki nagłówek i kontekst wyjazdu */}
        <div className="pt-8 pb-4 flex flex-wrap items-center justify-between gap-4 border-b border-border/40">
          <div>
            {board && boards.length > 0 ? (
              <PrzelacznikWyjazdu
                aktywny={board}
                wszystkie={boards}
                onZmien={przelaczWyjazd}
                onNowy={() => navigate('/start')}
                wariant="kompaktowy"
              />
            ) : (
              <div className="flex items-center gap-3">
                <span className="font-narrow uppercase tracking-[0.24em] text-[10px] text-muted-foreground bg-muted/80 px-2.5 py-0.5 rounded-full border border-border/60 shrink-0">
                  Eksploracja
                </span>
                <h1 className="font-display font-light text-2xl sm:text-3xl tracking-[-0.01em]">
                  {t('naglowek.odkrywaj')}
                </h1>
              </div>
            )}
          </div>

          <div className="flex items-center gap-3">
            <span className="font-mono text-xs text-muted-foreground tabular-nums hidden sm:inline">
              {savedCount} zapisanych · {maybeCount} do rozważenia
            </span>
            <Button variant="outline" size="sm" className="rounded-full h-9 px-3.5 text-xs"
              onClick={() => navigate(board ? `/plany/${board.id}` : '/plany')}>
              {t('odkrywaj.tablica')}
            </Button>
            <Button size="sm" className="rounded-full h-9 px-4 text-xs bg-foreground text-background hover:bg-foreground/90"
              onClick={() => navigate(board ? `/plany/${board.id}?widok=plan` : '/plany')}>
              Zbuduj plan <ArrowUpRight className="w-3.5 h-3.5 ml-1" />
            </Button>
          </div>
        </div>

        {/* Pływająca wyspa wyszukiwania (w stylu Airbnb) */}
        <div className="mt-6 max-w-3xl mx-auto">
          <div className="rounded-full bg-card border border-border/80 shadow-[0_2px_16px_rgba(0,0,0,0.06)] hover:shadow-[0_4px_24px_rgba(0,0,0,0.1)] transition-all p-1.5 flex flex-col sm:flex-row items-center gap-2">
            {/* Pole 1: Czego szukasz */}
            <div className="relative flex-1 w-full flex items-center pl-4">
              <Search className="w-4 h-4 text-muted-foreground shrink-0" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') szukajAgentem(); }}
                placeholder={t('odkrywaj.szukaj_plaza_ruiny_deszczowy_dzien')}
                className="w-full h-10 bg-transparent px-3 text-sm outline-none placeholder:text-muted-foreground text-foreground"
              />
            </div>

            <div className="hidden sm:block w-px h-6 bg-border/60" />

            {/* Pole 2: Miasto */}
            <div className="relative w-full sm:w-56 flex items-center pl-4 sm:pl-2 pr-1">
              <MapPin className="w-4 h-4 text-muted-foreground shrink-0" />
              <input
                list="miasta"
                value={city}
                onChange={(e) => setCity(e.target.value)}
                placeholder={t('odkrywaj.miasto')}
                className="w-full h-10 bg-transparent px-2.5 text-sm outline-none placeholder:text-muted-foreground text-foreground"
              />
              <datalist id="miasta">{cities.map((c) => <option key={c} value={c} />)}</datalist>

              <button
                onClick={szukajAgentem}
                disabled={!query.trim() || szukaAgent}
                aria-label="Szukaj"
                className="w-9 h-9 rounded-full bg-foreground text-background flex items-center justify-center shrink-0 hover:bg-foreground/90 disabled:opacity-40 transition-all shadow-xs ml-1"
              >
                {szukaAgent ? <Loader2 className="w-4 h-4 animate-spin" /> : <ArrowUpRight className="w-4 h-4" />}
              </button>
            </div>
          </div>

          {szukaAgent && (
            <p className="font-mono text-[11px] text-center text-muted-foreground mt-2 animate-pulse">
              Agent przeszukuje miasto ({szukaSekundy}s)… możesz przeglądać dotychczasowe miejsca.
            </p>
          )}

          {/* Filtry jako płynny, napowietrzony pasek tagów pod wyszukiwarką */}
          <div className="flex flex-wrap items-center justify-center gap-1.5 mt-4">
            {KATEGORIE.filter((k) => k.id === 'wszystkie'
                || places.some((p) => (p.category ?? 'attraction') === k.id)).map((k) => (
              <button
                key={k.id}
                onClick={() => setKategoria(k.id)}
                aria-pressed={kategoria === k.id}
                className={`rounded-full px-3 py-1 text-xs transition-all ${
                  kategoria === k.id
                    ? 'bg-foreground text-background font-medium shadow-2xs'
                    : 'bg-muted/60 text-muted-foreground hover:text-foreground hover:bg-muted'
                }`}
              >
                {k.label}
              </button>
            ))}

            <span className="w-px h-3.5 bg-border/80 mx-1 hidden sm:block" />

            {FILTERS.map((f) => (
              <button
                key={f.id}
                onClick={() => setFilter(f.id)}
                aria-pressed={filter === f.id}
                className={`rounded-full px-3 py-1 text-xs transition-all ${
                  filter === f.id
                    ? 'bg-foreground text-background font-medium shadow-2xs'
                    : 'bg-muted/60 text-muted-foreground hover:text-foreground hover:bg-muted'
                }`}
              >
                {f.label}
              </button>
            ))}

            <button
              onClick={() => setPokazMape((v) => !v)}
              aria-pressed={pokazMape}
              className={`rounded-full px-3 py-1 text-xs transition-all ml-2 ${
                pokazMape
                  ? 'bg-foreground text-background font-medium'
                  : 'bg-card border border-border/80 text-foreground hover:bg-muted shadow-2xs'
              }`}
            >
              {pokazMape ? 'Ukryj mapę' : '🗺️ Pokaż mapę'}
            </button>
          </div>
        </div>

        <KartaMiejsca
          miejsce={karta ? {
            name: karta.name,
            slug: karta.slug,
            photos: karta.photos,
            description: opisMiejsca(karta),
            wyroznik: wyroznikMiejsca(karta),
            opening_hours: karta.opening_hours,
            visit_minutes: karta.visit_minutes,
          } : null}
          decyzja={karta ? (marks[karta.id] as any) ?? null : null}
          onDecyzja={(d) => { if (karta) mark(karta, d as Bucket); }}
          onZamknij={() => setKarta(null)}
          idKatalogu={karta?.id ?? null}
          /* Co już jest na tablicy, tego nie proponujemy drugi raz. */
          pomin={Object.keys(marks)}
          /* Z tej tablicy baza czyta gust: które tagi wybierasz częściej, niż
             wynikałoby to z samego składu miasta. */
          tablica={activeBoard}
          onOtworzPodobne={(m) => setKarta(zPodobnego(m))}
          onDodajPodobne={(m) => mark(zPodobnego(m), 'nice')}
        />

        {/* Ten sam komponent co wyżej, dla propozycji spoza katalogu. Bez sluga
            i zdjęć (agent ich nie pobiera), za to z `note` -- polem "why", które
            API zwraca od początku, a nigdzie się nie pokazywało. */}
        <KartaMiejsca
          miejsce={kartaAgenta ? {
            name: kartaAgenta.name,
            description: kartaAgenta.description,
            visit_minutes: kartaAgenta.visit_minutes,
            price_hint: kartaAgenta.price_hint,
            note: kartaAgenta.why,
          } : null}
          decyzja={kartaAgenta ? (dopinane[String(kartaAgenta.name)] as any) ?? null : null}
          onDecyzja={(d) => { if (kartaAgenta) dopnijZAgenta(kartaAgenta, d as Bucket); }}
          onZamknij={() => setKartaAgenta(null)}
        />

        {/* Znalezione przez agenta: propozycje spoza katalogu, na konkretne
            pytanie. Osobny pasek, żeby nie udawały części zbioru miasta. */}
        {wynikiAgenta.length > 0 && (
          <div className="mt-4 rounded-md border border-accent/30 bg-accent/5 p-4 sm:p-5">
            <div className="flex flex-wrap items-baseline justify-between gap-3">
              <span className="font-narrow uppercase tracking-[0.18em] text-[10px] text-accent">
                Agent znalazł · {wynikiAgenta.length}
              </span>
              <button onClick={() => setWynikiAgenta([])}
                className="text-[12px] text-muted-foreground hover:text-foreground transition-colors">
                ukryj
              </button>
            </div>

            <div className="mt-3.5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {wynikiAgenta.map((p: any, i: number) => {
                const stan = dopinane[String(p.name)];
                return (
                  <div key={`${p.name}-${i}`}
                    className="rounded-md border border-border bg-card p-3.5 flex flex-col">
                    {/* Klikalna treść, przyciski decyzji jako rodzeństwo pod spodem --
                        ten sam układ co karty katalogu, żeby jedno nie blokowało drugiego. */}
                    <button onClick={() => setKartaAgenta(p)} className="text-left">
                      <div className="font-display text-[15px] leading-snug">{p.name}</div>
                      {(p.visit_minutes || p.category) && (
                        <div className="font-mono text-[11px] tabular-nums text-muted-foreground mt-1">
                          {[p.category, p.visit_minutes ? `${p.visit_minutes} min` : null]
                            .filter(Boolean).join(' · ')}
                        </div>
                      )}
                      {p.description && (
                        <p className="text-[13px] text-muted-foreground mt-2 line-clamp-3 text-pretty">
                          {p.description}
                        </p>
                      )}
                    </button>
                    <div className="flex items-center gap-2 mt-3 pt-3 border-t border-border/60 text-[12px]">
                      {stan ? (
                        <span className={`rounded-full px-3 py-1 font-medium ${
                          stan === 'must' ? 'bg-primary text-primary-foreground'
                                          : 'bg-accent text-accent-foreground'}`}>
                          {stan === 'must' ? 'Na pewno' : 'Być może'}
                        </span>
                      ) : (
                        <>
                          <button onClick={() => dopnijZAgenta(p, 'must' as Bucket)}
                            className="rounded-full bg-muted px-3 py-1 font-medium
                                       hover:bg-tan/25 transition-colors">
                            Na pewno
                          </button>
                          <button onClick={() => dopnijZAgenta(p, 'nice' as Bucket)}
                            className="text-muted-foreground hover:text-foreground transition-colors">
                            Może
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Pasek agenta Co-pilot */}
        {board && places.length > 0 && (
          <div className="mt-5 flex justify-center">
            <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-primary/5 border border-primary/15 text-xs text-foreground/85 shadow-2xs">
              <Sparkles className="w-3.5 h-3.5 text-primary shrink-0" />
              <span>
                {savedCount === 0
                  ? 'Zacznij od kilku kotwic — resztę dobiorę tak, żeby dzień się spinał.'
                  : `Masz ${savedCount} pewnych i ${maybeCount} do rozważenia.`}
              </span>
              {savedCount > 0 && (
                <button
                  onClick={() => navigate(board ? `/plany/${board.id}?widok=plan` : '/plany')}
                  className="text-primary hover:underline font-medium ml-1 inline-flex items-center"
                >
                  Ułóż plan ↗
                </button>
              )}
            </div>
          </div>
        )}

        {/* Feed mozaikowy */}
        {loading ? (
          <p className="text-muted-foreground flex items-center gap-2 py-16">
            <Loader2 className="w-4 h-4 animate-spin" /> Wczytuję miejsca…
          </p>
        ) : (
          <div className={pokazMape ? 'mt-6 grid lg:grid-cols-[minmax(0,1fr)_minmax(0,44%)] gap-6 items-start' : 'mt-6'}>
          {/* Przez całą szerokość, także gdy mapa dzieli układ na dwie kolumny.
              Nagłówek wybranej kolekcji stoi NAD pustką, nie pod nią — inaczej
              motyw bez wyników w kadrze mapy nie miałby jak zostać zamknięty. */}
          <div className="lg:col-span-2">
            {pokazKolekcje && (
              <KolekcjeMiasta
                miejsca={places}
                onWybierz={(k) => { setKolekcja(k); setIleWidocznych(24); }}
              />
            )}
            {kolekcja && (
              <div className="mb-5 flex flex-wrap items-baseline justify-between gap-3
                              border-b border-border pb-3">
                <div className="min-w-0">
                  <h2 className="font-display text-[20px] leading-tight">{kolekcja.nazwa}</h2>
                  <p className="text-[13px] text-muted-foreground">{kolekcja.podpis}</p>
                </div>
                <button onClick={() => setKolekcja(null)}
                  className="text-[13px] text-secondary hover:text-foreground transition-colors shrink-0">
                  Wszystkie miejsca
                </button>
              </div>
            )}
          </div>
          {wObszarze.length === 0 ? (
          <div className="text-center py-20 space-y-4">
            {seeding ? (
              <SzukanieMiejsc miasto={city.trim()} sekundy={zbieraneSekundy} />
            ) : szukaAgent ? (
              <SzukamOdpowiedzi fraza={query.trim()} sekundy={szukaSekundy} />
            ) : (
              <>
            <Sparkles className="w-9 h-9 text-muted-foreground/40 mx-auto" />
            {/* Trzy różne pustki, trzy różne komunikaty. Wcześniej każda dostawała
                ten sam: "nie mamy miejsc dla tego miasta" — nawet wtedy, gdy miasto
                miało setkę miejsc, a po prostu żadne nie pasowało do wpisanej frazy.
                Użytkownik dostawał wtedy przycisk zbierania, który niczego by nie
                naprawił, bo problemem było zapytanie, nie katalog. */}
            {places.length > 0 ? (
              <>
                <p className="text-muted-foreground max-w-md mx-auto text-pretty">
                  {query.trim()
                    ? `Żadne z ${places.length} miejsc nie pasuje do: „${query.trim()}".`
                    : tylkoZObszaru && obszar && visible.length > 0
                      ? 'W tym kadrze mapy nie ma żadnego z zapisanych miejsc. Oddal mapę albo pokaż wszystkie.'
                      : 'Żadne miejsce nie pasuje do wybranego filtra.'}
                </p>
                <div className="flex flex-wrap gap-2 justify-center">
                  {query.trim() && (
                    <Button variant="outline" onClick={() => setQuery('')}>{t('odkrywaj.wyczysc_fraze')}</Button>
                  )}
                  {filter !== FILTERS[0].id && (
                    <Button variant="outline" onClick={() => setFilter(FILTERS[0].id)}>{t('odkrywaj.pokaz_wszystkie')}</Button>
                  )}
                  {kolekcja && (
                    <Button variant="outline" onClick={() => setKolekcja(null)}>Wyjdź z kolekcji</Button>
                  )}
                  {tylkoZObszaru && obszar && visible.length > 0 && (
                    <Button variant="outline" onClick={() => setTylkoZObszaru(false)}>
                      Nie ograniczaj do mapy
                    </Button>
                  )}
                </div>
              </>
            ) : (
              <>
                <p className="text-muted-foreground max-w-md mx-auto">
                  {city.trim()
                    ? `Nie mamy jeszcze miejsc dla: ${city}. Możemy je zebrać — potrwa to kilkadziesiąt sekund.`
                    : 'Wpisz miasto, żeby zobaczyć, co w nim jest.'}
                </p>
                {city.trim() && (
                  <Button onClick={seedCity} className="bg-foreground text-background hover:bg-foreground/90">
                    Zbierz miejsca dla: {city}
                  </Button>
                )}
              </>
            )}
              </>
            )}
          </div>
          ) : (
          <div className={pokazMape
            ? '[column-gap:20px] columns-1 sm:columns-2'
            : '[column-gap:24px] columns-1 sm:columns-2 lg:columns-3'}>
            {widoczne.map((p, idx) => {
              const mk = marks[p.id];
              const duration = formatDuration(p.visit_minutes);
              return (
                <article
                  key={p.id}
                  ref={(el) => { kartyRef.current[p.id] = el; }}
                  onMouseEnter={() => setAktywne(p.id)}
                  onFocus={() => setAktywne(p.id)}
                  onMouseLeave={() => setAktywne(null)}
                  className={`group mb-6 break-inside-avoid rounded-2xl border bg-card overflow-hidden
                             transition-all duration-300 shadow-sm hover:shadow-xl hover:-translate-y-0.5 ${
                    aktywne === p.id ? 'border-primary shadow-md' : 'border-border hover:border-primary/40'
                  }`}
                >
                  <button onClick={() => setKarta(p)} className="block w-full text-left">
                    <div className="relative w-full aspect-[16/10] bg-muted overflow-hidden">
                      {p.photos?.[0] && (
                        <Zdjecie src={p.photos[0]} gdzie="kafelek" alt={p.name} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
                      )}
                      {pokazMape && (
                        <span className="absolute left-3 top-3 w-6 h-6 rounded-full bg-foreground text-background
                                         flex items-center justify-center text-[11px] font-medium shadow-xs">
                          {idx + 1}
                        </span>
                      )}
                      {p.kind && (
                        <span className="absolute left-3 bottom-3 font-medium text-[10.5px]
                                         bg-background/85 backdrop-blur-md px-2.5 py-0.5 rounded-full shadow-xs border border-white/20">
                          {p.kind}
                        </span>
                      )}
                      {p.vibe_tags?.[0] && (
                        <span className="absolute right-3 top-3 text-[10.5px] bg-background/85 backdrop-blur-md
                                         px-2.5 py-0.5 rounded-full shadow-xs border border-white/20">
                          {p.vibe_tags[0]}
                        </span>
                      )}
                      <button
                        onClick={(e) => { e.stopPropagation(); toggleFavorite(p); }}
                        aria-label={t('odkrywaj.do_ulubionych')}
                        className="absolute right-3 bottom-3 w-7 h-7 rounded-full bg-background/85 backdrop-blur-md
                                   flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity shadow-xs"
                      >
                        <Heart className={`w-3.5 h-3.5 ${favorites.has(p.id) ? 'fill-accent text-accent' : 'text-muted-foreground'}`} />
                      </button>
                    </div>

                    <div className="p-4">
                      <h3 className="font-display text-[16.5px] font-semibold leading-snug group-hover:text-primary transition-colors">{p.name}</h3>
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
                      {wyroznikMiejsca(p) ? (
                        <p className="text-[13px] font-medium text-foreground/90 mt-2 border-l-2 border-primary/70 pl-2.5 leading-snug line-clamp-2 text-pretty">
                          {wyroznikMiejsca(p)}
                        </p>
                      ) : opisMiejsca(p) ? (
                        <p className="text-[13px] text-muted-foreground mt-1.5 leading-relaxed line-clamp-3 text-pretty">
                          {opisMiejsca(p)}
                        </p>
                      ) : null}
                      {(duration || p.opening_hours) && (
                        <div className="mt-2.5 flex flex-wrap gap-x-3 font-mono text-[11px] text-muted-foreground tabular-nums">
                          {duration && <span>{duration}</span>}
                          {duration && p.opening_hours && <span>·</span>}
                          {p.opening_hours && <span className="truncate max-w-[140px]">{p.opening_hours}</span>}
                        </div>
                      )}
                    </div>
                  </button>

                  {/* Stopka: jedna akcja główna jako pigułka, reszta jako tekst.
                      Podjęta decyzja jest widoczna kolorem — szałwia „na pewno",
                      terakota „być może" — więc widać ją bez czytania etykiet. */}
                  <div className="flex items-center gap-2 border-t border-border px-3 py-2.5 text-[12px]">
                    {mk === 'must' ? (
                      <>
                        <span className="rounded-full bg-primary text-primary-foreground px-3 py-1 font-medium">
                          Na pewno
                        </span>
                        <button onClick={(e) => { e.stopPropagation(); mark(p, 'nice' as Bucket); }}
                          className="text-muted-foreground hover:text-foreground transition-colors">
                          Może
                        </button>
                      </>
                    ) : mk === 'nice' ? (
                      <>
                        <span className="rounded-full bg-accent text-accent-foreground px-3 py-1 font-medium">
                          Być może
                        </span>
                        <button onClick={(e) => { e.stopPropagation(); mark(p, 'must' as Bucket); }}
                          className="text-muted-foreground hover:text-foreground transition-colors">
                          Na pewno
                        </button>
                      </>
                    ) : mk === 'rejected' ? (
                      <>
                        <span className="rounded-full bg-muted text-muted-foreground px-3 py-1 line-through">
                          Nie tym razem
                        </span>
                        <button onClick={(e) => { e.stopPropagation(); mark(p, 'must' as Bucket); }}
                          className="text-muted-foreground hover:text-foreground transition-colors">
                          Przywróć
                        </button>
                      </>
                    ) : (
                      <>
                        <button onClick={(e) => { e.stopPropagation(); mark(p, 'must' as Bucket); }}
                          className="rounded-full bg-muted px-3 py-1 font-medium hover:bg-tan/25 transition-colors">
                          Na pewno
                        </button>
                        <button onClick={(e) => { e.stopPropagation(); mark(p, 'nice' as Bucket); }}
                          className="text-muted-foreground hover:text-foreground transition-colors">
                          Może
                        </button>
                      </>
                    )}
                    {mk !== 'rejected' && (
                      <button onClick={(e) => { e.stopPropagation(); mark(p, 'rejected' as Bucket); }}
                        aria-label="Nie tym razem"
                        className="ml-auto w-6 h-6 rounded-full text-muted-foreground
                                   hover:bg-muted hover:text-foreground transition-colors">
                        ×
                      </button>
                    )}
                  </div>
                </article>
              );
            })}
          </div>
          )}

          {pokazMape && (
            <aside className="hidden lg:block lg:sticky lg:top-[88px] space-y-3">
              {/* Punkt startowy nad mapą: patrząc na pinezki najczęściej chce się
                  wiedzieć, jak daleko to od miejsca, w którym się nocuje. */}
              <div className="rounded-md border border-border bg-card px-3.5 py-3">
                <PunktStartowy
                  nazwa={(board as any)?.start_name}
                  bezPolozenia={!!(board as any)?.start_name && (board as any)?.start_lat == null}
                  destination={board?.destination}
                  wariant="zwiezly"
                  onZapisz={(n, lat, lng) => zapiszStart(n, lat, lng)}
                  onUsun={() => zapiszStart('', null, null)}
                />
              </div>

              <label className="flex items-center gap-2.5 rounded-md border border-border bg-card px-3.5 py-2.5
                                text-[13px] cursor-pointer select-none">
                <input type="checkbox" checked={tylkoZObszaru}
                  onChange={(e) => setTylkoZObszaru(e.target.checked)}
                  className="accent-primary w-4 h-4" />
                <span className="flex-1">{t('odkrywaj.pokazuj_tylko_to_co_widac')}</span>
                <span className="font-mono text-[11px] tabular-nums text-muted-foreground">
                  {wObszarze.length}
                </span>
              </label>

              <div className="rounded-md border border-border overflow-hidden bg-card">
                <DiscoverMap
                  start={(board as any)?.start_name && (board as any)?.start_lat != null
                    ? { name: (board as any).start_name, lat: (board as any).start_lat, lng: (board as any).start_lng }
                    : null}
                  places={widoczne.filter((p) => p.lat != null && p.lng != null)
                    .map((p) => ({ id: p.id, name: p.name, lat: p.lat, lng: p.lng }))}
                  aktywne={aktywne}
                  onPinClick={zPinezki}
                  onPinHover={setAktywne}
                  onObszar={setObszar}
                  doKadru={visible.filter((p) => p.lat != null && p.lng != null)
                    .map((p) => ({ lat: p.lat, lng: p.lng }))}
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
        {widoczne.length < wObszarze.length && (
          <div ref={wartownik} className="py-10 flex flex-col items-center gap-3">
            <span className="font-mono text-[12px] tabular-nums text-muted-foreground">
              {widoczne.length} z {wObszarze.length}
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
