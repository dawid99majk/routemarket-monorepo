import { Fragment, useEffect, useMemo, useState } from 'react';
import { Skeleton } from '@/components/ui/skeleton';
import PunktStartowy from '@/components/PunktStartowy';
import Zdjecie from '@/components/Zdjecie';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  AlertTriangle, ArrowLeft, Bed, CalendarDays, ChevronLeft, ChevronRight, Crosshair, Clock, Coins, Copy, ExternalLink, Loader2, MapPin, Music, Pin, Plus, RefreshCw, Search, Share2, Star, Trash2, Users, Utensils, Wand2
} from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Slider } from '@/components/ui/slider';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { supabase } from '@/integrations/supabase/client';
import PlanDayMap from '@/components/PlanDayMap';
import DiscoverMap from '@/components/DiscoverMap';
import TablicaKafelek from '@/components/TablicaKafelek';
import { podpisPubliczny } from '@/lib/uzytkownik';
import { AXES, type RoutePreferenceValues } from '@/components/RoutePreferences';
import OsPreferencji from '@/components/OsPreferencji';
import PasekNarzedziTablicy, { type NarzedzieId } from '@/components/PasekNarzedziTablicy';
import { apiPost, apiStream } from '@/lib/api';
import { zakresDat, wTerminie } from '@/lib/daty';
import { TRIP_PRESETS, EMPTY_AXES, mergePreferences, type AxisValues } from '@/lib/tripPresets';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { opisMiejsca } from '@/lib/opis';
import { format, parse, isValid } from 'date-fns';
import { pl } from 'date-fns/locale';
import { useTranslation } from 'react-i18next';
import type { Database } from '@/integrations/supabase/types';

type AktualizacjaProjektu = Database['public']['Tables']['trip_projects']['Update'];

interface TripProject extends Partial<AxisValues> {
  id: string;
  name: string;
  destination: string;
  days: number | null;
  hours_per_day: number | null;
  trip_type: string | null;
  fill_percent?: number | null;
  // Kolumny dołożone później: publikacja tablicy, licznik kopii, punkt startowy
  // i termin wyjazdu. Kod korzystał z nich przez `as any`, więc literówka w
  // nazwie przechodziła bez słowa aż do działającej aplikacji.
  is_public?: boolean;
  copy_count?: number;
  like_count?: number;
  published_at?: string | null;
  author_display?: string | null;
  start_name?: string | null;
  start_lat?: number | null;
  start_lng?: number | null;
  start_date?: string | null;
  end_date?: string | null;
}

type Priority = 'must' | 'nice' | 'rejected';

/**
 * Priorytet w bazie jest zwykłym tekstem, więc typy wygenerowane ze schematu
 * oddają go jako `string`. Zamiast rzutować wynik zapytania — co wyłącza
 * sprawdzanie i przepuściłoby literówkę w nazwie kubełka — zawężamy wartość
 * przy wejściu. Nieznana wpada do „być może": to kubełek bez konsekwencji,
 * a zgubienie miejsca byłoby gorsze niż zaklasyfikowanie go nie tam.
 */
const jakoPriorytet = (v: string | null | undefined): Priority =>
  v === 'must' || v === 'rejected' ? v : 'nice';

/** Wiersz z bazy jako miejsce tablicy, z zawężonym priorytetem. */
const jakoMiejsce = (r: Record<string, unknown>): PinnedPlace =>
  ({ ...r, priority: jakoPriorytet(r.priority as string) } as PinnedPlace);

interface PinnedPlace {
  id: string;
  name: string;
  category: string;
  priority: Priority;
  sort_order: number;
  description: string | null;
  opening_hours: string | null;
  visit_minutes: number | null;
  website: string | null;
  image_url: string | null;
  wiki_extract: string | null;
  // Bez współrzędnych nie da się ani narysować mapy tablicy, ani przekazać
  // pinezek planerowi. Kolumny są w bazie od dawna i kod je czyta — brakowało
  // ich wyłącznie w tym opisie, więc każde użycie było błędem typu.
  lat: number | null;
  lng: number | null;
  catalog_id?: string | null;
  source?: string | null;
}

interface DiscoveredPlace {
  name: string;
  category: string;
  description: string;
  why: string;
  visit_minutes: number | null;
  price_hint: string | null;
  opening_hours: string | null;
  website: string | null;
  image_url: string | null;
  wiki_extract: string | null;
  lat: number | null;
  lng: number | null;
  verified: boolean;
}

/** Strefy tablicy — kartkę przeciąga się między nimi. */
/** "1 g 30 min" zamiast "90 min" — tak ludzie mówią o czasie zwiedzania. */
function formatMinutes(min: number): string {
  const h = Math.floor(min / 60), m = min % 60;
  if (h && m) return `${h} g ${m} min`;
  if (h) return `${h} g`;
  return `${m} min`;
}

const ZONES: { id: Priority; label: string; short: string; hint: string }[] = [
  { id: 'must', label: 'Na pewno', short: 'Na pewno', hint: 'Tu trafia to, bez czego wyjazd nie ma sensu.' },
  { id: 'nice', label: 'Być może', short: 'Może', hint: 'Wypełnią luki, jeśli zostanie czas.' },
  { id: 'rejected', label: 'Nie', short: 'Nie', hint: 'Odrzucone zostają tu — bez usuwania.' }
];

const CATEGORY_ICON: Record<string, any> = {
  attraction: MapPin,
  food: Utensils,
  nightlife: Music,
  hotel: Bed,
  other: MapPin
};

/** Podpowiedzi zapytań — pokazują, że można pytać naturalnie, a nie słowami kluczowymi. */
/**
 * Pusta tablica jest gorsza niż puste pole czatu: czat sam coś proponuje, tablica
 * każe wymyślić zapytanie. Gotowe tropy zdejmują ten pierwszy opór, a ich dobór
 * idzie za charakterem wyjazdu — na delegacji i z dziećmi szuka się czego innego.
 */
const SUGGESTION_SETS: Record<string, string[]> = {
  default: [
    'klasyki, których nie wypada pominąć',
    'miejsca nieoczywiste, z dala od tłumów',
    'parki, bulwary i zieleń',
    'lokalny street food, nie turystyczne pułapki',
    'klimatyczne kawiarnie',
    'co robić wieczorem'
  ],
  family: [
    'atrakcje dla dzieci',
    'parki i place zabaw',
    'muzea, w których można czegoś dotknąć',
    'gdzie zjeść z dzieckiem',
    'klasyki, których nie wypada pominąć',
    'miejsce na przerwę i lody'
  ],
  business: [
    'jedna rzecz, którą trzeba zobaczyć',
    'dobra kolacja blisko centrum',
    'kawiarnia do pracy',
    'krótki spacer na godzinę'
  ],
  couple: [
    'klimatyczne kawiarnie',
    'punkty widokowe o zachodzie',
    'kolacja na wieczór',
    'miejsca nieoczywiste, z dala od tłumów',
    'spacer wzdłuż wody'
  ],
  solo: [
    'miejsca nieoczywiste, z dala od tłumów',
    'najlepsze kadry w mieście',
    'targi, bazary i codzienne życie',
    'sztuka współczesna i galerie'
  ]
};

interface TripProjectsProps {
  /** Podaje wyżej kontekst aktywnego wyjazdu, żeby wspólny pasek mógł go pokazać. */
  onContextChange?: (ctx: string | null) => void;
  /**
   * Tablica otwarta z adresu. Wcześniej wybór tablicy był stanem wewnątrz strony:
   * lista kafelków zostawała na ekranie, a treść zmieniała się pod nią, często
   * poniżej linii wzroku. Teraz tablica jest osobnym miejscem z własnym adresem,
   * więc kliknięcie przenosi, a nie przestawia coś w tle.
   */
  projectId?: string | null;
}

/**
 * Pozycja organizacyjna planu — przejście, przerwa, posiłek, nocleg. Nie jest
 * przystankiem: nie idzie do geokodera i nie dostaje wiersza z dystansem, bo
 * sama JEST tym, co dzieje się między przystankami.
 */
const POZYCJA_ORGANIZACYJNA =
  /^(przejazd|przej[śs]cie|przerwa|czas wolny|wolny czas|powr[óo]t|dojazd|transfer|lunch|obiad|kolacja|śniadanie|odpoczynek|spacer(\s|$)|nocleg)/i;

function czyPrzystanek(it: any): boolean {
  if (['walk', 'transit', 'break', 'meal'].includes(it?.kind)) return false;
  return !POZYCJA_ORGANIZACYJNA.test(String(it?.name || '').trim());
}

export default function TripProjects({ onContextChange, projectId }: TripProjectsProps = {}) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [projects, setProjects] = useState<TripProject[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [places, setPlaces] = useState<PinnedPlace[]>([]);
  const [loading, setLoading] = useState(true);

  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({ name: '', destination: '', days: '', hours: '', tripType: '' });
  const [userPrefs, setUserPrefs] = useState<Record<string, number> | null>(null);

  const [savedPlans, setSavedPlans] = useState<any[]>([]);
  const [shares, setShares] = useState<any[]>([]);
  const [shareEmail, setShareEmail] = useState('');
  const [sharing, setSharing] = useState(false);
  const [editingType, setEditingType] = useState(false);
  const [link, setLink] = useState('');
  const [linkBusy, setLinkBusy] = useState(false);
  const [zLinku, setZLinku] = useState<any | null>(null);
  const [wklejony, setWklejony] = useState('');
  const [wyluskaneBusy, setWyluskaneBusy] = useState(false);
  const [wyluskane, setWyluskane] = useState<any[] | null>(null);
  /** Jedno narzędzie naraz; otwieraniem zajmuje się pasek pod kubełkami. */
  const [narzedzie, setNarzedzie] = useState<NarzedzieId | null>(null);
  /** Grupowanie po kategoriach domyślnie wyłączone: przy jednej kategorii w kubełku
   *  podnagłówek powtarzał licznik kolumny tym samym numerem, tylko innym słowem. */
  /**
   * Grupowanie po kategoriach było wyłączone i schowane pod małym odnośnikiem, więc
   * przy tablicy z restauracjami i atrakcjami wszystko leżało jednym ciągiem. Włącza
   * się teraz samo, gdy tablica ma więcej niż jedną kategorię — przy samych atrakcjach
   * podział na jedną grupę byłby tylko dodatkowym nagłówkiem.
   */
  const [grouped, setGrouped] = useState(false);
  const [grupowanieRuszone, setGrupowanieRuszone] = useState(false);
  const [pokazUstawienia, setPokazUstawienia] = useState(false);
  const [podpowiedzi, setPodpowiedzi] = useState<any[]>([]);
  const [pokazPodpowiedzi, setPokazPodpowiedzi] = useState(false);
  const [planning, setPlanning] = useState(false);
  /** Sekundy od startu planowania. Samo kółko przy zapytaniu trwającym minutę
   *  wygląda jak zawieszenie — licznik dowodzi, że coś się dzieje. */
  const [planSekundy, setPlanSekundy] = useState(0);
  /** Co serwer właśnie robi. Przychodzi ze strumienia, więc nie trzeba zgadywać. */
  const [etapPlanu, setEtapPlanu] = useState<string | null>(null);

  useEffect(() => {
    if (!planning) { setPlanSekundy(0); setEtapPlanu(null); return; }
    const t = setInterval(() => setPlanSekundy((n) => n + 1), 1000);
    return () => clearInterval(t);
  }, [planning]);
  /** Który dzień planu jest pokazany. Projekt pokazuje jeden dzień naraz, bo
   *  trzy dni na jednej stronie to ściana tekstu, w której nic nie widać. */
  const [planDay, setPlanDay] = useState(0);
  const [publishing, setPublishing] = useState(false);
  // Publikacja bez podpisu daje w galerii „Tablica od podróżnika" — dwadzieścia
  // razy to samo. Nie da się tego wypełnić za użytkownika: w profilu siedzi
  // adres e-mail, a `nazwaUzytkownika` słusznie odrzuca wszystko z małpą, żeby
  // adres nie wyciekł pod tablicę. Zostaje zapytać, i to raz — odpowiedź ląduje
  // w profilu, więc kolejne tablice mają podpis od razu.
  const [pytanieOPodpis, setPytanieOPodpis] = useState(false);
  const [podpisRoboczy, setPodpisRoboczy] = useState('');
  /**
   * Podgląd wszystkich tablic: kilka zdjęć i liczba miejsc na wyjazd. `places`
   * trzyma wyłącznie aktywny wyjazd, więc kafelki pozostałych nie miały skąd wziąć
   * zdjęć i rysowały same tinty — wyglądały jak puste tablice, którymi nie były.
   */
  const [podgladTablic, setPodgladTablic] = useState<Record<string, { zdjecia: string[]; ile: number }>>({});
  /** Zakładka z adresu. Tablica i plan to dwa widoki tych samych danych, a nie
   *  dwie sekcje jednej długiej strony — inaczej "Plan" w pasku niczego nie robi. */
  const [searchParams] = useSearchParams();
  const view = searchParams.get('widok') === 'plan' ? 'plan' : 'tablica';
  const [plan, setPlan] = useState<any | null>(null);
  const [odrzuconeOtwarte, setOdrzuconeOtwarte] = useState(false);
  /** Wiersz zapisanego planu, do którego dopisujemy przeliczone przebiegi dni. */
  const [planId, setPlanId] = useState<string | null>(null);
  // Okno domyślne to pełny dzień zwiedzania. Wcześniejsze 17:00-21:00 pochodziło
  // z przykładu "trzy popołudnia" i dla kogoś planującego cały dzień z dziećmi
  // dawało plan na późny wieczór.
  const [planForm, setPlanForm] = useState({ start: '09:00', end: '17:00', date: '', dinner: '' });
  // Data w formularzu zostaje stringiem 'yyyy-MM-dd' — kalendarz potrzebuje obiektu Date
  const planDate = (() => {
    if (!planForm.date) return undefined;
    const d = parse(planForm.date, 'yyyy-MM-dd', new Date());
    return isValid(d) ? d : undefined;
  })();

  const [query, setQuery] = useState('');
  const [searching, setSearching] = useState(false);
  const [results, setResults] = useState<DiscoveredPlace[]>([]);

  useEffect(() => {
    if (projectId && projectId !== activeId) setActiveId(projectId);
  }, [projectId]);

  const active = projects.find((p) => p.id === activeId) || null;

  /** Miejsca dla mapy tablicy: tylko te ze współrzędnymi, odrzucone pomijamy —
   *  skoro zeszły z kolumn, to i z mapy, żeby nie zaśmiecały obrazu rozrzutu. */
  /** Punkt startowy w postaci, jakiej oczekuje mapa. Bez współrzędnych nie ma co
   *  rysować — sama nazwa własna wystarcza planerowi, ale nie pinezce. */
  const startNaMapie = useMemo(() => {
    const a = active as any;
    return a?.start_name && a.start_lat != null && a.start_lng != null
      ? { name: a.start_name, lat: a.start_lat, lng: a.start_lng }
      : null;
  }, [active]);

  const naMapie = useMemo(
    () => places
      .filter((x) => x.lat != null && x.lng != null && x.priority !== 'rejected')
      .map((x) => ({ id: x.id, name: x.name, lat: x.lat, lng: x.lng,
                     visit_minutes: x.visit_minutes, kubelek: x.priority as any })),
    [places]);

  useEffect(() => {
    // Raz ruszony przełącznik zostaje po stronie użytkownika — automat ma podpowiadać
    // przy pierwszym wejściu, a nie cofać cudzą decyzję przy każdym dodaniu miejsca.
    if (grupowanieRuszone) return;
    const kategorie = new Set(places.map((x) => x.category || 'other'));
    if (kategorie.size > 1) setGrouped(true);
  }, [places, grupowanieRuszone]);

  const kadrZeStartem = useMemo(
    () => (startNaMapie ? [...naMapie, startNaMapie] : naMapie),
    [naMapie, startNaMapie]);

  useEffect(() => {
    if (!onContextChange) return;
    onContextChange(active
      ? [active.destination, active.days ? `${active.days} dni` : null, active.trip_type]
          .filter(Boolean).join(' · ')
      : null);
  }, [active?.id, active?.destination, active?.days, active?.trip_type, onContextChange]);

  useEffect(() => {
    (async () => {
      const { data: userData } = await supabase.auth.getUser();
      if (!userData.user) return setLoading(false);
      // Zaproszenia wysłane na adres e-mail czekają, aż ktoś założy konto —
      // po zalogowaniu podpinamy je pod użytkownika, żeby tablice się pojawiły.
      await supabase.rpc('claim_pending_trip_shares');
      const { data } = await supabase
        .from('trip_projects')
        .select('id, name, destination, days, hours_per_day, trip_type, fill_percent, pace, popularity, wandering, dining, effort, crowds, is_public, copy_count, start_name, start_lat, start_lng')
        .order('updated_at', { ascending: false });
      setProjects(data || []);

      if (data?.length) {
        const { data: miejsca } = await supabase
          .from('trip_project_places')
          .select('project_id, image_url')
          .in('project_id', data.map((p: any) => p.id));
        const wg: Record<string, { zdjecia: string[]; ile: number }> = {};
        for (const m of miejsca ?? []) {
          const w = (wg[m.project_id] ??= { zdjecia: [], ile: 0 });
          w.ile++;
          if (m.image_url && w.zdjecia.length < 3) w.zdjecia.push(m.image_url);
        }
        setPodgladTablic(wg);
      }
      // Wejście z kreatora (?project=...) ma otworzyć świeżo utworzoną tablicę,
      // a nie ostatnio modyfikowaną — inaczej "Zapisz jako projekt" wyglądałoby
      // jakby nic nie zrobiło.
      const requested = projectId
        || new URLSearchParams(window.location.search).get('project');
      const target = requested && data?.some((p: any) => p.id === requested) ? requested : data?.[0]?.id;
      if (target) setActiveId(target);
      const { data: prefs } = await supabase
        .from('route_preferences')
        .select('pace, popularity, wandering, dining, effort, crowds')
        .eq('user_id', userData.user.id)
        .maybeSingle();
      setUserPrefs(prefs || null);
      setLoading(false);
    })();
  }, []);

  useEffect(() => {
    setNarzedzie(null);
    if (!activeId) return setPlaces([]);
    // Zmiana planu musi wyczyścić WSZYSTKO, co dotyczyło poprzedniego. Wyniki
    // wyszukiwania dla Lipska wiszące nad tablicą Bukaresztu wyglądały jak
    // niedziałające przełączanie, choć miejsca ładowały się poprawnie.
    setResults([]);
    setQuery('');
    setPlan(null);
    setPlanId(null);
    setDayRoutes({});
    setEvents([]);
    if (active?.destination) loadEvents(active.destination);
    setEditingType(false);
    setShareEmail('');
    (async () => {
      const { data } = await supabase
        .from('trip_project_places')
        .select('id, name, category, priority, lat, lng, sort_order, description, opening_hours, visit_minutes, website, image_url, wiki_extract, catalog_id')
        .eq('project_id', activeId)
        .order('sort_order', { ascending: true })
        .order('created_at', { ascending: true });
      setPlaces((data ?? []).map(jakoMiejsce));
      // Na pustej tablicy panel wyszukiwania jest jedyną treścią — nie ma czego
      // zwijać, a użytkownik i tak zaczyna od dodania pierwszego miejsca.
      if (!(data || []).length) setNarzedzie('szukaj');
      const { data: plans } = await supabase
        .from('trip_plans')
        .select('id, name, window_start, window_end, start_date, plan, created_at')
        .eq('project_id', activeId)
        .order('created_at', { ascending: false });
      setSavedPlans(plans || []);
      const { data: sh } = await supabase
        .from('trip_project_shares')
        .select('id, shared_with_email, role')
        .eq('project_id', activeId);
      setShares(sh || []);
      setPlan(null);
    })();
  }, [activeId]);

  /**
   * Publikacja zapisuje też nazwę autora do wyświetlania. Bierzemy ją stąd, bo
   * użytkownik zna własne imię — widok publiczny nie musi wtedy w ogóle sięgać
   * do tabeli kont, a adres e-mail nigdzie nie wycieka.
   */
  // `togglePublic` jest podpięte wprost pod onClick, więc NIE MOŻE brać argumentu:
  // React przekazałby tam obiekt zdarzenia i wylądowałby on w podpisie tablicy.
  // Stąd rozdzielenie — publikuje `opublikuj`, a przycisk woła wariant bez
  // argumentów. Wyłapał to kompilator, nie ja.
  const togglePublic = () => opublikuj();

  const opublikuj = async (podpisZPytania?: string) => {
    if (!active) return;
    const nowe = !active.is_public;

    // Przy publikowaniu pytamy o podpis, jeśli nie mamy skąd go wziąć.
    // Przy cofaniu publikacji nie pytamy — podpis i tak jest wtedy czyszczony.
    let autor: string | null = podpisZPytania?.trim() || null;
    if (nowe && !autor) {
      autor = await podpisPubliczny();
      if (!autor) { setPodpisRoboczy(''); setPytanieOPodpis(true); return; }
    }
    if (!nowe) autor = null;

    setPublishing(true);
    const { error } = await supabase.from('trip_projects').update({
      is_public: nowe,
      published_at: nowe ? new Date().toISOString() : null,
      ...(nowe ? { author_display: autor } : {}),
    }).eq('id', active.id);
    setPublishing(false);
    if (error) return toast.error(error.message);
    setProjects((prev) => prev.map((p) =>
      p.id === active.id ? { ...p, is_public: nowe, copy_count: (p as any).copy_count ?? 0 } as any : p));
    toast.success(nowe ? 'Tablica jest teraz publiczna' : 'Tablica znów jest prywatna');
  };

  /** Zapisuje podpis w profilu i wraca do publikacji, która o niego poprosiła. */
  const zatwierdzPodpis = async () => {
    const podpis = podpisRoboczy.trim();
    if (!podpis) return;
    if (podpis.includes('@')) {
      toast.error('To wygląda na adres e-mail — pod tablicą zobaczą go wszyscy.');
      return;
    }
    const { data } = await supabase.auth.getUser();
    if (data.user) {
      await supabase.from('profiles')
        .update({ display_name: podpis }).eq('user_id', data.user.id);
    }
    setPytanieOPodpis(false);
    await opublikuj(podpis);
  };

  /**
   * Oś ustawiona na wyjeździe przykrywa ustawienie z profilu; wyzerowana wraca
   * do dziedziczenia. Dlatego trzymamy null jako osobną wartość, a nie 50 —
   * „nie mam zdania" i „chcę dokładnie środek" to dwie różne rzeczy i tylko
   * pierwsza ma podążać za zmianą ustawień globalnych.
   */
  const ustawOs = async (klucz: keyof RoutePreferenceValues, wartosc: number | null) => {
    if (!active) return;
    setProjects((prev) => prev.map((p) => (p.id === active.id ? { ...p, [klucz]: wartosc } : p)));
    // Klucz obliczany daje obiektowi sygnaturę indeksową, a typy Supabase ją
    // odrzucają. `klucz` jest jednak zawsze jedną z osi preferencji, więc
    // zawężamy do typu aktualizacji tej tabeli zamiast wyłączać sprawdzanie.
    const zmiana: AktualizacjaProjektu = { [klucz]: wartosc };
    const { error } = await supabase.from('trip_projects')
      .update(zmiana).eq('id', active.id);
    if (error) toast.error(error.message);
  };

  const createProject = async () => {
    // Ciche wyjście zostawiało użytkownika z wrażeniem, że przycisk nie działa
    if (!form.name.trim()) return toast.error(t('tablica.podaj_nazwe_planu_np_bukareszt'));
    if (!form.destination.trim()) return toast.error(t('tablica.podaj_miasto_w_ktorym_planujesz'));
    const { data: userData } = await supabase.auth.getUser();
    if (!userData.user) return toast.error(t('tablica.zaloguj_sie_aby_tworzyc_projekty'));
    const { data, error } = await supabase
      .from('trip_projects')
      .insert({
        user_id: userData.user.id,
        name: form.name,
        destination: form.destination,
        days: form.days ? Number(form.days) : null,
        hours_per_day: form.hours ? Number(form.hours) : null,
        trip_type: form.tripType || null,
        ...(TRIP_PRESETS.find((t) => t.id === form.tripType)?.axes ?? EMPTY_AXES)
      })
      .select('id, name, destination, days, hours_per_day, trip_type, fill_percent, pace, popularity, wandering, dining, effort, crowds')
      .single();
    if (error) return toast.error(error.message);
    setProjects((prev) => [data, ...prev]);
    setActiveId(data.id);
    setCreating(false);
    setForm({ name: '', destination: '', days: '', hours: '', tripType: '' });
  };

  /**
   * Podpowiedzi nazw w trakcie pisania. Pełne wyszukiwanie pyta model i trwa
   * kilkanaście do dwudziestu kilku sekund — to sensowne przy "gdzie zjeść
   * z dzieckiem", ale nie przy kimś, kto wpisuje "Eiffel" i wie, czego chce.
   * Ten punkt końcowy nie woła modelu i odpowiada w ćwierć sekundy.
   */
  useEffect(() => {
    const q = query.trim();
    if (q.length < 2 || !active?.destination) { setPodpowiedzi([]); return; }
    let aktualne = true;
    const t = setTimeout(async () => {
      try {
        const d = await apiPost<any>('/places/suggest',
          { query: q, city: active.destination, limit: 6 }, { timeoutMs: 12_000 });
        if (aktualne) setPodpowiedzi(d.suggestions ?? []);
      } catch { if (aktualne) setPodpowiedzi([]); }
    }, 300);
    return () => { aktualne = false; clearTimeout(t); };
  }, [query, active?.destination]);

  /** Podpowiedź trafia na tablicę bez pytania modelu — mamy już wszystkie dane. */
  const przypnijPodpowiedz = async (sug: any, priority: Priority) => {
    setPokazPodpowiedzi(false);
    setQuery('');
    await pin({
      name: sug.name,
      lat: sug.lat,
      lng: sug.lng,
      category: sug.category || 'attraction',
      description: sug.description ?? undefined,
      opening_hours: sug.opening_hours ?? undefined,
      visit_minutes: sug.visit_minutes ?? undefined,
      website: sug.website ?? undefined,
      image_url: sug.photos?.[0] ?? undefined,
      photos: sug.photos ?? [],
    } as any, priority);
  };

  /**
   * Punkt startowy trafia na projekt, nie na tablicę miejsc. To nie jest atrakcja
   * do zwiedzania, tylko adres, z którego wychodzicie — planer dostaje go jako bazę
   * i zaczyna oraz kończy tam każdy dzień.
   */
  const [pokazTermin, setPokazTermin] = useState(false);
  const [terminOd, setTerminOd] = useState('');
  const [terminDo, setTerminDo] = useState('');

  /**
   * Termin wyjazdu jest opcjonalny i taki zostaje — wyjazd bez dat działa
   * normalnie, jako szkic. Dopiero gdy jest, zaczyna sterować resztą: godziny
   * otwarcia liczą się dla właściwej pory roku, a wydarzenia w terminie idą
   * na górę listy.
   */
  const zapiszTermin = async (od: string | null, doDnia: string | null) => {
    if (!active) return;
    const dni = od && doDnia
      ? Math.round((new Date(doDnia).getTime() - new Date(od).getTime()) / 86_400_000) + 1
      : null;
    if (dni !== null && dni < 1) return toast.error(t('tablica.koniec_nie_moze_byc_przed'));

    const patch: any = { start_date: od, end_date: doDnia };
    // Liczba dni wynika z terminu — trzymanie dwóch niezależnych prawd o długości
    // wyjazdu skończyłoby się planem na trzy dni w dwudniowym terminie.
    if (dni !== null) patch.days = dni;

    const { error } = await (supabase as any).from('trip_projects').update(patch).eq('id', active.id);
    if (error) return toast.error(error.message);
    setProjects((prev) => prev.map((x) => (x.id === active.id ? { ...x, ...patch } as any : x)));
    setPokazTermin(false);
    toast.success(od ? `Termin: ${zakresDat(od, doDnia)}` : 'Termin usunięty');
  };


  const ustawStart = async (sug: any | null) => {
    if (!active) return;
    const patch = sug
      ? { start_name: sug.name, start_lat: sug.lat ?? null, start_lng: sug.lng ?? null }
      : { start_name: null, start_lat: null, start_lng: null };
    const { error } = await supabase.from('trip_projects').update(patch).eq('id', active.id);
    if (error) return toast.error(error.message);
    setProjects((prev) => prev.map((p) => (p.id === active.id ? { ...p, ...patch } as any : p)));
    toast.success(sug ? `Start: ${sug.name}` : 'Punkt startowy usunięty');
  };

  /**
   * Miejsce z wklejonego odnośnika. Pokazujemy podgląd, zanim cokolwiek trafi
   * na tablicę — rozpoznanie po adresie bywa przybliżone i lepiej, żeby to
   * użytkownik potwierdził, że chodziło o to miejsce.
   */
  const rozpoznajLink = async () => {
    if (!link.trim() || !active) return;
    setLinkBusy(true);
    setZLinku(null);
    try {
      const d = await apiPost<any>('/places/from-link',
        { link: link.trim(), city: active.destination }, { timeoutMs: 45_000 });
      // Odnośnik wyszukiwania po obszarze zwraca listę, odnośnik miejsca — jeden punkt.
      // Listę pokazujemy tam, gdzie miejsca wyłuskane z tekstu: to ta sama czynność.
      if (Array.isArray(d.places)) {
        setWyluskane(d.places);
        setZLinku(null);
        if (d.places.length === 0) toast.info(t('tablica.w_tym_obszarze_nic_nie'));
        else toast.success(`Znalazłem ${d.places.length} miejsc w tym obszarze`);
      } else {
        setZLinku(d.place);
      }
    } catch (e: any) {
      toast.error(e.message || 'Nie udało się rozpoznać tego odnośnika');
    } finally {
      setLinkBusy(false);
    }
  };

  const dodajZLinku = async (priority: Priority) => {
    if (!zLinku) return;
    await pin({
      name: zLinku.name, lat: zLinku.lat, lng: zLinku.lng,
      category: zLinku.category || 'attraction',
      description: '', opening_hours: null, website: null,
      visit_minutes: null, image_url: null, wiki_extract: null,
    } as any, priority);
    setZLinku(null);
    setLink('');
  };

  /**
   * Miejsca z wklejonej treści albo z adresu artykułu. Jedno pole obsługuje oba
   * przypadki, bo z punktu widzenia użytkownika to ta sama czynność: mam gdzieś
   * listę miejsc i chcę ją mieć u siebie.
   */
  const wyluskaj = async () => {
    const wejscie = wklejony.trim();
    if (!wejscie || !active) return;
    setWyluskaneBusy(true);
    setWyluskane(null);
    try {
      const czyAdres = /^https?:\/\//i.test(wejscie);
      const d = await apiPost<any>('/places/extract',
        czyAdres
          ? { url: wejscie, city: active.destination }
          : { text: wejscie, city: active.destination },
        { timeoutMs: 120_000 });
      setWyluskane(d.places ?? []);
      if (!d.places?.length) toast.info(t('tablica.nie_znalaz_em_w_tym'));
    } catch (e: any) {
      toast.error(e.message || 'Nie udało się wyłuskać miejsc');
    } finally {
      setWyluskaneBusy(false);
    }
  };

  const dodajWyluskane = async (m: any, priority: Priority) => {
    await pin({
      name: m.name, lat: m.lat, lng: m.lng, category: 'attraction',
      description: m.note || '', opening_hours: null, website: null,
      visit_minutes: null, image_url: null, wiki_extract: null,
    } as any, priority);
    setWyluskane((prev) => (prev ?? []).filter((x) => x.name !== m.name));
  };

  const search = async (q: string) => {
    if (!active || !q.trim()) return;
    setSearching(true);
    setResults([]);
    try {
      const data = await apiPost<any>('/discover-places', {
        query: q,
        destination: active.destination,
        creator_preferences: mergePreferences(userPrefs, active)
      });
      setResults(data.places || []);
      if (!data.places || data.places.length === 0) {
        toast.info(t('tablica.nic_nie_znalaz_em_dla'));
      }
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setSearching(false);
    }
  };

  const pin = async (place: DiscoveredPlace, priority: Priority) => {
    if (!active) return;

    // Wpis w katalogu przed przypięciem: to samo miejsce na trzech tablicach ma
    // być jednym bytem z własną stroną, a nie trzema niezależnymi wierszami.
    // Nieudany zapis katalogu nie może blokować przypięcia — tablica jest
    // ważniejsza niż porządek w katalogu.
    // Kolejność ma znaczenie dla odczucia szybkości. Wcześniej czekaliśmy na wpis
    // do katalogu, zanim cokolwiek trafiło na tablicę — a to jest zapytanie do API,
    // które potrafi trwać sekundy. Kliknięcie wyglądało wtedy na nieskuteczne
    // i ludzie klikali drugi raz. Teraz miejsce ląduje na tablicy od razu,
    // a katalog dopisuje się w tle i dosyła identyfikator.
    const wpiszDoKatalogu = () => apiPost<any>('/catalog/upsert', {
        name: place.name,
        lat: place.lat,
        lng: place.lng,
        city: active.destination,
        category: place.category,
        description: place.description,
        wiki_extract: place.wiki_extract,
        photos: (place as any).photos ?? (place.image_url ? [place.image_url] : []),
        opening_hours: place.opening_hours,
        website: place.website,
        visit_minutes: place.visit_minutes
      });

    setResults((prev) => prev.filter((r) => r.name !== place.name));

    const { data, error } = await supabase
      .from('trip_project_places')
      .insert({
        project_id: active.id,
        name: place.name,
        category: place.category,
        priority,
        lat: place.lat,
        lng: place.lng,
        description: place.description,
        opening_hours: place.opening_hours,
        visit_minutes: place.visit_minutes,
        website: place.website,
        image_url: place.image_url,
        wiki_extract: place.wiki_extract
      })
      .select('id, name, category, priority, lat, lng, sort_order, description, opening_hours, visit_minutes, website, image_url, wiki_extract, catalog_id')
      .single();
    if (error) {
      setResults((prev) => [place, ...prev]);
      return toast.error(error.message);
    }
    setPlaces((prev) => [...prev, jakoMiejsce(data)]);
    toast.success(`Dodano: ${place.name}`);

    // Katalog dopisujemy po fakcie. Nieudany zapis nie ma prawa cofnąć przypięcia —
    // tablica jest ważniejsza niż porządek w katalogu.
    wpiszDoKatalogu()
      .then(async (cat: any) => {
        if (!cat?.id) return;
        await supabase.from('trip_project_places')
          .update({ catalog_id: cat.id }).eq('id', data.id);
        setPlaces((prev) => prev.map((x) => (x.id === data.id ? { ...x, catalog_id: cat.id } : x)));
      })
      .catch((err) => console.warn('Nie udało się dopisać miejsca do katalogu:', err));
  };

  const unpin = async (id: string) => {
    await supabase.from('trip_project_places').delete().eq('id', id);
    setPlaces((prev) => prev.filter((p) => p.id !== id));
  };

  const movePlace = async (id: string, priority: Priority, beforeId?: string) => {
    // Kolejność liczymy lokalnie i zapisujemy tylko przesunięte kartki —
    // tablica rośnie tygodniami, więc użytkownik chce nad nią panować.
    const moved = places.find((p) => p.id === id);
    if (!moved) return;
    const rest = places.filter((p) => p.id !== id);
    const zonePlaces = rest.filter((p) => p.priority === priority);
    const idx = beforeId ? zonePlaces.findIndex((p) => p.id === beforeId) : zonePlaces.length;
    const target = idx < 0 ? zonePlaces.length : idx;
    const reordered = [...zonePlaces.slice(0, target), { ...moved, priority }, ...zonePlaces.slice(target)];
    const withOrder = reordered.map((p, i) => ({ ...p, sort_order: i }));
    setPlaces([...rest.filter((p) => p.priority !== priority), ...withOrder]);
    const changed = withOrder.filter((p) => {
      const before = places.find((x) => x.id === p.id);
      return !before || before.sort_order !== p.sort_order || before.priority !== p.priority;
    });
    for (const p of changed) {
      const { error } = await supabase
        .from('trip_project_places')
        .update({ priority: p.priority, sort_order: p.sort_order })
        .eq('id', p.id);
      if (error) return toast.error(error.message);
    }
  };

  const groupByCategory = (list: PinnedPlace[]) => {
    const order = ['attraction', 'food', 'nightlife', 'hotel', 'other'];
    const labels: Record<string, string> = {
      attraction: 'Atrakcje', food: 'Jedzenie', nightlife: 'Wieczory', hotel: 'Nocleg', other: 'Inne'
    };
    return order
      .map((cat) => ({ cat, label: labels[cat], items: list.filter((p) => (p.category || 'other') === cat) }))
      .filter((g) => g.items.length > 0);
  };

  /**
   * Ile z dostępnego czasu ma być zaplanowane. Reszta to celowa pustka: dzień
   * wypełniony atrakcjami co do minuty nie jest planem, tylko listą zadań, a
   * najlepsze rzeczy w podróży zwykle zdarzają się w tych lukach.
   */
  const saveFillPercent = async (value: number) => {
    if (!active) return;
    setProjects((prev) => prev.map((p) => (p.id === active.id ? { ...p, fill_percent: value } : p)));
    const { error } = await supabase
      .from('trip_projects').update({ fill_percent: value }).eq('id', active.id);
    if (error) toast.error(error.message);
  };

  /**
   * Karta miejsca z planu. Propozycje agenta widniały jako sama nazwa w
   * harmonogramie — nie dało się sprawdzić, co to właściwie jest, więc decyzja
   * "zostawiam czy wyrzucam" była zgadywanką. Opis i zdjęcia bierzemy z tego
   * samego mechanizmu, który obsługuje karty punktów na mapie.
   */
  /**
   * Dokładny kilometraż dnia. Domyślnie pokazujemy szacunek z odcinków między
   * punktami razy 1,3, bo policzenie prawdziwego przebiegu to osobne zapytanie
   * routingu na każdy dzień. Kto chce twardej liczby, prosi o nią jednym
   * kliknięciem — i wtedy dostaje przebieg po chodnikach, a nie po linii prostej.
   */
  const [dayRoutes, setDayRoutes] = useState<Record<number, { km: number; h: number; track: [number, number][] | null } | 'loading'>>({});

  /**
   * Otwarcie zapisanego planu przywraca też przebiegi policzone przy poprzednim
   * podejściu — inaczej mapa wracała do przerywanej linii prostej, choć trasa
   * była już opłacona i zapisana.
   */
  const otworzPlan = (sp: any) => {
    setPlan(sp.plan);
    setPlanId(sp.id);
    const zapisane: Record<number, { km: number; h: number; track: [number, number][] | null }> = {};
    for (const d of sp.plan?.days || []) {
      if (Array.isArray(d.track) && d.track.length > 1) {
        zapisane[d.day] = { km: d.route_km ?? 0, h: d.route_h ?? 0, track: d.track };
      }
    }
    setDayRoutes(zapisane);
  };

  /**
   * Wyjście z otwartego planu do listy wszystkich. Lista renderowała się dotąd
   * pod całym planem, więc przy dwudniowym wyjeździe leżała jakieś dwa ekrany
   * niżej — technicznie dostępna, praktycznie nie.
   */
  const pokazWszystkiePlany = () => {
    setPlan(null);
    setPlanId(null);
    setDayRoutes({});
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const recalcDay = async (day: any) => {
    const points = (day.items || [])
      .filter((it: any) => it.lat != null && it.lng != null)
      .map((it: any) => ({ lat: it.lat, lng: it.lng, name: it.name }));
    if (points.length < 2) return toast.error(t('tablica.ten_dzien_ma_za_ma'));

    setDayRoutes((prev) => ({ ...prev, [day.day]: 'loading' }));
    try {
      const data = await apiPost<any>('/live-route', {
        points,
        route_type: 'city_walk',
        intent: 'popular'
      }, { timeoutMs: 90_000 });
      const wynik = {
        km: data.distance_km,
        h: data.duration_h,
        // Ślad z routera trzymamy przy dniu, żeby mapa obok pokazała ten sam
        // przebieg, o którym mówią liczby w pasku.
        track: Array.isArray(data.trackPoints)
          ? data.trackPoints.map((t: any[]) => [t[0], t[1]] as [number, number])
          : null
      };
      setDayRoutes((prev) => ({ ...prev, [day.day]: wynik }));

      // Przebieg kosztuje 10 tokenów, a leżał wyłącznie w stanie komponentu —
      // odświeżenie strony kasowało to, za co użytkownik zapłacił, i kazało
      // płacić drugi raz. Dopisujemy go do zapisanego planu.
      if (planId && wynik.track) {
        const zPrzebiegiem = {
          ...plan,
          days: (plan?.days || []).map((d: any) =>
            d.day === day.day
              ? { ...d, track: wynik.track, route_km: wynik.km, route_h: wynik.h }
              : d)
        };
        setPlan(zPrzebiegiem);
        setSavedPlans((prev) => prev.map((sp) =>
          sp.id === planId ? { ...sp, plan: zPrzebiegiem } : sp));
        await supabase.from('trip_plans').update({ plan: zPrzebiegiem }).eq('id', planId);
      }
    } catch (err: any) {
      setDayRoutes((prev) => { const next = { ...prev }; delete next[day.day]; return next; });
      toast.error(err.message || 'Nie udało się przeliczyć dnia');
    }
  };

  /**
   * Wydarzenia w mieście wyjazdu. To jedyna warstwa, której nie ma w przewodnikach,
   * bo wystawa trwa trzy tygodnie — a jednocześnie najczęstszy powód, dla którego
   * ktoś w ogóle przestawia termin albo dokłada dzień.
   */
  const [events, setEvents] = useState<any[]>([]);
  const [eventsBusy, setEventsBusy] = useState(false);

  /**
   * Saldo tokenów. Zbieranie miejsc jest darmowe, płatne są dopiero momenty, w
   * których prosisz o gotowy wynik — dlatego licznik stoi przy tablicy, a nie
   * na wejściu do serwisu.
   */
  const [tokens, setTokens] = useState<{ balance: number; prices: Record<string, number> } | null>(null);
  const refreshTokens = async () => {
    try {
      const { data } = await supabase.auth.getSession();
      const base = import.meta.env.VITE_API_URL || '/route-builder-api';
      const res = await fetch(`${base}/tokens/balance`, {
        headers: data.session?.access_token ? { Authorization: `Bearer ${data.session.access_token}` } : {}
      });
      if (res.ok) setTokens(await res.json());
    } catch { /* licznik jest informacją, nie warunkiem pracy */ }
  };
  useEffect(() => { refreshTokens(); }, []);

  /**
   * Wydarzenie na tablicę. Dotąd panel wydarzeń tylko informował, że coś się dzieje,
   * i nie dawało się z tym zrobić nic — a przecież festiwal w terminie wyjazdu jest
   * dokładnie tym, wokół czego układa się dzień.
   *
   * Gdy wydarzenie ma dopasowane miejsce w katalogu, bierzemy stamtąd współrzędne
   * i zdjęcie. Bez dopasowania wpis trafia bez punktu — świadomie, bo zmyślona
   * pinezka jest gorsza niż jej brak; użytkownik może ją potem ustawić sam.
   */
  const wydarzenieNaTablice = async (ev: any) => {
    if (!active) return;
    if (places.some((p) => p.name === ev.name)) {
      return toast.info(t('tablica.to_wydarzenie_jest_juz_na'));
    }
    const zKatalogu = ev.place_id
      ? (await (supabase as any).from('place_catalog').select('*').eq('id', ev.place_id).maybeSingle()).data
      : null;

    const termin = zakresDat(ev.starts_on, ev.ends_on);
    const { data, error } = await (supabase as any).from('trip_project_places').insert({
      project_id: active.id,
      catalog_id: ev.place_id ?? null,
      name: ev.name,
      category: 'event',
      priority: 'nice',
      lat: zKatalogu?.lat ?? null,
      lng: zKatalogu?.lng ?? null,
      description: [termin, ev.description].filter(Boolean).join(' · '),
      image_url: zKatalogu?.photos?.[0] ?? null,
      source: 'event',
    }).select('*').single();

    if (error) return toast.error(error.message);
    setPlaces((prev) => [...prev, jakoMiejsce(data)]);
    toast.success(zKatalogu
      ? `Dodane do tablicy: ${ev.name}`
      : `Dodane do tablicy: ${ev.name} — bez punktu na mapie, ustaw go na kartce`);
  };

  /**
   * Wydarzenia z terminu wyjazdu na górze, reszta pod nimi.
   *
   * Reszty nie ukrywamy celowo: ktoś, kto zobaczy ciekawy festiwal dwa tygodnie
   * po swoim terminie, może ten termin przesunąć — a nie zrobi tego, jeśli nigdy
   * o nim nie usłyszy. Bez ustawionego terminu kolejność zostaje chronologiczna.
   */
  const wydarzeniaPodzielone = useMemo(() => {
    const od = (active as any)?.start_date ?? null;
    const doDnia = (active as any)?.end_date ?? null;
    if (!od) return { wTerminieLista: [] as any[], pozostale: events };
    const wTerminieLista = events.filter((e) => wTerminie(e.starts_on, e.ends_on, od, doDnia));
    const pozostale = events.filter((e) => !wTerminie(e.starts_on, e.ends_on, od, doDnia));
    return { wTerminieLista, pozostale };
  }, [events, active]);

  const loadEvents = async (city: string) => {
    const today = new Date().toISOString().slice(0, 10);
    const { data } = await supabase
      .from('place_events').select('*')
      .ilike('city', city)
      .gte('ends_on', today)
      .order('starts_on', { ascending: true })
      .limit(12);
    setEvents(data ?? []);
  };

  const refreshEvents = async () => {
    if (!active) return;
    setEventsBusy(true);
    try {
      const data = await apiPost<any>('/events/refresh', { city: active.destination }, { timeoutMs: 120_000 });
      await loadEvents(active.destination);
      toast.success(data.saved > 0 ? `Znaleziono ${data.saved} wydarzeń` : 'Nie znaleziono nowych wydarzeń');
    } catch (err: any) {
      toast.error(err.message || 'Nie udało się pobrać wydarzeń');
    } finally {
      setEventsBusy(false);
    }
  };

  const [placeCard, setPlaceCard] = useState<any | null>(null);
  /** Pinezka pod kursorem — wyróżniona na mapie, żeby było widać, że da się w nią kliknąć. */
  const [pinezkaPodKursorem, setPinezkaPodKursorem] = useState<string | null>(null);
  const [cardLoading, setCardLoading] = useState(false);
  const [cardPhoto, setCardPhoto] = useState(0);

  const openPlaceCard = async (item: any) => {
    const pinned = places.find((p) => p.name === item.name);
    setPlaceCard({
      name: item.name,
      note: item.note || '',
      minutes: item.minutes || pinned?.visit_minutes || null,
      opening_hours: pinned?.opening_hours || null,
      website: pinned?.website || null,
      description: pinned?.description || '',
      photos: pinned?.image_url ? [pinned.image_url] : [],
      source: item.source,
      // Numer pinezki i notatka wędrują do karty: bez nich trzeba było wracać
      // do listy i szukać po nazwie, o którym punkcie mowa.
      nr: item.nr ?? null,
      minutesRaw: item.minutes ?? null
    });
    setCardPhoto(0);

    // Galeria ze źródła. Tablica trzyma jedno zdjęcie — kopię z chwili przypięcia —
    // a katalog ma ich do trzech i jest aktualny. Powiązanie `catalog_id` pozwala
    // pokazać pełną galerię zamiast pojedynczej, czasem przeterminowanej miniatury.
    if (pinned?.catalog_id) {
      (supabase as any).from('place_catalog')
        .select('photos, description, opening_hours, website')
        .eq('id', pinned.catalog_id).maybeSingle()
        .then(({ data: kat }: any) => {
          if (!kat) return;
          const zKatalogu: string[] = Array.isArray(kat.photos) ? kat.photos.filter(Boolean) : [];
          setPlaceCard((prev: any) => prev && prev.name === item.name ? {
            ...prev,
            photos: zKatalogu.length ? zKatalogu : prev.photos,
            description: prev.description || kat.description || '',
            opening_hours: prev.opening_hours || kat.opening_hours || null,
            website: prev.website || kat.website || null,
          } : prev);
        });
    }

    // Przypięte miejsce zwykle ma już opis z wyszukiwarki; propozycję agenta
    // trzeba dociągnąć, bo w planie jest tylko jej nazwa.
    if (pinned?.description && pinned?.image_url) return;
    if (item.lat == null || item.lng == null) return;
    setCardLoading(true);
    try {
      const data = await apiPost<any>('/points-details', {
        points: [{ name: item.name, lat: item.lat, lng: item.lng }]
      }, { timeoutMs: 60_000 });
      const d = data.details?.[item.name];
      if (d) {
        setPlaceCard((prev: any) => prev && prev.name === item.name ? {
          ...prev,
          description: prev.description || d.description || '',
          recommendation: d.recommendation || '',
          photos: (d.photos?.length ? d.photos : prev.photos) || []
        } : prev);
      }
    } catch {
      // Brak opisu nie jest powodem, żeby nie pokazać tego, co już mamy
    } finally {
      setCardLoading(false);
    }
  };

  const changeTripType = async (presetId: string) => {
    if (!active) return;
    const preset = TRIP_PRESETS.find((t) => t.id === presetId);
    const patch = presetId
      ? { trip_type: presetId, ...(preset?.axes ?? EMPTY_AXES) }
      : { trip_type: null, ...EMPTY_AXES };
    const { error } = await supabase
      .from('trip_projects')
      .update({ ...patch, updated_at: new Date().toISOString() })
      .eq('id', active.id);
    if (error) return toast.error(error.message);
    setProjects((prev) => prev.map((p) => (p.id === active.id ? { ...p, ...patch } : p)));
    setEditingType(false);
    toast.success(preset ? `Charakter: ${preset.label}` : 'Charakter wyczyszczony — wracają Twoje domyślne preferencje');
  };

  const duplicateProject = async () => {
    if (!active) return;
    const { data: userData } = await supabase.auth.getUser();
    if (!userData.user) return;
    const { data: copy, error } = await supabase
      .from('trip_projects')
      .insert({
        user_id: userData.user.id,
        name: `${active.name} (kopia)`,
        destination: active.destination,
        days: active.days,
        hours_per_day: active.hours_per_day,
        trip_type: active.trip_type,
        pace: active.pace ?? null, popularity: active.popularity ?? null,
        wandering: active.wandering ?? null, dining: active.dining ?? null,
        effort: active.effort ?? null, crowds: active.crowds ?? null
      })
      .select('id, name, destination, days, hours_per_day, trip_type, fill_percent, pace, popularity, wandering, dining, effort, crowds')
      .single();
    if (error) return toast.error(error.message);
    if (places.length > 0) {
      const { data: full } = await supabase
        .from('trip_project_places')
        .select('name, category, priority, lat, lng, description, opening_hours, visit_minutes, source')
        .eq('project_id', active.id);
      if (full?.length) {
        await supabase.from('trip_project_places')
          .insert(full.map((f: any) => ({ ...f, project_id: copy.id })));
      }
    }
    setProjects((prev) => [copy, ...prev]);
    setActiveId(copy.id);
    toast.success(t('tablica.skopiowano_tablice_razem_z_miejscami'));
  };

  const shareProject = async () => {
    if (!active || !shareEmail.trim()) return;
    setSharing(true);
    try {
      const { data, error } = await supabase
        .from('trip_project_shares')
        .insert({ project_id: active.id, shared_with_email: shareEmail.trim().toLowerCase() })
        .select('id, shared_with_email, role')
        .single();
      if (error) throw error;
      setShares((prev) => [...prev, data]);
      setShareEmail('');
      // Żaden mail stąd nie wychodzi — w całym API nie ma wysyłki poczty. Dostęp
      // działa: has_project_access dopasowuje adres z tokenu, więc tablica pojawi
      // się tej osobie po zalogowaniu. Komunikat mówi więc, co się stało naprawdę,
      // i zostawia wysłanie odnośnika użytkownikowi.
      toast.success(t('tablica.dodano_dostep_tablica_pojawi_sie'));
    } catch (err: any) {
      toast.error(err.message.includes('duplicate') ? 'Ta osoba już ma dostęp' : err.message);
    } finally {
      setSharing(false);
    }
  };

  const revokeShare = async (id: string) => {
    await supabase.from('trip_project_shares').delete().eq('id', id);
    setShares((prev) => prev.filter((s) => s.id !== id));
  };

  /**
   * Most do kreatora: z harmonogramu robimy projekt trasy z prawdziwymi
   * współrzędnymi przypiętych miejsc, charakterem wyjazdu i historią rozmowy,
   * po czym otwieramy kreator. Bez tego plan kończył się tekstem.
   */
  const buildRouteFrom = async (items: any[], label: string) => {
    if (!active) return;
    // Pozycje organizacyjne nie są przystankami trasy
    // Jedna definicja dla całego pliku: bez tego pozycja organizacyjna szła do
    // geokodera i lądowała w przypadkowym mieście.
    const isVenue = czyPrzystanek;

    const venues = items.filter(isVenue);
    const resolved: { lat: number; lng: number; name: string; type: string }[] = [];
    const unresolved: string[] = [];

    for (const it of venues) {
      // Planer dokleja współrzędne do każdej pozycji, którą potrafi umiejscowić —
      // także do własnych propozycji. Korzystamy z nich w pierwszej kolejności,
      // żeby nie odsyłać nazwy do geokodera: to ten krok wysyłał trasy w
      // przypadkowe miasta.
      if (it.lat != null && it.lng != null) {
        resolved.push({ lat: it.lat, lng: it.lng, name: it.name, type: 'waypoint' });
        continue;
      }
      const place = places.find(
        (p) => p.name === it.name || it.name?.includes(p.name) || p.name.includes(it.name)
      );
      if (place?.lat && place?.lng) {
        resolved.push({ lat: place.lat, lng: place.lng, name: place.name, type: 'waypoint' });
      } else {
        unresolved.push(it.name);
        resolved.push(null as any);
      }
    }

    // Propozycje agenta mają tylko nazwy — dogeokodowujemy je, żeby nie wypadały
    // z trasy tylko dlatego, że nie zostały wcześniej przypięte.
    if (unresolved.length > 0) {
      try {
        const data = await apiPost<any>('/geocode-points', { names: unresolved, near: active.destination });
        const found = new Map<string, { lat: number; lng: number }>();
        for (const pt of data.points || []) {
          if (pt.lat != null && pt.lng != null) found.set(pt.name, { lat: pt.lat, lng: pt.lng });
        }
        let cursor = 0;
        for (let i = 0; i < resolved.length; i++) {
          if (resolved[i] !== null) continue;
          const name = unresolved[cursor++];
          const hit = found.get(name);
          resolved[i] = hit ? { ...hit, name, type: 'waypoint' } : (null as any);
        }
      } catch {
        toast.error(t('tablica.nie_uda_o_sie_ustalic'));
      }
    }

    const waypoints = resolved.filter(Boolean) as { lat: number; lng: number; name: string; type: string }[];

    // Ostatnia bariera po stronie klienta: jeśli mimo wszystko któryś punkt
    // wypadł daleko poza skupisko, nie wpuszczamy go do trasy.
    if (waypoints.length >= 3) {
      const lats = [...waypoints.map((w) => w.lat)].sort((a, b) => a - b);
      const lngs = [...waypoints.map((w) => w.lng)].sort((a, b) => a - b);
      const mid = Math.floor(waypoints.length / 2);
      const cLat = lats[mid];
      const cLng = lngs[mid];
      const kmFrom = (w: { lat: number; lng: number }) => {
        const dLat = (w.lat - cLat) * 111;
        const dLng = (w.lng - cLng) * 111 * Math.cos((cLat * Math.PI) / 180);
        return Math.sqrt(dLat * dLat + dLng * dLng);
      };
      const far = waypoints.filter((w) => kmFrom(w) > 40);
      if (far.length > 0) {
        for (const w of far) waypoints.splice(waypoints.indexOf(w), 1);
        toast.warning(`Pominięto ${far.length} punktów poza obszarem wyjazdu: ${far.map((w) => w.name).join(', ')}`);
      }
    }

    if (waypoints.length < 2) {
      toast.error(t('tablica.za_ma_o_miejsc_ze'));
      return;
    }
    waypoints[0].type = 'start';
    waypoints[waypoints.length - 1].type = 'end';

    const { data: userData } = await supabase.auth.getUser();
    if (!userData.user) return;
    const brief = `${active.destination}: ${label}. Miejsca: ${waypoints.map((w) => w.name).join(', ')}.`;
    const { data, error } = await supabase
      .from('route_builder_projects')
      .insert({
        user_id: userData.user.id,
        requirements: {
          title: `${active.name} — ${label}`,
          waypoints,
          vehicleType: 'city',
          inputNotes: brief,
          routingPreference: (active.popularity ?? 50) > 60 ? 'wild' : 'popular',
          tripProfile: { start_point: waypoints[0].name },
          // Punkty są ustalone — kreator ma policzyć przebieg, a nie zaczynać wywiad
          autoCalculate: true,
          phase: 'generate',
          chatMessages: [
            { role: 'user', text: brief },
            { role: 'agent', text: `Przeniosłem ${waypoints.length} miejsc z planu. Wyznaczam przebieg — możesz go potem zmienić, przesuwając punkty albo pisząc, co poprawić.` }
          ]
        }
      })
      .select('id')
      .single();
    if (error) return toast.error(error.message);
    const skipped = venues.length - waypoints.length;
    if (skipped > 0) toast.info(`Pominięto ${skipped} miejsc, których nie udało się zlokalizować`);
    navigate(`/route-builder-v2?projectId=${data.id}`);
  };

  /** Propozycja agenta, która się spodobała, trafia na tablicę jak każde inne miejsce. */
  const pinSuggestion = async (item: any) => {
    if (!active) return;
    const { data, error } = await supabase
      .from('trip_project_places')
      .insert({
        project_id: active.id,
        name: item.name,
        category: 'attraction',
        priority: 'nice',
        visit_minutes: item.minutes || null,
        description: item.note || '',
        source: 'plan'
      })
      .select('id, name, category, priority, lat, lng, sort_order, description, opening_hours, visit_minutes, website, image_url, wiki_extract, catalog_id')
      .single();
    if (error) return toast.error(error.message);
    setPlaces((prev) => [...prev, jakoMiejsce(data)]);
    toast.success(`Dodano do tablicy: ${item.name}`);
  };

  const deletePlan = async (id: string) => {
    await supabase.from('trip_plans').delete().eq('id', id);
    setSavedPlans((prev) => prev.filter((p) => p.id !== id));
  };

  const buildPlan = async () => {
    if (!active || places.length === 0) return;
    setPlanning(true);
    setPlan(null);
    try {
      // Punkt startowy z tablicy ma pierwszeństwo; hotel przypięty jako zwykłe
      // miejsce jest zapasem, gdy nikt startu nie ustawił.
      const hotelZTablicy = places.find((p) => p.category === 'hotel');
      const start = active.start_name
        ? { name: active.start_name,
            lat: active.start_lat ?? undefined,
            lng: active.start_lng ?? undefined }
        : hotelZTablicy
          ? { name: hotelZTablicy.name,
              lat: hotelZTablicy.lat ?? undefined,
              lng: hotelZTablicy.lng ?? undefined }
          : null;
      const zadanie = {
        destination: active.destination,
        days: active.days || 1,
        window: { start: planForm.start, end: planForm.end },
        hotel: start,
        start_date: planForm.date || undefined,
        fill_percent: active.fill_percent ?? 70,
        fixed: planForm.dinner ? [{ time: planForm.dinner, label: 'kolacja', minutes: 60 }] : [],
        places: places.map((p) => ({
          name: p.name, category: p.category, priority: p.priority,
          // Bez tych dwóch pól backend nie ma czym dopasować przypiętych miejsc:
          // jego pula współrzędnych odrzuca pozycje bez lat/lng, więc zostawały
          // w niej same propozycje agenta i tylko one trafiały na mapę.
          lat: p.lat, lng: p.lng,
          opening_hours: p.opening_hours, visit_minutes: p.visit_minutes, description: p.description
        })),
        creator_preferences: mergePreferences(userPrefs, active)
      };

      /**
       * Plan przychodzi dzień po dniu. Każdy gotowy dzień od razu ląduje na
       * ekranie, więc czytanie zaczyna się, zanim policzy się reszta — a przy
       * planie na kilka dni to różnica między patrzeniem w licznik a czytaniem
       * pierwszego dnia.
       *
       * Stan trzymamy w obiekcie, nie w zmiennej: przypisania dzieją się w
       * wywołaniu zwrotnym, a TypeScript zawęziłby wtedy typ zmiennej do jej
       * wartości początkowej.
       */
      const stan = { blad: null as string | null };
      let zebrane: any = { days: [], warnings: [], not_scheduled: [] };

      try {
        await apiStream('/plan-trip/stream', zadanie, (z) => {
          if (z.typ === 'etap') {
            setEtapPlanu(z.opis ?? null);
          } else if (z.typ === 'dzien' && z.dzien) {
            zebrane = {
              ...zebrane,
              days: [...zebrane.days, z.dzien].sort((a: any, b: any) => a.day - b.day),
            };
            setPlan(zebrane);
            setEtapPlanu(`Gotowy dzień ${z.dzien.day} z ${active.days || 1}`);
            if (zebrane.days.length === 1) {
              setPlanDay(0);
              // Plan powstaje z tablicy, ale mieszka w swojej zakładce. Skok robimy
              // przy pierwszym dniu, żeby użytkownik zobaczył go od razu.
              navigate(`/plany/${active.id}?widok=plan`);
            }
          } else if (z.typ === 'blad-dnia') {
            stan.blad = `dzień ${z.numer}: ${z.blad}`;
          } else if (z.typ === 'koniec') {
            zebrane = {
              ...zebrane,
              warnings: z.warnings ?? [],
              not_scheduled: z.not_scheduled ?? [],
            };
            setPlan(zebrane);
          } else if (z.typ === 'blad') {
            stan.blad = z.blad ?? 'Nieznany błąd planera';
          }
        });
      } catch (e: any) {
        stan.blad = e?.message ?? String(e);
      }

      if (!zebrane.days.length) {
        // Droga odwrotu. Strumień może nie przejść przez firmowe proxy albo
        // rozszerzenie przeglądarki, a wtedy lepiej poczekać dłużej na stary
        // endpoint niż zostawić użytkownika z komunikatem o błędzie.
        console.warn('[plan] strumień nie dowiózł dni, wracam do jednego wywołania:', stan.blad);
        setEtapPlanu('Ponawiam bez strumienia — to potrwa dłużej');
        zebrane = await apiPost<any>('/plan-trip', zadanie);
        setPlan(zebrane);
        setPlanDay(0);
        navigate(`/plany/${active.id}?widok=plan`);
      } else if (stan.blad) {
        toast.warning(`Część planu się nie policzyła (${stan.blad}). Reszta jest gotowa.`);
      }

      const data = zebrane;
      // Każdy wygenerowany plan zostaje — z jednej tablicy może powstać ich wiele
      const { data: saved } = await supabase
        .from('trip_plans')
        .insert({
          project_id: active.id,
          name: `${planForm.start}-${planForm.end}${active.trip_type ? ` · ${TRIP_PRESETS.find((t) => t.id === active.trip_type)?.label ?? ''}` : ''}`,
          window_start: planForm.start,
          window_end: planForm.end,
          start_date: planForm.date || null,
          plan: data
        })
        .select('id, name, window_start, window_end, start_date, plan, created_at')
        .single();
      if (saved) {
        setSavedPlans((prev) => [saved, ...prev]);
        setPlanId(saved.id);
      }
      refreshTokens();
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setPlanning(false);
    }
  };

  if (loading) {
    return (
      /* Szkielet w kształcie tablicy: pasek ustawień i dwie kolumny decyzji.
         Kółko na środku pustego ekranu nie mówi nic poza „czekaj" — układ
         nie skacze, gdy dane dojdą, i widać z góry, że idą kolumny. */
      <div className="space-y-5" aria-busy="true" aria-label="Wczytuję tablicę">
        <Skeleton className="h-12 w-full rounded-md" />
        <div className="grid gap-3 md:grid-cols-2">
          {[0, 1].map((k) => (
            <div key={k} className="rounded-md border border-border bg-card overflow-hidden">
              <Skeleton className="h-12 w-full rounded-none" />
              <div className="p-3 space-y-3">
                {[0, 1, 2].map((j) => (
                  <div key={j} className="flex gap-3.5">
                    <Skeleton className="w-[84px] h-[84px] rounded-sm shrink-0" />
                    <div className="flex-1 space-y-2 pt-1">
                      <Skeleton className="h-4 w-3/4" />
                      <Skeleton className="h-3 w-1/2" />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  const mustCount = places.filter((p) => p.priority === 'must').length;
  const totalMinutes = places.reduce((sum, p) => sum + (p.visit_minutes || 0), 0);

  /**
   * Ile z zaplanowanego czasu już zajęliśmy. Samo "zwiedzanie łącznie: 6 h" nic
   * nie mówi, dopóki nie widać, ile tego czasu w ogóle jest — a przy dokładaniu
   * miejsc to jedyna informacja, która powstrzymuje przed ułożeniem dnia, którego
   * nie da się przejść. Do wizyt doliczamy przejścia, bo one też zjadają dzień.
   */
  const TRANSFER_MIN = 12;

  /** Odległość w metrach po prostej (haversine). Do przejścia w mieście
   *  dokładamy 30% na to, że ulice nie biegną po linii prostej. */
  const metryMiedzy = (a: any, b: any): number | null => {
    if (a?.lat == null || a?.lng == null || b?.lat == null || b?.lng == null) return null;
    const R = 6371000, rad = Math.PI / 180;
    const dLat = (b.lat - a.lat) * rad, dLng = (b.lng - a.lng) * rad;
    const s = Math.sin(dLat / 2) ** 2
      + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLng / 2) ** 2;
    return Math.round(R * 2 * Math.asin(Math.sqrt(s)) * 1.3);
  };

  /** Dystans po polsku: przecinek dziesiętny, metry poniżej kilometra. */
  const opisDystansu = (m: number) =>
    m >= 1000 ? `${(m / 1000).toFixed(1).replace('.', ',')} km` : `${m} m`;

  const budget = (() => {
    if (!active?.days || !active?.hours_per_day) return null;
    const windowMin = Number(active.days) * Number(active.hours_per_day) * 60;
    const planned = Math.round((windowMin * (active.fill_percent ?? 70)) / 100);
    const used = totalMinutes + Math.max(0, places.length - 1) * TRANSFER_MIN;
    return { windowMin, planned, used, ratio: planned > 0 ? used / planned : 0 };
  })();

  const medianOf = (nums: number[]) => {
    const a = [...nums].sort((x, y) => x - y);
    const m = Math.floor(a.length / 2);
    return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2;
  };
  const kmBetween = (aLat: number, aLng: number, bLat: number, bLng: number) => {
    const dLat = (aLat - bLat) * 111;
    const dLng = (aLng - bLng) * 111 * Math.cos((aLat * Math.PI) / 180);
    return Math.sqrt(dLat * dLat + dLng * dLng);
  };

  /**
   * Punkt na uboczu psuje dzień skuteczniej niż jego brak: dojazd zjada czas
   * przeznaczony na zwiedzanie. Mediana jako środek, bo jest odporna na to, że
   * sam odstający punkt przeciąga średnią w swoją stronę.
   */
  const outliers = (() => {
    const withCoords = places.filter((p) => p.lat != null && p.lng != null);
    if (withCoords.length < 4) return [] as typeof places;
    const cLat = medianOf(withCoords.map((p) => p.lat as number));
    const cLng = medianOf(withCoords.map((p) => p.lng as number));
    return withCoords.filter((p) => kmBetween(p.lat as number, p.lng as number, cLat, cLng) > 12);
  })();

  /** Ta sama rzecz dodana dwa razy pod nieco inną nazwą — częstsze, niż się wydaje. */
  const duplicates = (() => {
    const out: string[] = [];
    for (let i = 0; i < places.length; i++) {
      for (let j = i + 1; j < places.length; j++) {
        const a = places[i], b = places[j];
        if (a.lat == null || b.lat == null || a.lng == null || b.lng == null) continue;
        if (kmBetween(a.lat as number, a.lng as number, b.lat as number, b.lng as number) < 0.05) {
          out.push(`${a.name} / ${b.name}`);
        }
      }
    }
    return out;
  })();

  return (
    <div>
      {/* Nagłówek wyjazdu w układzie z projektu: nadtytuł, nazwa krojem
          nagłówkowym i wezwanie do ułożenia planu po prawej. */}
      <div className="flex flex-wrap items-end justify-between gap-4 mb-6">
        <div>
          <p className="font-narrow uppercase tracking-[0.32em] text-[11px] text-muted-foreground">
            {!active ? 'Plany wyjazdów' : view === 'plan' ? 'Plan wyjazdu' : 'Tablica wyjazdu'}
          </p>
          {/* Nagłówek tablicy to LICZBA, nie nazwa (Z3). Nazwa wyjazdu stoi już
              w nadtytule i w przełączniku w pasku nawigacji, więc powtórzona tutaj
              zajmowała najmocniejsze miejsce na ekranie, nie wnosząc nic nowego.
              Liczba zebranych miejsc mówi, na czym się stoi. */}
          <h1 className="font-display font-light text-[40px] leading-[1.05] tracking-[-0.02em] mt-2">
            {!active
              ? 'Twoje wyjazdy'
              : view === 'tablica'
                ? `${places.length} ${places.length === 1 ? 'zebrane miejsce' : 'zebranych miejsc'}`
                : active.name}
          </h1>
          {!active && (
            <p className="text-sm text-muted-foreground mt-2">
              Zbieraj miejsca, kiedy tylko chcesz. Trasy ułożymy z nich później.
            </p>
          )}
        </div>
      </div>

      <div className="space-y-5">
        {creating && (
          <div className="grid gap-2 sm:grid-cols-4 p-4 bg-muted/50 rounded-md">
            <Input placeholder={t('tablica.nazwa_np_bukareszt_delegacja')} value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })} className="sm:col-span-2" />
            <Input placeholder={t('tablica.miasto')} value={form.destination}
              onChange={(e) => setForm({ ...form, destination: e.target.value })} />
            <div className="flex gap-2">
              <Input placeholder={t('tablica.dni')} type="number" value={form.days}
                onChange={(e) => setForm({ ...form, days: e.target.value })} />
              <Input placeholder="h/dzień" type="number" value={form.hours}
                onChange={(e) => setForm({ ...form, hours: e.target.value })} />
            </div>
            <div className="sm:col-span-4 space-y-1.5">
              <span className="text-xs text-muted-foreground">{t('tablica.charakter_wyjazdu_nadpisze_twoje_domyslne')}</span>
              <div className="flex flex-wrap gap-1.5">
                {TRIP_PRESETS.map((preset) => (
                  <button
                    key={preset.id}
                    type="button"
                    title={preset.hint}
                    onClick={() => setForm({ ...form, tripType: form.tripType === preset.id ? '' : preset.id })}
                    className={`rounded-full px-3 py-1.5 text-xs border transition-colors ${
                      form.tripType === preset.id
                        ? 'bg-primary border-primary text-white'
                        : 'bg-background hover:bg-muted'
                    }`}
                  >
                    {preset.label}
                  </button>
                ))}
              </div>
            </div>
            <Button onClick={createProject} className="sm:col-span-4 bg-foreground text-background hover:bg-foreground/90">
              Utwórz plan
            </Button>
          </div>
        )}

        {projects.length === 0 && !creating && (
          <p className="text-sm text-muted-foreground py-6 text-center">
            Nie masz jeszcze żadnego planu. Utwórz pierwszy — np. „Bukareszt, 3 dni po 3 godziny".
          </p>
        )}

        {/* Przełącznik wyjazdów tylko wtedy, gdy jest co przełączać. Przy jednym
            wyjeździe pigułka powtarzała nazwę stojącą wyżej jako tytuł, a przy
            kilku wypełniona kolorem konkurowała z kubełkami — stąd sama kreska
            pod aktywnym. */}
        {/* Wyjazdy jako kafelki, nie rząd podkreślonych napisów. Tablica jest tu
            rzeczą, którą się wybiera — a napis w linijce nie wygląda na rzecz.
            Aktywny ma pełną ramkę i kropkę, więc widać go bez czytania. */}
        {/* Powrót zamiast przełącznika. Lista wyjazdów mieszka teraz pod /plany,
            a ta strona pokazuje wyłącznie jedną tablicę — dzięki temu widać,
            którą się otworzyło, bez czytania podświetleń w rzędzie kafelków. */}
        {/* Wejście w tablicę otwiera ostatnio używaną, więc powrót do listy jest
            częstym ruchem, nie wyjątkiem. Jako trzynastopikselowy szary napis
            z ujemnym marginesem ginął pod tytułem — trzeba go było szukać.
            Teraz jest przyciskiem z obwódką i liczbą pozostałych wyjazdów, czyli
            widać zarówno, że da się przełączyć, jak i na ile jest w co. */}
        {/* Powrót i akcje w jednym rzędzie. Wcześniej akcje stały przy tytule,
            piętro wyżej niż powrót — dwie linie przycisków jedna nad drugą
            zamiast jednej, na której wszystko się równa. */}
        <div className="flex flex-wrap items-center justify-between gap-4">
          <button onClick={() => navigate('/plany')}
            className="inline-flex items-center gap-2 h-10 rounded-full
                       bg-foreground text-background hover:bg-foreground/90 text-primary-foreground px-4 text-sm
                       transition-colors">
            <ArrowLeft className="w-4 h-4" />
            Wszystkie tablice
            {projects.length > 1 && (
              <span className="font-mono tabular-nums text-[11px] text-primary-foreground/70">
                {projects.length}
              </span>
            )}
          </button>
          <div className="flex items-center gap-4">
            {/* Współdzielenie w nagłówku, bo to informacja o wyjeździe, a nie czynność.
                Zarządzanie osobami zostaje niżej, przy polu z adresem. */}
            {active && shares.length > 0 && (
              <div className="hidden sm:flex items-center gap-2.5">
                <div className="flex -space-x-2">
                  {shares.slice(0, 3).map((sh) => (
                    <span key={sh.id} title={sh.shared_with_email}
                      className="w-8 h-8 rounded-full bg-primary-light border-2 border-background
                                 flex items-center justify-center text-[11px] font-medium text-foreground">
                      {sh.shared_with_email.slice(0, 2).toUpperCase()}
                    </span>
                  ))}
                </div>
                <span className="text-[13px] text-muted-foreground">
                  {shares.length === 1
                    ? `Współdzielona z ${shares[0].shared_with_email.split('@')[0]}`
                    : `Współdzielona z ${shares.length} osobami`}
                </span>
              </div>
            )}
            <Button variant="outline" onClick={() => setCreating((v) => !v)}>
              <Plus className="w-4 h-4 mr-1" /> Nowy plan
            </Button>
            {active && view === 'plan' && plan && savedPlans.length > 0 && (
              <Button variant="outline" onClick={pokazWszystkiePlany}>
                <CalendarDays className="w-4 h-4 mr-1.5" /> Wszystkie plany ({savedPlans.length})
              </Button>
            )}
            {active && view === 'plan' && plan && (
              <Button variant="outline" onClick={buildPlan} disabled={planning}>
                {planning
                  ? <><Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> {t('tablica.licze')}</>
                  : <><RefreshCw className="w-4 h-4 mr-1.5" /> {t('tablica.przelicz_plan')}</>}
              </Button>
            )}
            {/* Dodawanie miejsc jako stała akcja nagłówka. Wcześniej jedynym widocznym
                wejściem był przycisk w pustym kubełku — znikał po dodaniu pierwszego
                miejsca, więc dołożenie drugiego wymagało domyślenia się, że służy do
                tego mała karta „Szukaj miejsc" pod kolumnami. */}
            {active && view === 'tablica' && (
              <Button variant="outline" onClick={() => navigate(`/odkrywaj?wyjazd=${active.id}`)}>
                <Plus className="w-4 h-4 mr-1.5" /> Dodaj miejsca
              </Button>
            )}
            {active && mustCount > 0 && view === 'tablica' && (
              <Button onClick={() => navigate(`/plany/${active.id}?widok=plan`)}
                className="bg-foreground text-background hover:bg-foreground/90">
                Ułóż plan{active.days ? ` na ${active.days} dni` : ''} ↗
              </Button>
            )}
          </div>
        </div>

        {active && (
          <>
            {view === 'tablica' && (<>
            {/* Kubełki od razu pod nagłówkiem. Wcześniej stało nad nimi pięć
                bloków — dane wyjazdu, suwak proporcji, wyszukiwarka, wydarzenia
                i ostrzeżenia — więc tablica zaczynała się poniżej ekranu. Reszta
                zeszła pod spód: to narzędzia do tablicy, nie sama tablica. */}
            {/* Sześć kontenerów sterujących przed treścią (punkt 04 audytu) zwinięte
                w jeden pasek: start, termin i kontekst wyjazdu jednym spojrzeniem,
                zamiast dwóch dużych kart, które trzeba było przeczytać osobno.
                Edycja została -- to wciąż te same pola i te same handlery,
                przeniesione do modala pod "Zmień ustawienia". */}
            <div className="rounded-md bg-muted/70 border border-border/50 px-4 py-3
                            flex flex-wrap items-center gap-x-6 gap-y-2 font-mono text-[12px]">
              {/* Oba pola stoją zawsze. Wcześniej termin pojawiał się dopiero,
                  gdy już był ustawiony — więc nie dało się zgadnąć, że można go
                  podać. Puste pole pyta i samo prowadzi do ustawień. */}
              <span className="flex items-baseline gap-2 min-w-0">
                <span className="text-muted-foreground shrink-0">Skąd wyruszacie</span>
                {active.start_name ? (
                  <span className="text-foreground truncate">{active.start_name}</span>
                ) : (
                  <button onClick={() => setPokazUstawienia(true)}
                    className="text-foreground underline underline-offset-2 decoration-hairline
                               hover:decoration-foreground transition-colors">
                    ustaw punkt startowy
                  </button>
                )}
              </span>

              <span className="flex items-baseline gap-2 min-w-0">
                <span className="text-muted-foreground shrink-0">Kiedy jedziecie</span>
                {active.start_date ? (
                  <span className="text-foreground truncate">
                    {zakresDat(active.start_date, active.end_date)}
                    {active.days ? ` · ${active.days} ${active.days === 1 ? 'dzień' : 'dni'}` : ''}
                  </span>
                ) : (
                  <button onClick={() => setPokazUstawienia(true)}
                    className="text-foreground underline underline-offset-2 decoration-hairline
                               hover:decoration-foreground transition-colors">
                    {active.days ? `${active.days} ${active.days === 1 ? 'dzień' : 'dni'} · ustaw termin` : 'ustaw termin'}
                  </button>
                )}
              </span>

              {active.trip_type && (
                <span className="flex items-baseline gap-2 min-w-0">
                  <span className="text-muted-foreground shrink-0">Charakter</span>
                  <span className="text-foreground truncate">{active.trip_type}</span>
                </span>
              )}

              <button onClick={() => setPokazUstawienia(true)}
                className="ml-auto text-secondary hover:text-foreground transition-colors
                           underline underline-offset-2 decoration-hairline shrink-0">
                Zmień ustawienia
              </button>
            </div>

            <Dialog open={pokazUstawienia} onOpenChange={setPokazUstawienia}>
              <DialogContent className="max-w-lg">
                <DialogHeader>
                  <DialogTitle>Ustawienia wyjazdu</DialogTitle>
                </DialogHeader>
                <div className="space-y-4">
                  {/* Start */}
                  <div className="rounded-md border border-border bg-card p-4">
                    <p className="font-narrow uppercase tracking-[0.18em] text-[10px] text-muted-foreground">
                      Punkt startowy
                    </p>
                    <PunktStartowy
                      nazwa={active.start_name}
                      bezPolozenia={!!active.start_name && (active as any).start_lat == null}
                      destination={active.destination}
                      onZapisz={(n, lat, lng) => ustawStart({ name: n, lat, lng })}
                      onUsun={() => ustawStart(null)}
                    />
                  </div>

                  {/* Termin */}
                  <div className="rounded-md border border-border bg-card p-4">
                    <p className="font-narrow uppercase tracking-[0.18em] text-[10px] text-muted-foreground">
                      Termin
                    </p>
                    {active.start_date ? (
                      <>
                        <p className="text-[15px] mt-1.5">
                          {zakresDat(active.start_date, active.end_date)}
                          {active.days ? ` · ${active.days} ${active.days === 1 ? 'dzień' : 'dni'}` : ''}
                        </p>
                        <div className="flex flex-wrap gap-2 mt-3">
                          <Button size="sm" variant="outline" onClick={() => {
                              setTerminOd(active.start_date ?? '');
                              setTerminDo(active.end_date ?? '');
                              setPokazTermin(true);
                            }}>
                            Zmień
                          </Button>
                          <Button size="sm" variant="ghost" onClick={() => zapiszTermin(null, null)}
                            className="text-muted-foreground hover:text-destructive">
                            Usuń
                          </Button>
                        </div>
                      </>
                    ) : (
                      <>
                        <p className="text-[13px] text-muted-foreground mt-1.5 text-pretty">
                          Bez terminu wszystko działa — z terminem godziny otwarcia liczą się dla
                          właściwej pory roku, a wydarzenia z Twoich dni idą na górę.
                        </p>
                        <Button size="sm" variant="outline" className="mt-3" onClick={() => setPokazTermin(true)}>
                          Ustaw termin
                        </Button>
                      </>
                    )}

                    {pokazTermin && (
                      <div className="flex flex-wrap items-end gap-3 mt-3">
                        <label className="text-[13px] text-muted-foreground">
                          Od
                          <Input type="date" value={terminOd} autoFocus
                            onChange={(e) => setTerminOd(e.target.value)} className="mt-1" />
                        </label>
                        <label className="text-[13px] text-muted-foreground">
                          Do
                          <Input type="date" value={terminDo} min={terminOd || undefined}
                            onChange={(e) => setTerminDo(e.target.value)} className="mt-1" />
                        </label>
                        <Button size="sm" disabled={!terminOd}
                          onClick={() => zapiszTermin(terminOd, terminDo || terminOd)}
                          className="bg-foreground text-background hover:bg-foreground/90">
                          Zapisz
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => setPokazTermin(false)}>
                          Anuluj
                        </Button>
                      </div>
                    )}
                  </div>
                </div>
              </DialogContent>
            </Dialog>

            {/* Pasek narzędzi w miejsce trzech luźnych kart i osobnego okna
                preferencji. Kafel jest teraz zakładką: aktywny ma wypełnienie
                i dziobek wskazujący panel, otwarte jest zawsze jedno narzędzie.
                Doszedł czwarty — dostęp; publikacja i udostępnianie leżały dotąd
                luzem pod paskiem i wydłużały stronę, choć używa się ich raz.
            
                Stoi nad kubełkami, nie pod nimi: na końcu strony czytał się jak
                stopka, a panel otwierał się poza ekranem. Tutaj jest przybornikiem
                tablicy, przypięte miejsca lądują w kolumnach tuż pod nim. */}
            <PasekNarzedziTablicy
              otwarte={narzedzie}
              onZmiana={setNarzedzie}
              narzedzia={[
                {
                  id: 'prefs' as const,
                  etykieta: 'Preferencje tablicy',
                  meta: `Wypełnienie ${active.fill_percent ?? 70}%`,
                  tytul: 'Jak ma być wypełniony dzień',
                  opis: 'Te ustawienia dotyczą tego wyjazdu i przykrywają domyślne z profilu.',
                  tresc: (
                    <div className="space-y-4">
                      {/* Proporcja czasu: świadomy wybór, jak gęsty ma być dzień */}
                      <div className="rounded-md border bg-muted/30 px-4 py-3">
                        <div className="flex items-baseline justify-between gap-3 mb-2">
                          <span className="text-sm font-medium">{t('tablica.ile_czasu_zaplanowac')}</span>
                          <span className="text-sm font-semibold text-primary tabular-nums">
                            {active.fill_percent ?? 70}%
                          </span>
                        </div>
                        <Slider
                          value={[active.fill_percent ?? 70]}
                          min={0}
                          max={100}
                          step={5}
                          onValueChange={(v) => setProjects((prev) =>
                            prev.map((p) => (p.id === active.id ? { ...p, fill_percent: v[0] } : p)))}
                          onValueCommit={(v) => saveFillPercent(v[0])}
                        />
                        {/* Pasek zajętości: liczby same nie mówią nic, dopóki nie widać,
                            ile czasu w ogóle jest do rozdysponowania. */}
                        {budget && (
                          <div className="mt-3">
                            <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
                              <div
                                className={`h-full rounded-full transition-all ${
                                  budget.ratio > 1.05 ? 'bg-danger' : budget.ratio > 0.85 ? 'bg-warning' : 'bg-primary'
                                }`}
                                style={{ width: `${Math.min(100, budget.ratio * 100)}%` }}
                              />
                            </div>
                            <p className="text-[11px] text-muted-foreground mt-1.5 tabular-nums">
                              <strong className="text-foreground">{places.length}</strong> miejsc ({mustCount} koniecznie) ·{' '}
                              Zebrane: <strong className="text-foreground">{(budget.used / 60).toFixed(1)} h</strong>
                              {' '}z {(budget.planned / 60).toFixed(1)} h zaplanowanego czasu
                              {' '}(okno {(budget.windowMin / 60).toFixed(0)} h, w tym przejścia po {TRANSFER_MIN} min)
                              {budget.ratio > 1.05 && <span className="text-danger font-medium"> {t('tablica.wiecej_niz_da_sie_przejsc')}</span>}
                            </p>
                          </div>
                        )}

                        <p className="text-[11px] leading-snug text-muted-foreground mt-2">
                          {(active.fill_percent ?? 70) >= 90
                            ? 'Dzień wypełniony po brzegi — zdążysz wszędzie, ale bez marginesu na przystanek, który sam się trafi.'
                            : (active.fill_percent ?? 70) <= 40
                            ? 'Kilka kotwic i dużo swobody — reszta dnia na wałęsanie się po mieście bez planu.'
                            : 'Zaplanowane atrakcje wypełnią tyle procent Twojego czasu, resztę zostawiamy na przerwy i włóczenie się po okolicy.'}
                        </p>
                      </div>

                      {/* Osie preferencji tego wyjazdu. Te same, które siedzą w profilu,
                          ale ustawione tutaj dotyczą wyłącznie tej tablicy — bo inaczej
                          jedzie się z dziećmi w tempie z delegacji. */}
                      <div className="border-t border-border pt-4 space-y-5">
                        <div className="flex items-baseline justify-between gap-3">
                          <h3 className="font-display text-[17px]">{t('tablica.preferencje_tego_wyjazdu')}</h3>
                          <button
                            onClick={() => AXES.forEach((os) => ustawOs(os.key, null))}
                            className="text-[12px] text-muted-foreground hover:text-foreground transition-colors">
                            Wróć do ustawień z profilu
                          </button>
                        </div>

                        {AXES.map((os) => {
                          const wlasne = (active as any)[os.key] as number | null | undefined;
                          return (
                            <OsPreferencji
                              key={os.key}
                              tytul={os.title}
                              lewo={os.left}
                              prawo={os.right}
                              podpowiedz={os.hint}
                              wartosc={wlasne ?? userPrefs?.[os.key] ?? 50}
                              wlasna={wlasne != null}
                              onChange={(v) => ustawOs(os.key, v)}
                            />
                          );
                        })}
                      </div>
                    </div>
                  ),
                },
                {
                  id: 'szukaj' as const,
                  etykieta: 'Szukaj miejsc',
                  meta: `Dodaj coś w: ${active.destination}`,
                  tytul: `Dodaj coś w: ${active.destination}`,
                  opis: 'Pytaj naturalnie albo wklej to, co już masz — wszystko ląduje w kubełkach poniżej.',
                  tresc: (
                    <>
                <div>
                  <div className="relative flex items-center">
                    <Search className="w-4 h-4 absolute left-3 text-muted-foreground" />
                    <Input
                      value={query}
                      onChange={(e) => { setQuery(e.target.value); setPokazPodpowiedzi(true); }}
                      onFocus={() => setPokazPodpowiedzi(true)}
                      onBlur={() => setTimeout(() => setPokazPodpowiedzi(false), 150)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') { setPokazPodpowiedzi(false); search(query); }
                        if (e.key === 'Escape') setPokazPodpowiedzi(false);
                      }}
                      placeholder={`Czego szukasz w: ${active.destination}?`}
                      className="pl-9 pr-24"
                    />
                    <Button size="sm" onClick={() => { setPokazPodpowiedzi(false); search(query); }}
                      disabled={searching || !query.trim()}
                      className="absolute right-1 bg-foreground text-background hover:bg-foreground/90">
                      {searching ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Szukaj'}
                    </Button>

                    {pokazPodpowiedzi && podpowiedzi.length > 0 && (
                      <div className="absolute left-0 right-0 top-full mt-1.5 z-20 rounded-md border border-border
                                      bg-popover shadow-token-lg overflow-hidden">
                        {podpowiedzi.map((sug, i) => (
                          <div key={`${sug.name}-${i}`}
                            className="flex items-center gap-3 px-3 py-2.5 hover:bg-muted transition-colors
                                       border-b border-border last:border-b-0">
                            <div className="w-9 h-9 rounded-sm bg-muted shrink-0 overflow-hidden">
                              {sug.photos?.[0] && (
                                <Zdjecie src={sug.photos[0]} gdzie={120} alt="" className="w-full h-full object-cover" />
                              )}
                            </div>
                            <div className="min-w-0 flex-1">
                              <div className="text-sm truncate">{sug.name}</div>
                              <div className="font-mono text-[11px] tabular-nums text-muted-foreground truncate">
                                {[sug.kind, sug.visit_minutes ? formatMinutes(sug.visit_minutes) : null,
                                  sug.source === 'catalog' ? 'w katalogu' : null].filter(Boolean).join(' · ') || sug.city}
                              </div>
                            </div>
                            <div className="flex gap-1.5 shrink-0">
                              <Button size="sm" className="h-7 bg-primary hover:bg-primary/90"
                                onMouseDown={(e) => e.preventDefault()}
                                onClick={() => przypnijPodpowiedz(sug, 'must')}>
                                Na pewno
                              </Button>
                              <Button size="sm" variant="outline" className="h-7"
                                onMouseDown={(e) => e.preventDefault()}
                                onClick={() => przypnijPodpowiedz(sug, 'nice')}>
                                Może
                              </Button>
                            </div>
                          </div>
                        ))}
                        <div className="px-3 py-2 bg-muted/50 text-[11px] text-muted-foreground">
                          Nie ma tego, czego szukasz? Naciśnij „Szukaj" — agent przejrzy miasto dokładniej.
                        </div>
                      </div>
                    )}
                  </div>
                  {/* Wklejenie odnośnika obok szukania po nazwie: miejsca znajduje się
                      najczęściej gdzie indziej, a przepisywanie nazwy gubi położenie. */}
                  <div className="mt-3 rounded-md border border-border bg-muted/30 p-3">
                    <div className="flex gap-2">
                      <Input value={link} onChange={(e) => setLink(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && rozpoznajLink()}
                        placeholder={t('tablica.wklej_odnosnik_z_map_google')}
                        className="flex-1" />
                      <Button variant="outline" onClick={rozpoznajLink} disabled={linkBusy || !link.trim()}>
                        {linkBusy ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Rozpoznaj'}
                      </Button>
                    </div>

                    {zLinku && (
                      <div className="mt-3 rounded-md border border-border bg-background p-3">
                        <div className="font-display text-[15px]">{zLinku.name}</div>
                        <div className="font-mono text-[11px] tabular-nums text-muted-foreground mt-1">
                          {[zLinku.city, zLinku.country].filter(Boolean).join(' / ') || 'bez miasta'}
                          {zLinku.lat != null && ` · ${Number(zLinku.lat).toFixed(4)}, ${Number(zLinku.lng).toFixed(4)}`}
                        </div>
                        <div className="flex flex-wrap gap-2 mt-3">
                          <Button size="sm" onClick={() => dodajZLinku('must')}
                            className="bg-primary hover:bg-primary/90">{t('tablica.na_pewno')}</Button>
                          <Button size="sm" variant="outline" onClick={() => dodajZLinku('nice')}>{t('tablica.byc_moze')}</Button>
                          <Button size="sm" variant="ghost" onClick={() => setZLinku(null)}>{t('tablica.odrzuc')}</Button>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Wklejona treść: opis posta, lista z bloga, wiadomość od znajomego.
                      Z serwisów społecznościowych nic nie pobieramy — treści są tam za
                      logowaniem, a ich regulaminy zabraniają zbierania danych. Skopiowany
                      tekst działa tak samo i nie narusza niczyich warunków. */}
                  <div className="mt-3 rounded-md border border-border bg-muted/30 p-3">
                    <textarea
                      value={wklejony}
                      onChange={(e) => setWklejony(e.target.value)}
                      rows={3}
                      placeholder={t('tablica.wklej_opis_posta_liste_z')}
                      className="w-full rounded-sm border border-border bg-background px-3 py-2 text-sm
                                 outline-none focus:border-foreground/30 transition-colors resize-y"
                    />
                    <div className="flex items-center gap-2 mt-2">
                      <Button size="sm" variant="outline" onClick={wyluskaj}
                        disabled={wyluskaneBusy || wklejony.trim().length < 20}>
                        {wyluskaneBusy
                          ? <><Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> Czytam…</>
                          : 'Znajdź miejsca w tekście'}
                      </Button>
                      {wyluskane && (
                        <button onClick={() => { setWyluskane(null); setWklejony(''); }}
                          className="text-[12px] text-muted-foreground hover:text-foreground transition-colors">
                          wyczyść
                        </button>
                      )}
                    </div>

                    {wyluskane && wyluskane.length > 0 && (
                      <div className="mt-3 space-y-2">
                        {wyluskane.map((m, i) => (
                          <div key={`${m.name}-${i}`}
                            className="rounded-md border border-border bg-background px-3 py-2.5">
                            <div className="flex items-start justify-between gap-3">
                              <div className="min-w-0">
                                <div className="font-display text-[14px] leading-snug">{m.name}</div>
                                <div className="font-mono text-[11px] tabular-nums text-muted-foreground mt-0.5">
                                  {[m.kind, m.lat != null
                                    ? `${Number(m.lat).toFixed(3)}, ${Number(m.lng).toFixed(3)}`
                                    : m.poza_zasiegiem ? 'położenie odrzucone — za daleko od miasta' : 'bez położenia',
                                  ].filter(Boolean).join(' · ')}
                                </div>
                                {m.note && (
                                  <p className="text-[12px] text-muted-foreground mt-1 text-pretty">{m.note}</p>
                                )}
                              </div>
                              <div className="flex gap-1.5 shrink-0">
                                <Button size="sm" onClick={() => dodajWyluskane(m, 'must')}
                                  className="bg-primary hover:bg-primary/90 h-7 px-2.5 text-[12px]">{t('tablica.na_pewno')}</Button>
                                <Button size="sm" variant="outline" onClick={() => dodajWyluskane(m, 'nice')}
                                  className="h-7 px-2.5 text-[12px]">{t('tablica.moze')}</Button>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="flex flex-wrap gap-1.5 mt-2">
                    {(SUGGESTION_SETS[active.trip_type || ''] ?? SUGGESTION_SETS.default).map((sug) => (
                      <button key={sug} onClick={() => { setQuery(sug); search(sug); }}
                        className="text-xs bg-muted hover:bg-muted/70 rounded-full px-2.5 py-1 text-muted-foreground">
                        {sug}
                      </button>
                    ))}
                  </div>
                </div>

                {searching && (
                  <p className="text-sm text-muted-foreground flex items-center gap-2 py-4">
                    <Loader2 className="w-4 h-4 animate-spin" /> Szukam i sprawdzam, czy te miejsca naprawdę istnieją…
                  </p>
                )}

                {results.length > 0 && (
                  <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                    {results.map((r) => {
                      const Icon = CATEGORY_ICON[r.category] || MapPin;
                      return (
                        <div key={r.name} className="rounded-md border overflow-hidden bg-background flex flex-col">
                          {r.image_url && (
                            <Zdjecie src={r.image_url} gdzie={120} alt=""
                              className="w-full h-32 object-cover bg-muted" />
                          )}
                          <div className="p-3 space-y-2 flex-1 flex flex-col">
                            <div className="flex items-start gap-2">
                              <Icon className="w-4 h-4 mt-0.5 text-primary shrink-0" />
                              <div className="min-w-0 flex-1">
                                <div className="font-medium text-sm leading-snug">{r.name}</div>
                                {r.why && <div className="text-xs text-primary mt-0.5">{r.why}</div>}
                              </div>
                            </div>
                            <p className="text-xs text-muted-foreground leading-relaxed flex-1">
                              {opisMiejsca(r)}
                            </p>
                            <div className="flex flex-wrap gap-1.5 text-[11px]">
                              {r.visit_minutes && <Badge variant="secondary">{r.visit_minutes} min</Badge>}
                              {r.price_hint && (
                                <Badge variant="secondary" className="gap-1"><Coins className="w-3 h-3" />{r.price_hint}</Badge>
                              )}
                              {r.opening_hours && <Badge variant="outline" className="font-normal">{r.opening_hours}</Badge>}
                            </div>
                            {r.website && (
                              <a href={r.website} target="_blank" rel="noopener noreferrer"
                                className="text-xs text-primary hover:underline inline-flex items-center gap-1">
                                <ExternalLink className="w-3 h-3" /> Strona miejsca
                              </a>
                            )}
                            <div className="flex gap-2 pt-1">
                              <Button size="sm" className="flex-1 bg-primary hover:bg-primary/90 h-8"
                                onClick={() => pin(r, 'must')}>
                                <Star className="w-3.5 h-3.5 mr-1" /> Chcę
                              </Button>
                              <Button size="sm" variant="outline" className="flex-1 h-8" onClick={() => pin(r, 'nice')}>
                                Może
                              </Button>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* Karta miejsca: propozycje agenta widniały jako sama nazwa, więc
                    decyzja "zostawiam czy wyrzucam" była zgadywanką. */}
                    </>
                  ),
                },
                {
                  id: 'wydarzenia' as const,
                  etykieta: 'Wydarzenia',
                  meta: active.start_date && wydarzeniaPodzielone.wTerminieLista.length
                    ? `${wydarzeniaPodzielone.wTerminieLista.length} w Twoim terminie`
                    : events.length ? `${events.length} znalezionych` : 'Sprawdź wydarzenia',
                  tytul: events.length
                    ? `${events.length} wydarzeń w Twoim terminie`
                    : 'Brak wydarzeń w terminie',
                  tresc: (
                    <>
                <div className="rounded-md border bg-card">
                  <div className="flex items-center justify-between px-4 py-2.5 border-b">
                    <h3 className="text-sm font-semibold flex items-center gap-2">
                      <CalendarDays className="w-4 h-4 text-primary" />
                      Co się dzieje w: {active.destination}
                    </h3>
                    <button onClick={refreshEvents} disabled={eventsBusy}
                      className="text-xs text-primary hover:underline disabled:opacity-60 flex items-center gap-1">
                      {eventsBusy
                        ? <><Loader2 className="w-3 h-3 animate-spin" /> Szukam…</>
                        : <>{events.length > 0 ? 'Odśwież' : 'Sprawdź wydarzenia'}</>}
                    </button>
                  </div>
                  {events.length === 0 ? (
                    <p className="px-4 py-3 text-xs text-muted-foreground">
                      Wystawy, festiwale i jarmarki z konkretnymi terminami — sprawdzamy je na żądanie,
                      bo szybko się dezaktualizują.
                    </p>
                  ) : (
                    <div className="divide-y max-h-[420px] overflow-y-auto">
                      {wydarzeniaPodzielone.wTerminieLista.length > 0 && (
                        <div className="px-4 py-1.5 bg-primary/5 font-narrow uppercase
                                        tracking-[0.18em] text-[10px] text-primary">
                          W Twoim terminie · {wydarzeniaPodzielone.wTerminieLista.length}
                        </div>
                      )}
                      {[...wydarzeniaPodzielone.wTerminieLista,
                        ...(wydarzeniaPodzielone.wTerminieLista.length > 0
                          ? [{ __przerwa: true } as any] : []),
                        ...wydarzeniaPodzielone.pozostale].map((ev) => {
                        if (ev.__przerwa) {
                          return (
                            <div key="__przerwa"
                              className="px-4 py-1.5 bg-muted/40 font-narrow uppercase
                                         tracking-[0.18em] text-[10px] text-muted-foreground">
                              Poza terminem — jeśli któreś Cię kusi, termin da się przesunąć
                            </div>
                          );
                        }
                        const juzNaTablicy = places.some((p) => p.name === ev.name);
                        return (
                          <div key={ev.id} className="px-4 py-3 text-sm">
                            {/* Data nazwą miesiąca, nie wycinkiem zapisu ISO. „08-23–09-19"
                                nie mówiło ani o roku, ani o tym, że to sierpień i wrzesień. */}
                            <div className="font-mono text-[11px] tabular-nums flex items-center gap-1.5">
                              {wTerminie(ev.starts_on, ev.ends_on,
                                         (active as any)?.start_date ?? null,
                                         (active as any)?.end_date ?? null) && (
                                <span className="w-1.5 h-1.5 rounded-full bg-primary shrink-0" />
                              )}
                              <span className="text-muted-foreground">
                                {zakresDat(ev.starts_on, ev.ends_on)}
                              </span>
                            </div>
                            <div className="font-medium leading-snug mt-0.5">{ev.name}</div>
                            {ev.description && (
                              <div className="text-xs text-muted-foreground leading-snug mt-0.5">
                                {ev.description}
                              </div>
                            )}
                            <div className="flex flex-wrap items-center gap-3 mt-2">
                              {/* Adres zapisujemy tylko po sprawdzeniu, że odpowiada, więc
                                  jego brak znaczy „nie znaleźliśmy działającego" — wtedy
                                  uczciwiej wysłać do wyszukiwarki niż pokazać martwy link. */}
                              {ev.url ? (
                                <a href={ev.url} target="_blank" rel="noreferrer"
                                  className="inline-flex items-center gap-1.5 text-[12px] text-primary hover:underline">
                                  <ExternalLink className="w-3.5 h-3.5" /> Strona wydarzenia
                                </a>
                              ) : (
                                <a
                                  href={`https://www.google.com/search?q=${encodeURIComponent(
                                    `${ev.name} ${active.destination}`)}`}
                                  target="_blank" rel="noreferrer"
                                  className="inline-flex items-center gap-1.5 text-[12px] text-muted-foreground hover:text-foreground">
                                  <Search className="w-3.5 h-3.5" /> Poszukaj w sieci
                                </a>
                              )}
                              <button
                                onClick={() => wydarzenieNaTablice(ev)}
                                disabled={juzNaTablicy}
                                className="inline-flex items-center gap-1.5 text-[12px] text-muted-foreground
                                           hover:text-primary transition-colors disabled:opacity-60
                                           disabled:hover:text-muted-foreground">
                                <Plus className="w-3.5 h-3.5" />
                                {juzNaTablicy ? 'Jest na tablicy' : 'Dodaj do tablicy'}
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>

                    </>
                  ),
                },
                {
                  id: 'udostepnij' as const,
                  etykieta: 'Dostęp',
                  meta: active.is_public
                    ? 'Publiczna'
                    : shares.length ? `Ty i ${shares.length} os.` : 'Tylko Ty',
                  tytul: 'Kto widzi tę tablicę',
                  tresc: (
                    <>

                {/* Przełącznik zamiast przycisku nazywającego czynność: pokazuje
                    STAN tablicy i pozwala go zmienić w jednym miejscu. */}
                <div className="rounded-md border border-border bg-card p-4">
                  <p className="font-narrow uppercase tracking-[0.18em] text-[10px] text-muted-foreground">
                    Kto widzi tę tablicę
                  </p>

                  <div role="group" aria-label="Dostęp do tablicy"
                    className="mt-3 grid grid-cols-2 gap-1 rounded-full bg-muted p-1">
                    {([
                      [true, 'Publiczna'],
                      [false, 'Prywatna'],
                    ] as const).map(([publiczna, etykieta]) => {
                      const wybrana = !!active?.is_public === publiczna;
                      return (
                        <button key={etykieta} type="button"
                          aria-pressed={wybrana}
                          disabled={publishing || wybrana}
                          onClick={() => { if (!wybrana) togglePublic(); }}
                          className={`h-9 rounded-full text-[13px] transition-colors disabled:cursor-default ${
                            wybrana
                              ? 'bg-foreground text-background font-medium'
                              : 'text-secondary hover:bg-card'
                          }`}>
                          {publishing && !wybrana
                            ? <Loader2 className="w-4 h-4 animate-spin mx-auto" />
                            : etykieta}
                        </button>
                      );
                    })}
                  </div>

                  <p className="text-[13px] text-muted-foreground mt-3 text-pretty">
                    {active?.is_public
                      ? `Obejrzy ją każdy, kto dostanie odnośnik — także bez konta. Skopiować albo polubić może tylko osoba zalogowana. Widoczna jest nazwa, którą się podpisujesz.${
                          active.copy_count ? ` Skopiowano ${active.copy_count} razy.` : ''}`
                      : 'Widzisz ją tylko Ty i osoby, które dopiszesz poniżej.'}
                  </p>
                </div>

                <div className={`border-t pt-4 space-y-2 ${
                  active?.is_public && shares.length === 0 ? 'hidden' : ''}`}>
                  <h3 className="text-sm font-semibold flex items-center gap-2">
                    <Share2 className="w-4 h-4 text-accent" /> Udostępnij imiennie
                  </h3>
                  <div className="flex gap-2">
                    <Input
                      type="email"
                      value={shareEmail}
                      onChange={(e) => setShareEmail(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && shareProject()}
                      placeholder={t('tablica.adres_e_mail_osoby_musi')}
                      className="flex-1"
                    />
                    <Button onClick={shareProject} disabled={sharing || !shareEmail.trim()} variant="outline">
                      {sharing ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Udostępnij'}
                    </Button>
                  </div>
                  {shares.length > 0 && (
                    <div className="space-y-1">
                      {shares.map((sh) => (
                        <div key={sh.id} className="flex items-center gap-2 text-xs p-2 rounded-md bg-muted/50">
                          <Users className="w-3.5 h-3.5 text-muted-foreground" />
                          <span className="flex-1 truncate">{sh.shared_with_email}</span>
                          <span className="text-muted-foreground">{sh.role === 'editor' ? 'może edytować' : 'podgląd'}</span>
                          <button onClick={() => revokeShare(sh.id)} className="text-muted-foreground hover:text-danger">
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
                    </>
                  ),
                },
              ]}
            />

            {/* Kolumny stoją zawsze, także przy pustej tablicy. Kubełki są tu
                wyjaśnieniem, co się z tą stroną robi — schowane, zostawiały nowy
                wyjazd bez żadnej wskazówki. */}
            {(
              <div>
                <div className="flex items-center justify-end mb-2">
                  <button onClick={() => { setGrouped((v) => !v); setGrupowanieRuszone(true); }}
                    className="text-[12px] text-muted-foreground hover:text-foreground transition-colors
                               underline decoration-dotted underline-offset-4">
                    {grouped ? 'bez podziału na kategorie' : 'pogrupuj wg kategorii'}
                  </button>
                </div>
                {/* Odrzucone zostają dostępne, ale przestają zajmować kolumnę: przy pięciu
                    pozycjach na piętnaście tablic to była pusta przestrzeń w najlepszym miejscu. */}
                {(() => {
                  const odrzucone = places.filter((x) => x.priority === 'rejected');
                  if (odrzucone.length === 0) return null;
                  return (
                    <div className="rounded-md border border-border bg-muted/40 mb-3">
                      <button onClick={() => setOdrzuconeOtwarte((v) => !v)}
                        aria-expanded={odrzuconeOtwarte}
                        className="w-full flex items-center justify-between px-3 py-2 text-left">
                        <span className="font-narrow uppercase tracking-[0.18em] text-[10px] text-muted-foreground">
                          {odrzucone.length} odrzucone
                        </span>
                        <span className="text-[12px] text-muted-foreground">
                          {odrzuconeOtwarte ? 'zwiń' : 'pokaż'}
                        </span>
                      </button>
                      {odrzuconeOtwarte && (
                        <div className="flex flex-wrap gap-1.5 px-3 pb-3">
                          {odrzucone.map((x) => (
                            <span key={x.id}
                              className="inline-flex items-center gap-2 rounded-full border border-border
                                         bg-card pl-3 pr-1.5 py-1 text-[12px]">
                              {x.name}
                              <button onClick={() => movePlace(x.id, 'nice')}
                                title={t('tablica.wroc_do_byc_moze')}
                                className="rounded-full px-2 py-0.5 text-[11px] text-muted-foreground
                                           hover:bg-muted hover:text-foreground transition-colors">
                                przywróć
                              </button>
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })()}
                <div className="grid gap-3 md:grid-cols-3">
                  {ZONES.filter((z) => z.id !== 'rejected').map((zone) => {
                    const zonePlaces = places.filter((p) => p.priority === zone.id);
                    return (
                      <div
                        key={zone.id}
                        onDragOver={(e) => e.preventDefault()}
                        onDrop={(e) => {
                          e.preventDefault();
                          const id = e.dataTransfer.getData('text/plain');
                          if (id) movePlace(id, zone.id);
                        }}
                        className={`rounded-md min-h-[160px] border border-border transition-colors ${
                          zone.id === 'rejected' ? 'bg-muted/30' : 'bg-card'
                        }`}
                      >
                        {/* Podkreślenie 2 px w kolorze decyzji zamiast kropki (Z3).
                            "Być może" jest terakotą, nie dusty-blue: w kierunku
                            „Wyprawa" --accent znaczy dokładnie dwie rzeczy --
                            „być może" i głos agenta -- więc trzeci niebieski
                            odcień rozbijałby ten sygnał. */}
                        <div className={`flex items-center justify-between px-4 py-3.5 border-b-2 ${
                          zone.id === 'must' ? 'border-primary'
                            : zone.id === 'nice' ? 'border-accent' : 'border-border'
                        }`}>
                          <span className="flex items-center gap-2.5">
                            <span className={`font-narrow uppercase tracking-[0.18em] text-[11px] font-semibold ${
                              zone.id === 'must' ? 'text-primary'
                                : zone.id === 'nice' ? 'text-accent' : 'text-muted-foreground'
                            }`}>
                              {zone.label}
                            </span>
                          </span>
                          <span className="font-mono text-[13px] tabular-nums text-muted-foreground">
                            {zonePlaces.length}
                          </span>
                        </div>
                        <div className="p-3">
                        <div className="space-y-2">
                          {(grouped ? groupByCategory(zonePlaces) : [{ cat: 'all', label: '', items: zonePlaces }]).map((group) => (
                          <div key={group.cat} className="space-y-2">
                            {grouped && group.label && (
                              <div className="flex items-center justify-between px-1 pt-1">
                                <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                                  {group.label}
                                </span>
                                <span className="text-[10px] text-muted-foreground">{group.items.length}</span>
                              </div>
                            )}
                          {group.items.map((p) => {
                            const Icon = CATEGORY_ICON[p.category] || MapPin;
                            return (
                              <div
                                key={p.id}
                                draggable
                                onDragStart={(e) => e.dataTransfer.setData('text/plain', p.id)}
                                onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); }}
                                onDrop={(e) => {
                                  e.preventDefault();
                                  e.stopPropagation();
                                  const id = e.dataTransfer.getData('text/plain');
                                  if (id && id !== p.id) movePlace(id, zone.id, p.id);
                                }}
                                className={`group rounded-md border border-border bg-background p-3.5 cursor-grab
                                            active:cursor-grabbing shadow-token-sm hover:shadow-token-md transition-shadow`}
                              >
                                <div className="flex gap-3.5">
                                  <div className="w-[84px] h-[84px] rounded-sm bg-muted shrink-0 overflow-hidden
                                                  flex items-center justify-center">
                                    {p.image_url
                                      ? <Zdjecie src={p.image_url} gdzie={120} alt="" className="w-full h-full object-cover" />
                                      : <Icon className="w-5 h-5 text-muted-foreground/60" />}
                                  </div>
                                  <div className="min-w-0 flex-1">
                                    <div className="flex items-start gap-1.5">
                                      <button onClick={() => openPlaceCard(p)}
                                        className="font-display text-[15px] leading-snug text-left flex-1
                                                   hover:text-primary transition-colors">
                                        {p.name}
                                      </button>
                                      <button onClick={() => unpin(p.id)} aria-label={t('tablica.usun_z_tablicy')}
                                        className="text-muted-foreground/50 hover:text-destructive shrink-0
                                                   opacity-0 group-hover:opacity-100 transition-opacity">
                                        <Trash2 className="w-3.5 h-3.5" />
                                      </button>
                                    </div>
                                    <div className="font-mono text-[11px] tabular-nums text-muted-foreground mt-1 truncate">
                                      {[p.visit_minutes ? formatMinutes(p.visit_minutes) : null, p.opening_hours]
                                        .filter(Boolean).join(' · ') || '—'}
                                    </div>
                                    {/* Waga przestawiana wprost na karcie. Przeciąganie zostaje, ale
                                        wymaga celowania w kolumnę, a to jest jedno kliknięcie. */}
                                    <div className="flex gap-1.5 mt-2.5">
                                      {ZONES.map((z) => (
                                        <button key={z.id} onClick={() => movePlace(p.id, z.id)}
                                          className={`rounded-full px-2.5 py-1 text-[11px] transition-colors ${
                                            p.priority === z.id
                                              ? z.id === 'must' ? 'bg-primary text-primary-foreground'
                                                : z.id === 'nice' ? 'bg-accent text-accent-foreground'
                                                : 'bg-clay text-clay-foreground'
                                              : 'text-muted-foreground hover:bg-muted'
                                          }`}>
                                          {z.short}
                                        </button>
                                      ))}
                                    </div>
                                  </div>
                                </div>
                              </div>
                            );
                          })}
                          </div>
                          ))}
                          {zonePlaces.length === 0 && (
                            <div className="space-y-2.5">
                              <p className="text-[12px] text-muted-foreground px-1 pb-1 text-pretty">
                                {zone.hint}
                              </p>
                              {zone.id === 'must' ? (
                                <button onClick={() => navigate(`/odkrywaj?wyjazd=${active.id}`)}
                                  className="w-full h-[104px] rounded-md border border-dashed border-border
                                             flex flex-col items-center justify-center gap-1.5 text-muted-foreground
                                             hover:border-primary/50 hover:text-primary transition-colors">
                                  <Plus className="w-5 h-5" />
                                  <span className="text-[12px]">{t('tablica.dodaj_miejsca')}</span>
                                </button>
                              ) : (
                                <div className="w-full h-[104px] rounded-md border border-dashed border-border/70" />
                              )}
                              <div className="w-full h-[104px] rounded-md border border-dashed border-border/45" />
                              <div className="w-full h-[104px] rounded-md border border-dashed border-border/25" />
                            </div>
                          )}
                        </div>
                        </div>
                      </div>
                    );
                  })}
                  {/* Trzecia kolumna była kubełkiem „Nie" — na piętnastu tablicach mieściło się
                      w niej łącznie pięć miejsc, czyli 5% wszystkiego, a zajmowała trzecią część
                      szerokości. Odrzucone zeszły do zwijanego paska nad kolumnami, a miejsce
                      zajęła mapa: przy kurowaniu tablicy najczęściej pada pytanie „czy to się
                      w ogóle da obejść w jeden dzień", a na to odpowiada geografia, nie lista.
                      Pozostałe dwie kolumny zachowują dotychczasową szerokość. */}
                  <div className="rounded-md border border-border bg-card overflow-hidden flex flex-col
                             self-start md:sticky md:top-[88px]">
                    <div className="flex items-center justify-between px-3 py-2.5 border-b border-border">
                      <span className="font-narrow uppercase tracking-[0.18em] text-[10px] text-muted-foreground">
                        Rozrzut miejsc
                      </span>
                      <span className="font-mono text-[11px] tabular-nums text-muted-foreground">
                        {naMapie.length} z {places.length}
                      </span>
                    </div>
                    {naMapie.length > 0 ? (
                      <>
                        <DiscoverMap places={naMapie} doKadru={kadrZeStartem}
                          start={startNaMapie} className="h-[480px]"
                          aktywne={pinezkaPodKursorem}
                          onPinHover={setPinezkaPodKursorem}
                          onPinClick={(id) => {
                            const m = places.find((x) => x.id === id);
                            if (m) openPlaceCard(m);
                          }} />
                        <div className="flex items-center gap-4 px-3 py-2 border-t border-border">
                          {[['must', 'na pewno'], ['nice', 'być może']].map(([id, etykieta]) => (
                            <span key={id} className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                              <span className={`w-2.5 h-2.5 rounded-full ${
                                id === 'must' ? 'bg-primary' : 'bg-accent'}`} />
                              {etykieta}
                            </span>
                          ))}
                        </div>
                      </>
                    ) : (
                      <p className="h-[480px] flex items-center justify-center px-6 text-center
                                    text-[13px] text-muted-foreground text-pretty">
                        Mapa pokaże się, gdy na tablicy znajdzie się choć jedno miejsce ze współrzędnymi.
                      </p>
                    )}
                  </div>
                </div>
                <p className="text-[12px] text-muted-foreground mt-3">
                  Wagę zmienisz pigułką na kartce. Przeciąganie też działa — upuść kartkę
                  na inną, żeby ustawić kolejność w kolumnie.
                </p>
              </div>
            )}

            {/* Nagłówek wyjazdu. Wcześniej w jednym rzędzie stało siedem rzeczy o
                różnej wadze: dane wyjazdu, przełączniki, statystyki i czynności.
                Teraz po lewej to, co opisuje wyjazd, po prawej to, co się z nim
                robi — a liczby zeszły do paska zajętości, gdzie mają kontekst. */}
            <div className="flex items-center justify-between gap-3 border-t pt-4 flex-wrap">
              <div className="flex items-center gap-2 text-sm text-muted-foreground flex-wrap">
                <span className="flex items-center gap-1.5 font-medium text-foreground">
                  <MapPin className="w-4 h-4 text-primary" />{active.destination}
                </span>
                {active.days && active.hours_per_day && (
                  <>
                    <span className="text-muted-foreground/40">·</span>
                    <span className="flex items-center gap-1.5">
                      <Clock className="w-4 h-4" />{active.days} × {active.hours_per_day} h
                    </span>
                  </>
                )}
                <span className="text-muted-foreground/40">·</span>
                <button onClick={() => setEditingType((v) => !v)}
                  className={`rounded-full border px-2.5 py-0.5 text-xs transition-colors ${
                    active.trip_type
                      ? 'border-primary/30 bg-primary/10 text-primary hover:bg-primary/15'
                      : 'hover:bg-muted'
                  }`}>
                  {active.trip_type
                    ? (TRIP_PRESETS.find((t) => t.id === active.trip_type)?.label || active.trip_type)
                    : 'Ustaw charakter'}
                </button>
              </div>

              <div className="flex items-center gap-1">
                {tokens && (
                  <span
                    className={`text-xs flex items-center gap-1 px-2 py-1 rounded-full ${
                      tokens.balance < 10 ? 'bg-warning/15 text-warning-foreground' : 'text-muted-foreground'
                    }`}
                    title={`Plan dni: ${tokens.prices?.['plan-trip'] ?? '?'} tokenów, wyznaczenie trasy: ${tokens.prices?.['live-route'] ?? '?'}`}
                  >
                    <Coins className="w-3.5 h-3.5" /> {tokens.balance}
                  </span>
                )}
                {shares.length > 0 && (
                  <span className="text-xs flex items-center gap-1 text-muted-foreground px-2" title={t('tablica.wspo_tworcy_tablicy')}>
                    <Users className="w-3.5 h-3.5" /> {shares.length}
                  </span>
                )}
                <button onClick={duplicateProject} title={t('tablica.kopiuj_tablice')}
                  className="text-muted-foreground hover:text-foreground p-2 rounded-md hover:bg-muted transition-colors">
                  <Copy className="w-4 h-4" />
                </button>
              </div>
            </div>



            {editingType && (
              <div className="rounded-md bg-muted/50 p-3 space-y-2">
                <span className="text-xs text-muted-foreground">
                  Charakter można zmieniać do woli — liczy się dopiero przy wyszukiwaniu i planowaniu.
                </span>
                <div className="flex flex-wrap gap-1.5">
                  {TRIP_PRESETS.map((preset) => (
                    <button key={preset.id} title={preset.hint} onClick={() => changeTripType(preset.id)}
                      className={`rounded-full px-3 py-1.5 text-xs border transition-colors ${
                        active.trip_type === preset.id
                          ? 'bg-primary border-primary text-white'
                          : 'bg-background hover:bg-muted'
                      }`}>
                      {preset.label}
                    </button>
                  ))}
                  <button onClick={() => changeTripType('')}
                    className="rounded-full px-3 py-1.5 text-xs border bg-background hover:bg-muted text-muted-foreground">
                    Bez charakteru
                  </button>
                </div>
              </div>
            )}


            </>)}

            {/* Okno karty miejsca zostaje poza podziałem: otwiera je zarówno kafelek
                na tablicy, jak i punkt na osi dnia w planie. */}
            <Dialog open={pytanieOPodpis} onOpenChange={setPytanieOPodpis}>
              <DialogContent className="max-w-sm">
                <DialogHeader>
                  <DialogTitle className="text-left leading-snug">Jak Cię podpisać?</DialogTitle>
                </DialogHeader>
                <p className="text-[13px] text-muted-foreground leading-relaxed">
                  Ten podpis zobaczą wszyscy, którzy trafią na Twoją tablicę.
                  Imię wystarczy — zapiszemy je w profilu, więc pytamy tylko raz.
                </p>
                <input
                  autoFocus
                  value={podpisRoboczy}
                  onChange={(e) => setPodpisRoboczy(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') zatwierdzPodpis(); }}
                  placeholder="np. Dawid"
                  maxLength={40}
                  className="w-full rounded-md border border-border bg-background px-3 py-2 text-[14px]"
                />
                <div className="flex justify-end gap-2">
                  <Button variant="ghost" onClick={() => setPytanieOPodpis(false)}>Anuluj</Button>
                  <Button onClick={zatwierdzPodpis} disabled={!podpisRoboczy.trim()}>
                    Opublikuj
                  </Button>
                </div>
              </DialogContent>
            </Dialog>

            <Dialog open={!!placeCard} onOpenChange={(open) => !open && setPlaceCard(null)}>
              <DialogContent className="max-w-md">
                <DialogHeader>
                  <DialogTitle className="pr-6 text-left leading-snug flex items-start gap-2">
                    {placeCard?.nr != null && (
                      <span className="w-6 h-6 rounded-full shrink-0 mt-0.5 flex items-center justify-center
                                       text-[12px] font-medium bg-foreground text-background font-sans">
                        {placeCard.nr}
                      </span>
                    )}
                    <span className="min-w-0">{placeCard?.name}</span>
                  </DialogTitle>
                </DialogHeader>
                {placeCard && (
                  <div className="space-y-3">
                    {placeCard.photos?.length > 0 && (
                      <div className="relative rounded-md overflow-hidden bg-muted">
                        {/* Zdjęcia z Commons bywają pionowe, a ramka jest pozioma.
                            object-cover ucinał wtedy wszystko poza środkiem kadru — z całej
                            wieży zostawał kawałek muru. Teraz zdjęcie mieści się w całości,
                            a tło robi jego rozmyta kopia, żeby boki nie świeciły pustką. */}
                        <div aria-hidden
                          className="absolute inset-0 bg-center bg-cover blur-xl scale-110 opacity-45"
                          style={{ backgroundImage: `url("${placeCard.photos[Math.min(cardPhoto, placeCard.photos.length - 1)]}")` }} />
                        <Zdjecie src={placeCard.photos[Math.min(cardPhoto, placeCard.photos.length - 1)]} gdzie="karta" alt={placeCard.name}
                          className="relative w-full h-56 object-contain"
                          onError={() => setPlaceCard((prev: any) => ({ ...prev, photos: [] }))} />
                        {/* Same kropki po 6 px były jedynym sposobem na zmianę zdjęcia:
                            nie wyglądały na klikalne i trudno było w nie trafić. Strzałki
                            mówią wprost, że zdjęć jest więcej, licznik ile ich zostało,
                            a kropki zostają jako wskaźnik miejsca w zestawie — z polem
                            kliknięcia większym niż sama kropka. */}
                        {placeCard.photos.length > 1 && (() => {
                          const ile = placeCard.photos.length;
                          const teraz = Math.min(cardPhoto, ile - 1);
                          const przesun = (o: number) => setCardPhoto((teraz + o + ile) % ile);
                          const strzalka = `absolute top-1/2 -translate-y-1/2 w-8 h-8 rounded-full
                            bg-background/85 text-foreground shadow-token-sm backdrop-blur-[2px]
                            flex items-center justify-center hover:bg-background transition-colors`;
                          return (
                            <>
                              <button type="button" aria-label={t('tablica.poprzednie_zdjecie')}
                                onClick={() => przesun(-1)} className={`${strzalka} left-2`}>
                                <ChevronLeft className="w-4 h-4" />
                              </button>
                              <button type="button" aria-label={t('tablica.nastepne_zdjecie')}
                                onClick={() => przesun(1)} className={`${strzalka} right-2`}>
                                <ChevronRight className="w-4 h-4" />
                              </button>
                              <span className="absolute top-2 right-2 rounded-full bg-ink/55 text-background
                                               font-mono tabular-nums text-[11px] px-2 py-0.5">
                                {teraz + 1}/{ile}
                              </span>
                              <div className="absolute bottom-0 left-0 right-0 flex justify-center">
                                {placeCard.photos.map((_: string, i: number) => (
                                  <button key={i} type="button" onClick={() => setCardPhoto(i)}
                                    aria-label={`Zdjęcie ${i + 1} z ${ile}`}
                                    aria-current={i === teraz}
                                    className="px-1 py-2.5">
                                    <span className={`block w-1.5 h-1.5 rounded-full transition-colors ${
                                      i === teraz ? 'bg-card' : 'bg-card/50'}`} />
                                  </button>
                                ))}
                              </div>
                            </>
                          );
                        })()}
                      </div>
                    )}

                    {/* Przypinanie było wyłącznie ikonką na liście. Kto otworzył kartę,
                        żeby zdecydować, musiał ją zamknąć i trafić w pinezkę 14 px
                        obok — decyzja zapadała tu, a przycisk był gdzie indziej. */}
                    {placeCard.source === 'suggested' && (
                      places.some((p) => p.name === placeCard.name) ? (
                        <span className="inline-flex items-center gap-1.5 text-[11px] text-muted-foreground">
                          <Pin className="w-3 h-3" /> jest już na Twojej tablicy
                        </span>
                      ) : (
                        <div className="flex items-center justify-between gap-3 rounded-md border border-border px-3 py-2">
                          <span className="text-[11px] text-muted-foreground">
                            propozycja agenta — nie ma jej jeszcze na Twojej tablicy
                          </span>
                          <Button size="sm" variant="outline" className="shrink-0"
                            onClick={() => pinSuggestion({ name: placeCard.name, minutes: placeCard.minutesRaw, note: placeCard.note })}>
                            <Pin className="w-3.5 h-3.5 mr-1.5" /> Dodaj do tablicy
                          </Button>
                        </div>
                      )
                    )}

                    {cardLoading && !placeCard.description && (
                      <p className="text-sm text-muted-foreground flex items-center gap-2">
                        <Loader2 className="w-4 h-4 animate-spin" /> Sprawdzam, co to za miejsce…
                      </p>
                    )}
                    {opisMiejsca(placeCard) && <p className="text-sm leading-relaxed">{opisMiejsca(placeCard)}</p>}
                    {placeCard.recommendation && (
                      <p className="text-xs bg-primary/10/70 border border-primary/30 rounded-md p-2.5 leading-relaxed">
                        <strong className="block text-[10px] uppercase tracking-wider text-primary mb-0.5">{t('tablica.wskazowka')}</strong>
                        {placeCard.recommendation}
                      </p>
                    )}
                    {placeCard.note && <p className="text-xs text-muted-foreground italic">{placeCard.note}</p>}

                    <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground border-t pt-2.5">
                      {placeCard.minutes && <span>Czas: <strong className="text-foreground">{placeCard.minutes} min</strong></span>}
                      {placeCard.opening_hours && <span>Godziny: <strong className="text-foreground">{placeCard.opening_hours}</strong></span>}
                      {placeCard.website && (
                        <a href={placeCard.website} target="_blank" rel="noreferrer" className="text-primary hover:underline">
                          strona miejsca
                        </a>
                      )}
                    </div>
                  </div>
                )}
              </DialogContent>
            </Dialog>

            {view === 'tablica' && (<>
            {/* Wydarzenia: pokazujemy je przy tablicy, bo tam zapada decyzja
                "dokładam dzień czy nie" — nie w osobnej zakładce. Rozwijane, bo
                sprawdza się je raz na wyjazd, a nie przy każdym wejściu. */}

            {(outliers.length > 0 || duplicates.length > 0) && (
              <div className="rounded-md border border-warning/40 bg-warning/60 px-4 py-3 space-y-1.5">
                {outliers.length > 0 && (
                  <p className="text-xs text-warning-foreground">
                    <strong>{t('tablica.daleko_od_reszty')}</strong> {outliers.map((p) => p.name).join(', ')}.
                    {' '}Dojazd zje czas przeznaczony na zwiedzanie — rozważ osobny dzień albo odpuszczenie.
                  </p>
                )}
                {duplicates.length > 0 && (
                  <p className="text-xs text-warning-foreground">
                    <strong>{t('tablica.mozliwe_duplikaty')}</strong> {duplicates.join('; ')} — to samo miejsce pod dwiema nazwami.
                  </p>
                )}
              </div>
            )}


            </>)}

            {view === 'plan' && (<>
            {/* Plan na górze, narzędzia pod nim. Lista zapisanych planów i pola
                z godzinami stały wyżej niż sam plan, więc po wejściu w zakładkę
                widać było formularz, a nie to, po co się tu przychodzi. */}
            {plan && (
              <div className="space-y-5">
                {(plan.title && plan.title !== active?.name) || plan.summary ? (
                  <div className="-mt-1">
                    {plan.title && plan.title !== active?.name && (
                      <h2 className="font-display text-[20px]">{plan.title}</h2>
                    )}
                    {plan.summary && (
                      <p className="text-sm text-muted-foreground mt-1.5 max-w-[62ch] text-pretty">{plan.summary}</p>
                    )}
                  </div>
                ) : null}

                {/* Dni jako zakładki: data nad nazwą dnia. Wybrany dzień ma ciemną
                    ramkę, bo wypełnienie kolorem konkurowałoby z kubełkami. */}
                {(plan.days || []).length > 1 && (
                  <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                    {(plan.days || []).map((d: any, i: number) => (
                      <button key={d.day} onClick={() => setPlanDay(i)}
                        className={`text-left rounded-md border px-4 py-3 transition-colors ${
                          i === Math.min(planDay, (plan.days || []).length - 1)
                            ? 'border-foreground bg-card' : 'border-border hover:bg-muted/50'
                        }`}>
                        <span className="font-mono uppercase tracking-[0.14em] text-[10px] text-muted-foreground tabular-nums">
                          {[d.weekday, d.date].filter(Boolean).join(' · ') || `Dzień ${d.day}`}
                        </span>
                        <span className="font-display text-[17px] block mt-1">
                          {d.title || `Dzień ${d.day}`}
                        </span>
                      </button>
                    ))}
                  </div>
                )}

                <div className="grid lg:grid-cols-[minmax(0,1fr)_420px] gap-5 items-start">
                  <div className="space-y-4">
                {(plan.days || [])
                  .filter((_: any, i: number) => i === Math.min(planDay, (plan.days || []).length - 1))
                  .map((day: any) => (
                  <div key={day.day} className="rounded-md border overflow-hidden">
                    <div className="bg-muted/60 border-l-2 border-l-primary px-4 py-2.5 flex items-center justify-between gap-2">
                      <span className="flex items-baseline gap-2.5">
                        <span className="font-display text-[17px]">Dzień {day.day}</span>
                        {day.weekday && (
                          <span className="font-mono text-[11px] tabular-nums text-muted-foreground">
                            {day.weekday} · {day.date}
                          </span>
                        )}
                      </span>
                      <button
                        onClick={() => buildRouteFrom(day.items || [], `dzień ${day.day}`)}
                        className="text-xs font-normal text-primary hover:underline flex items-center gap-1"
                      >
                        <Wand2 className="w-3.5 h-3.5" /> Zrób trasę z tego dnia
                      </button>
                    </div>
                    <div className="divide-y">
                      {(() => {
                        // Podsumowanie dnia: ile czasu zajmą same wizyty i ile
                        // dzielą kilometry. Dystans liczymy z odcinków między
                        // kolejnymi punktami i mnożymy przez 1,3, bo ulice nie
                        // biegną w linii prostej — to szacunek, nie pomiar, więc
                        // podpisujemy go jako "ok.".
                        const items = day.items || [];
                        const minutes = items.reduce((sum: number, it: any) => sum + (it.minutes || 0), 0);
                        let km = 0;
                        let prev: any = null;
                        for (const it of items) {
                          if (it.lat != null && it.lng != null) {
                            if (prev) {
                              const dLat = (it.lat - prev.lat) * 111;
                              const dLng = (it.lng - prev.lng) * 111 * Math.cos((it.lat * Math.PI) / 180);
                              km += Math.sqrt(dLat * dLat + dLng * dLng);
                            }
                            prev = it;
                          }
                        }
                        km *= 1.3;
                        if (minutes === 0 && km === 0) return null;
                        const exact = dayRoutes[day.day];
                        const measured = exact && exact !== 'loading' ? exact : null;
                        // Realizm dnia: zwiedzanie plus marsz. Powyzej dziewieciu godzin
                        // na nogach plan przestaje byc planem wypoczynku, wiec mowimy o tym
                        // wprost, zamiast zostawiac uzytkownika z sama liczba.
                        const walkMin = measured ? measured.h * 60 : (km / 4.5) * 60;
                        const loadH = (minutes + walkMin) / 60;
                        return (
                          <>
                          {loadH > 9 && (
                            <div className="flex items-start gap-3 px-4 py-3.5 bg-warning/60 border-b border-warning/40">
                              <span className="font-narrow uppercase tracking-[0.18em] text-[10px] text-warning-foreground
                                               border border-warning-foreground/25 rounded-full px-2.5 py-1 shrink-0">
                                Realizm
                              </span>
                              <p className="text-[13px] text-warning-foreground leading-relaxed text-pretty">
                                Ten dzień to <strong className="font-mono tabular-nums">{loadH.toFixed(1)} h</strong> na
                                nogach razem z dojściami. Realnie zwiedza się jakieś siedem, osiem — rozważ przeniesienie
                                jednego punktu na inny dzień.
                              </p>
                            </div>
                          )}
                          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-2 bg-muted/40 text-xs text-muted-foreground border-b">
                            <span>Zwiedzanie: <strong className="font-mono tabular-nums text-foreground">{(minutes / 60).toFixed(1)} h</strong></span>
                            {measured ? (
                              <>
                                <span>{t('tablica.do_przejscia')} <strong className="font-mono tabular-nums text-foreground">{measured.km.toFixed(1)} km</strong></span>
                                <span>Marsz: <strong className="font-mono tabular-nums text-foreground">{Math.round(measured.h * 60)} min</strong></span>
                                <span className="text-primary">przeliczone po chodnikach</span>
                              </>
                            ) : (
                              <>
                                {km > 0 && <span>{t('tablica.do_przejscia')} <strong className="font-mono tabular-nums text-foreground">ok. {km.toFixed(1)} km</strong></span>}
                                {km > 0 && <span>Marsz: <strong className="font-mono tabular-nums text-foreground">ok. {Math.round((km / 4.5) * 60)} min</strong></span>}
                              </>
                            )}
                            <span>{t('tablica.punktow')} <strong className="font-mono tabular-nums text-foreground">{items.length}</strong></span>
                            {items.filter((it: any) => it.lat != null).length >= 2 && !measured && (
                              <button
                                onClick={() => recalcDay(day)}
                                disabled={exact === 'loading'}
                                className="ml-auto flex items-center gap-1 text-primary hover:text-primary hover:underline disabled:opacity-60"
                              >
                                {exact === 'loading'
                                  ? <><Loader2 className="w-3 h-3 animate-spin" /> {t('tablica.licze_przebieg')}</>
                                  : <><RefreshCw className="w-3 h-3" /> {t('tablica.przelicz_dok_adnie')}</>}
                              </button>
                            )}
                          </div>
                          </>
                        );
                      })()}

                      {(day.items || []).map((it: any, i: number) => {
                        const suggested = it.source === 'suggested';
                        const alreadyPinned = places.some((p) => p.name === it.name);
                        const naMapie = it.lat != null && it.lng != null;
                        const nrNaMapie = naMapie
                          ? (day.items || []).slice(0, i + 1)
                              .filter((x: any) => x.lat != null && x.lng != null).length
                          : null;
                        // Przerwa między tym punktem a poprzednim — własny wiersz,
                        // nie dopisek pod nazwą i nie tooltip.
                        const poprzedni = i > 0 ? (day.items || [])[i - 1] : null;
                        // Dystans tylko między dwoma PRZYSTANKAMI. Przy pozycji
                        // organizacyjnej plan i tak mówi już o przerwie wprost.
                        const metry = poprzedni && czyPrzystanek(poprzedni) && czyPrzystanek(it)
                          ? metryMiedzy(poprzedni, it)
                          : null;
  return (
                          <Fragment key={`poz-${i}`}>
                          {metry != null && metry > 0 && (
                            <div className="flex gap-3 px-4 items-center text-muted-foreground">
                              <span className="w-14 shrink-0" />
                              <span className="w-6 shrink-0 flex justify-center">
                                <span className="w-px h-[22px] bg-border" />
                              </span>
                              <span className="font-mono text-[11px] tabular-nums">
                                {Math.max(1, Math.round(metry / 80))} min pieszo · {opisDystansu(metry)}
                              </span>
                            </div>
                          )}
                          <div className="flex gap-3 px-4 py-2.5 text-sm items-start hover:bg-muted/40 transition-colors">
                            <span className="w-14 shrink-0 pt-0.5">
                              <span className="font-mono text-[13px] tabular-nums block">{it.time}</span>
                              {it.minutes && (
                                <span className="font-mono text-[11px] tabular-nums text-muted-foreground block mt-0.5">
                                  {formatMinutes(it.minutes)}
                                </span>
                              )}
                            </span>
                            {/* Numer na osi odpowiada numerowi pinezki na mapie obok — dlatego
                                liczy tylko punkty, które na tę mapę trafiają. Pozycja bez
                                współrzędnych dostaje pustą obwódkę zamiast numeru, żeby nie
                                przesuwać numeracji reszty dnia. */}
                            {naMapie ? (
                              <span className={`w-6 h-6 rounded-full shrink-0 mt-0.5 flex items-center justify-center
                                                text-[12px] font-medium ${
                                suggested
                                  ? 'bg-accent text-accent-foreground'
                                  : 'bg-primary text-primary-foreground'
                              }`}>
                                {nrNaMapie}
                              </span>
                            ) : (
                              <span title={t('tablica.bez_pinezki_na_mapie')}
                                className="w-6 h-6 rounded-full shrink-0 mt-0.5 border border-dashed border-border" />
                            )}
                            <div className="min-w-0 flex-1">
                              <div className="font-display text-[15px] flex items-center gap-2 flex-wrap">
                                <button
                                  onClick={() => openPlaceCard({ ...it, nr: nrNaMapie })}
                                  className="text-left hover:text-primary hover:underline decoration-dotted underline-offset-2"
                                >
                                  {it.name}
                                </button>
                                {suggested && (
                                  <span className="text-[10px] font-normal text-accent bg-accent/10 rounded-full px-1.5 py-0.5">
                                    propozycja agenta
                                  </span>
                                )}
                              </div>
                              {it.note && <div className="text-xs text-muted-foreground">{it.note}</div>}
                            </div>
                            {suggested && !alreadyPinned && (
                              <button
                                onClick={() => pinSuggestion(it)}
                                title={t('tablica.dodaj_do_tablicy')}
                                className="text-muted-foreground hover:text-primary shrink-0 mt-0.5"
                              >
                                <Pin className="w-3.5 h-3.5" />
                              </button>
                            )}

                          </div>
                          </Fragment>
                        );
                      })}
                    </div>
                  </div>
                ))}

                {plan.not_scheduled?.length > 0 && (
                  <div className="rounded-md border border-warning/40 bg-warning/60 p-3">
                    <div className="text-sm font-semibold text-warning-foreground mb-1">{t('tablica.nie_zmiesci_o_sie')}</div>
                    {plan.not_scheduled.map((n: any) => (
                      <div key={n.name} className="text-xs text-warning-foreground">
                        <strong>{n.name}</strong>{n.reason ? ` — ${n.reason}` : ''}
                      </div>
                    ))}
                  </div>
                )}

                {plan.warnings?.length > 0 && (
                  <div className="space-y-1.5">
                    {plan.warnings.map((w: string, i: number) => (
                      <div key={i} className="flex gap-2 text-xs text-muted-foreground">
                        <AlertTriangle className="w-3.5 h-3.5 text-warning shrink-0 mt-0.5" />
                        <span>{w}</span>
                      </div>
                    ))}
                  </div>
                )}

                  </div>

                  {/* Prawa kolumna: mapa wybranego dnia i eksport. Numery pinezek
                      odpowiadają numerom na osi godzinowej po lewej. */}
                  <aside className="space-y-4 lg:sticky lg:top-[88px]">
                    {(() => {
                      const d = (plan.days || [])[Math.min(planDay, (plan.days || []).length - 1)];
                      const wszystkie = d?.items || [];
                      const pts = wszystkie
                        .filter((it: any) => it.lat != null && it.lng != null)
                        .map((it: any) => ({ name: it.name, lat: it.lat, lng: it.lng }));
                      if (pts.length === 0) return null;
                      const dr = d ? dayRoutes[d.day] : null;
                      const dayTrack = dr && dr !== 'loading' ? dr.track ?? null : null;
                      const withoutCoords = (d?.items || []).length - pts.length;
                      return (
                        <div className="rounded-md border border-border overflow-hidden bg-card">
                          <PlanDayMap points={pts} track={dayTrack} className="h-[380px] w-full"
                            onPunkt={(i) => {
                              // Numer pinezki to jej pozycja na mapie, więc karta otwarta
                              // z mapy pokazuje dokładnie ten numer, w który kliknięto.
                              const it = pts[i] && wszystkie.find((x: any) => x.name === pts[i].name);
                              if (it) openPlaceCard({ ...it, nr: i + 1 });
                            }} />
                          <div className="flex items-center justify-between px-4 py-2.5 border-t border-border">
                            <span className="font-narrow uppercase tracking-[0.18em] text-[10px] text-muted-foreground">
                              Trasa dnia
                            </span>
                            <span className="font-mono text-[12px] tabular-nums text-muted-foreground">
                              {/* Liczymy to, co widać, a nie czego brakuje. „Bez położenia"
                                  brzmiało jak awaria danych, choć znaczy tylko tyle, że
                                  nie ustaliliśmy współrzędnych tego punktu. */}
                              {pts.length} z {pts.length + withoutCoords} na mapie
                              {dayTrack && dr && dr !== 'loading' && ` · ${dr.km.toFixed(1)} km`}
                            </span>
                          </div>
                        </div>
                      );
                    })()}

                {(() => {
                  const days = plan.days || [];
                  const allItems = days.flatMap((d: any) => d.items || []);
                  const totalMin = allItems.reduce((sum: number, it: any) => sum + (it.minutes || 0), 0);
                  return (
                    <div className="rounded-md bg-foreground text-background p-5">
                      <p className="font-narrow uppercase tracking-[0.32em] text-[10px] text-background/60">
                        Gotowy plan
                      </p>
                      <h3 className="font-display font-light text-[24px] leading-tight mt-2">
                        Zamień go w jedną trasę
                      </h3>
                      <div className="flex gap-6 mt-4 font-mono text-[12px] tabular-nums text-background/70">
                        <span>{days.length} {days.length === 1 ? 'dzień' : 'dni'}</span>
                        <span>{allItems.length} punktów</span>
                        {totalMin > 0 && <span>{(totalMin / 60).toFixed(1)} h zwiedzania</span>}
                      </div>
                      <button
                        onClick={() => buildRouteFrom(allItems, 'cały wyjazd')}
                        className="mt-5 w-full rounded-sm bg-primary-light text-foreground py-2.5 text-sm font-medium hover:opacity-90 transition-opacity flex items-center justify-center"
                      >
                        <Wand2 className="w-4 h-4 mr-2" /> Zrób jedną trasę z całego wyjazdu
                      </button>
                      <p className="text-[11px] text-background/50 mt-2.5 text-center">
                        Trasę pobierzesz jako GPX w widoku kreatora.
                      </p>
                    </div>
                  );
                })()}

                  </aside>
                </div>

                {plan.question && (
                  <div className="rounded-md border border-primary/30 bg-primary/10 p-3 text-sm text-primary">
                    {plan.question}
                  </div>
                )}
              </div>
            )}

            {/* Pusto w zakładce planu nie znaczy "nic tu nie ma", tylko "nie ma
                jeszcze czego pokazać" — więc mówimy, czego brakuje i dajemy
                przycisk, zamiast zostawiać białą stronę. */}
            {!plan && savedPlans.length === 0 && (
              <div className="rounded-md border border-border bg-card px-6 py-16 text-center">
                <h2 className="font-display font-light text-[24px]">{t('tablica.planu_jeszcze_nie_ma')}</h2>
                <p className="text-sm text-muted-foreground mt-2 max-w-[46ch] mx-auto text-pretty">
                  {mustCount > 0
                    ? `Na tablicy czeka ${mustCount} ${mustCount === 1 ? 'miejsce' : 'miejsc'} oznaczonych „na pewno”. Ułóż z nich dni.`
                    : 'Najpierw oznacz na tablicy miejsca, bez których wyjazd nie ma sensu. Z nich powstanie plan.'}
                </p>
                <Button
                  className="mt-6 bg-foreground text-background hover:bg-foreground/90"
                  disabled={mustCount === 0 || planning}
                  onClick={() => navigate(mustCount > 0 ? '/plany?widok=plan' : '/plany')}
                >
                  {planning
                    ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> {t('tablica.uk_adam')}</>
                    : mustCount > 0
                      ? <>Ułóż plan{active.days ? ` na ${active.days} dni` : ''} ↗</>
                      : 'Wróć na tablicę'}
                </Button>
              </div>
            )}

            {savedPlans.length > 0 && (
              <div className="border-t pt-4 space-y-2">
                <h3 className="text-sm font-semibold">
                  Wszystkie plany ({savedPlans.length})
                </h3>
                {savedPlans.map((sp) => (
                  <div key={sp.id} className="flex items-center gap-2 p-2 rounded-md bg-muted/50 text-sm">
                    <CalendarDays className="w-4 h-4 text-muted-foreground shrink-0" />
                    <button onClick={() => otworzPlan(sp)}
                      aria-current={planId === sp.id}
                      className={`flex-1 text-left truncate ${
                        planId === sp.id ? 'font-medium text-primary' : 'hover:underline'
                      }`}>
                      {sp.name}
                      <span className="text-xs text-muted-foreground ml-2">
                        {new Date(sp.created_at).toLocaleDateString('pl-PL')}
                      </span>
                    </button>
                    <button onClick={() => deletePlan(sp.id)} className="text-muted-foreground hover:text-danger">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>
            )}

            {places.length > 0 && (
              <div className="border-t pt-4 space-y-3">
                <h3 className="text-sm font-semibold flex items-center gap-2">
                  <CalendarDays className="w-4 h-4 text-primary" /> Ułóż plan dni
                </h3>
                {/* Gotowe okna czasowe. Wybór trybu dnia jednym kliknięciem, zamiast
                    dłubania w natywnym selektorze godzin — a przy okazji podpowiedź,
                    że dzień z dziećmi i dzień w delegacji to nie to samo. */}
                <div className="flex flex-wrap gap-2">
                  {([
                    ['Standardowy', '09:00', '18:00'],
                    ['Z dziećmi', '09:00', '16:00'],
                    ['Intensywny', '08:00', '20:00'],
                    ['Popołudniowy', '14:00', '21:00'],
                  ] as const).map(([etykieta, od, doG]) => {
                    const wybrany = planForm.start === od && planForm.end === doG;
                    return (
                      <button key={etykieta}
                        onClick={() => setPlanForm({ ...planForm, start: od, end: doG })}
                        className={`rounded-full border px-3 py-1.5 text-xs transition-colors ${
                          wybrany
                            ? 'bg-primary border-primary text-primary-foreground'
                            : 'border-border hover:bg-muted'
                        }`}>
                        {etykieta}
                        <span className={`font-mono ml-1.5 ${wybrany ? 'opacity-80' : 'text-muted-foreground'}`}>
                          {od}–{doG}
                        </span>
                      </button>
                    );
                  })}
                </div>

                <div className="grid gap-2 sm:grid-cols-5">
                  <label className="text-xs text-muted-foreground">Od
                    <Input type="time" value={planForm.start}
                      onChange={(e) => setPlanForm({ ...planForm, start: e.target.value })} className="mt-1" />
                  </label>
                  <label className="text-xs text-muted-foreground">Do
                    <Input type="time" value={planForm.end}
                      onChange={(e) => setPlanForm({ ...planForm, end: e.target.value })} className="mt-1" />
                  </label>
                  {/* Natywny picker otwierał się w dół i chował się pod krawędzią okna —
                      formularz siedzi na samym dole strony. Radix sam odwraca panel do góry,
                      gdy pod spodem nie ma miejsca. */}
                  <label className="text-xs text-muted-foreground">Pierwszy dzień
                    <Popover>
                      <PopoverTrigger asChild>
                        <Button
                          variant="outline"
                          className="mt-1 w-full justify-start font-normal text-sm h-10"
                        >
                          <CalendarDays className="w-4 h-4 mr-2 text-primary shrink-0" />
                          {planDate ? format(planDate, 'd MMMM yyyy', { locale: pl }) : 'Wybierz datę'}
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0" align="start" side="top" sideOffset={8} collisionPadding={16}>
                        <Calendar
                          mode="single"
                          locale={pl}
                          weekStartsOn={1}
                          selected={planDate}
                          defaultMonth={planDate}
                          onSelect={(d) => d && setPlanForm({ ...planForm, date: format(d, 'yyyy-MM-dd') })}
                          initialFocus
                        />
                      </PopoverContent>
                    </Popover>
                  </label>
                  <label className="text-xs text-muted-foreground">Kolacja o
                    <Input type="time" value={planForm.dinner}
                      onChange={(e) => setPlanForm({ ...planForm, dinner: e.target.value })} className="mt-1" />
                  </label>
                  <Button onClick={buildPlan} disabled={planning}
                    className="self-end bg-foreground text-background hover:bg-foreground/90">
                    {planning ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Zaplanuj'}
                  </Button>
                </div>
                {planning && (
                  <div className="rounded-md border border-border bg-muted/40 px-4 py-3.5 flex items-start gap-3">
                    <Loader2 className="w-4 h-4 animate-spin text-primary shrink-0 mt-0.5" />
                    <div className="min-w-0">
                      <p className="text-[13px]">
                        {etapPlanu ?? 'Sprawdzam godziny otwarcia, liczę dojścia i układam dni.'}
                      </p>
                      {/* Etapy są teraz prawdziwe — serwer melduje każdy gotowy dzień,
                          więc nie ma tu już zgadywania. Licznik zostaje obok, bo
                          odpowiada na inne pytanie: nie „co się dzieje", tylko
                          „czy to jeszcze normalny czas". */}
                      <p className="font-mono text-[12px] tabular-nums text-muted-foreground mt-1">
                        {planSekundy} s · dni pojawiają się pojedynczo
                      </p>
                      {planSekundy > 100 && (
                        <p className="text-[12px] text-muted-foreground mt-1.5 text-pretty">
                          Dłużej niż zwykle. Nie odświeżaj strony — plan dojdzie albo
                          zobaczysz komunikat o błędzie.
                        </p>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}

            </>)}
          </>
        )}
      </div>
    </div>
  );
}
