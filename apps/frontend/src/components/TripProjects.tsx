import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  AlertTriangle, Bed, CalendarDays, Clock, Coins, Copy, ExternalLink, Loader2, MapPin, Music, Pin, Plus, RefreshCw, Search, Share2, Star, Trash2, Users, Utensils, Wand2
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
import { apiPost } from '@/lib/api';
import { TRIP_PRESETS, EMPTY_AXES, mergePreferences, type AxisValues } from '@/lib/tripPresets';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { format, parse, isValid } from 'date-fns';
import { pl } from 'date-fns/locale';

interface TripProject extends Partial<AxisValues> {
  id: string;
  name: string;
  destination: string;
  days: number | null;
  hours_per_day: number | null;
  trip_type: string | null;
  fill_percent?: number | null;
}

type Priority = 'must' | 'nice' | 'rejected';

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
}

export default function TripProjects({ onContextChange }: TripProjectsProps = {}) {
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
  const [grouped, setGrouped] = useState(true);
  const [planning, setPlanning] = useState(false);
  /** Który dzień planu jest pokazany. Projekt pokazuje jeden dzień naraz, bo
   *  trzy dni na jednej stronie to ściana tekstu, w której nic nie widać. */
  const [planDay, setPlanDay] = useState(0);
  /** Zakładka z adresu. Tablica i plan to dwa widoki tych samych danych, a nie
   *  dwie sekcje jednej długiej strony — inaczej "Plan" w pasku niczego nie robi. */
  const [searchParams] = useSearchParams();
  const view = searchParams.get('widok') === 'plan' ? 'plan' : 'tablica';
  const [plan, setPlan] = useState<any | null>(null);
  const [planForm, setPlanForm] = useState({ start: '17:00', end: '21:00', date: '', dinner: '20:00' });
  // Data w formularzu zostaje stringiem 'yyyy-MM-dd' — kalendarz potrzebuje obiektu Date
  const planDate = (() => {
    if (!planForm.date) return undefined;
    const d = parse(planForm.date, 'yyyy-MM-dd', new Date());
    return isValid(d) ? d : undefined;
  })();

  const [query, setQuery] = useState('');
  const [searching, setSearching] = useState(false);
  const [results, setResults] = useState<DiscoveredPlace[]>([]);

  const active = projects.find((p) => p.id === activeId) || null;

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
      await (supabase as any).rpc('claim_pending_trip_shares');
      const { data } = await (supabase as any)
        .from('trip_projects')
        .select('id, name, destination, days, hours_per_day, trip_type, fill_percent, pace, popularity, wandering, dining, effort, crowds')
        .order('updated_at', { ascending: false });
      setProjects(data || []);
      // Wejście z kreatora (?project=...) ma otworzyć świeżo utworzoną tablicę,
      // a nie ostatnio modyfikowaną — inaczej "Zapisz jako projekt" wyglądałoby
      // jakby nic nie zrobiło.
      const requested = new URLSearchParams(window.location.search).get('project');
      const target = requested && data?.some((p: any) => p.id === requested) ? requested : data?.[0]?.id;
      if (target) setActiveId(target);
      const { data: prefs } = await (supabase as any)
        .from('route_preferences')
        .select('pace, popularity, wandering, dining, effort, crowds')
        .eq('user_id', userData.user.id)
        .maybeSingle();
      setUserPrefs(prefs || null);
      setLoading(false);
    })();
  }, []);

  useEffect(() => {
    if (!activeId) return setPlaces([]);
    // Zmiana planu musi wyczyścić WSZYSTKO, co dotyczyło poprzedniego. Wyniki
    // wyszukiwania dla Lipska wiszące nad tablicą Bukaresztu wyglądały jak
    // niedziałające przełączanie, choć miejsca ładowały się poprawnie.
    setResults([]);
    setQuery('');
    setPlan(null);
    setEvents([]);
    if (active?.destination) loadEvents(active.destination);
    setEditingType(false);
    setShareEmail('');
    (async () => {
      const { data } = await (supabase as any)
        .from('trip_project_places')
        .select('id, name, category, priority, lat, lng, sort_order, description, opening_hours, visit_minutes, website, image_url, wiki_extract')
        .eq('project_id', activeId)
        .order('sort_order', { ascending: true })
        .order('created_at', { ascending: true });
      setPlaces(data || []);
      const { data: plans } = await (supabase as any)
        .from('trip_plans')
        .select('id, name, window_start, window_end, start_date, plan, created_at')
        .eq('project_id', activeId)
        .order('created_at', { ascending: false });
      setSavedPlans(plans || []);
      const { data: sh } = await (supabase as any)
        .from('trip_project_shares')
        .select('id, shared_with_email, role')
        .eq('project_id', activeId);
      setShares(sh || []);
      setPlan(null);
    })();
  }, [activeId]);

  const createProject = async () => {
    // Ciche wyjście zostawiało użytkownika z wrażeniem, że przycisk nie działa
    if (!form.name.trim()) return toast.error('Podaj nazwę planu, np. „Bukareszt — delegacja”');
    if (!form.destination.trim()) return toast.error('Podaj miasto, w którym planujesz wyjazd');
    const { data: userData } = await supabase.auth.getUser();
    if (!userData.user) return toast.error('Zaloguj się, aby tworzyć projekty');
    const { data, error } = await (supabase as any)
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
        toast.info('Nic nie znalazłem dla tego zapytania — spróbuj inaczej je sformułować');
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
    let catalogId: string | null = null;
    try {
      const cat = await apiPost<any>('/catalog/upsert', {
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
      catalogId = cat?.id ?? null;
    } catch (err) {
      console.warn('Nie udało się dopisać miejsca do katalogu:', err);
    }

    const { data, error } = await (supabase as any)
      .from('trip_project_places')
      .insert({
        project_id: active.id,
        catalog_id: catalogId,
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
    if (error) return toast.error(error.message);
    setPlaces((prev) => [...prev, data]);
    setResults((prev) => prev.filter((r) => r.name !== place.name));
    toast.success(`Dodano: ${place.name}`);
  };

  const unpin = async (id: string) => {
    await (supabase as any).from('trip_project_places').delete().eq('id', id);
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
      const { error } = await (supabase as any)
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
    const { error } = await (supabase as any)
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

  const recalcDay = async (day: any) => {
    const points = (day.items || [])
      .filter((it: any) => it.lat != null && it.lng != null)
      .map((it: any) => ({ lat: it.lat, lng: it.lng, name: it.name }));
    if (points.length < 2) return toast.error('Ten dzień ma za mało punktów ze współrzędnymi');

    setDayRoutes((prev) => ({ ...prev, [day.day]: 'loading' }));
    try {
      const data = await apiPost<any>('/live-route', {
        points,
        route_type: 'city_walk',
        intent: 'popular'
      }, { timeoutMs: 90_000 });
      setDayRoutes((prev) => ({
        ...prev,
        [day.day]: {
          km: data.distance_km,
          h: data.duration_h,
          // Ślad z routera trzymamy przy dniu, żeby mapa obok pokazała ten sam
          // przebieg, o którym mówią liczby w pasku.
          track: Array.isArray(data.trackPoints)
            ? data.trackPoints.map((t: any[]) => [t[0], t[1]] as [number, number])
            : null
        }
      }));
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

  const loadEvents = async (city: string) => {
    const today = new Date().toISOString().slice(0, 10);
    const { data } = await (supabase as any)
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
      source: item.source
    });
    setCardPhoto(0);

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
    const { error } = await (supabase as any)
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
    const { data: copy, error } = await (supabase as any)
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
      const { data: full } = await (supabase as any)
        .from('trip_project_places')
        .select('name, category, priority, lat, lng, description, opening_hours, visit_minutes, source')
        .eq('project_id', active.id);
      if (full?.length) {
        await (supabase as any).from('trip_project_places')
          .insert(full.map((f: any) => ({ ...f, project_id: copy.id })));
      }
    }
    setProjects((prev) => [copy, ...prev]);
    setActiveId(copy.id);
    toast.success('Skopiowano tablicę razem z miejscami — zmień charakter i planuj po swojemu');
  };

  const shareProject = async () => {
    if (!active || !shareEmail.trim()) return;
    setSharing(true);
    try {
      const { data, error } = await (supabase as any)
        .from('trip_project_shares')
        .insert({ project_id: active.id, shared_with_email: shareEmail.trim().toLowerCase() })
        .select('id, shared_with_email, role')
        .single();
      if (error) throw error;
      setShares((prev) => [...prev, data]);
      setShareEmail('');
      toast.success('Zaproszenie wysłane e-mailem — tablica czeka na tę osobę po zalogowaniu');
    } catch (err: any) {
      toast.error(err.message.includes('duplicate') ? 'Ta osoba już ma dostęp' : err.message);
    } finally {
      setSharing(false);
    }
  };

  const revokeShare = async (id: string) => {
    await (supabase as any).from('trip_project_shares').delete().eq('id', id);
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
    const isVenue = (it: any) => {
      const name = String(it.name || '');
      if (['walk', 'transit', 'break', 'meal'].includes(it.kind)) return false;
      // Lista musi obejmować też "Przejazd" i posiłki — bez tego pozycja
      // organizacyjna szła do geokodera i lądowała w przypadkowym mieście.
      return !/^(przejazd|przej[śs]cie|przerwa|czas wolny|wolny czas|powr[óo]t|dojazd|transfer|lunch|obiad|kolacja|śniadanie|odpoczynek|spacer(\s|$)|nocleg)/i.test(
        name.trim()
      );
    };

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
        toast.error('Nie udało się ustalić położenia części miejsc');
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
      toast.error('Za mało miejsc ze współrzędnymi, żeby wyznaczyć trasę');
      return;
    }
    waypoints[0].type = 'start';
    waypoints[waypoints.length - 1].type = 'end';

    const { data: userData } = await supabase.auth.getUser();
    if (!userData.user) return;
    const brief = `${active.destination}: ${label}. Miejsca: ${waypoints.map((w) => w.name).join(', ')}.`;
    const { data, error } = await (supabase as any)
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
    const { data, error } = await (supabase as any)
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
      .select('id, name, category, priority, lat, lng, sort_order, description, opening_hours, visit_minutes, website, image_url, wiki_extract')
      .single();
    if (error) return toast.error(error.message);
    setPlaces((prev) => [...prev, data]);
    toast.success(`Dodano do tablicy: ${item.name}`);
  };

  const deletePlan = async (id: string) => {
    await (supabase as any).from('trip_plans').delete().eq('id', id);
    setSavedPlans((prev) => prev.filter((p) => p.id !== id));
  };

  const buildPlan = async () => {
    if (!active || places.length === 0) return;
    setPlanning(true);
    setPlan(null);
    try {
      const hotel = places.find((p) => p.category === 'hotel');
      const data = await apiPost<any>('/plan-trip', {
        destination: active.destination,
        days: active.days || 1,
        window: { start: planForm.start, end: planForm.end },
        start_date: planForm.date || undefined,
        hotel: hotel ? { name: hotel.name } : null,
        fill_percent: active.fill_percent ?? 70,
        fixed: planForm.dinner ? [{ time: planForm.dinner, label: 'kolacja', minutes: 60 }] : [],
        places: places.map((p) => ({
          name: p.name, category: p.category, priority: p.priority,
          opening_hours: p.opening_hours, visit_minutes: p.visit_minutes, description: p.description
        })),
        creator_preferences: mergePreferences(userPrefs, active)
      });
      setPlan(data);
      setPlanDay(0);
      // Plan powstaje z tablicy, ale mieszka w swojej zakładce. Bez tego skoku
      // przycisk "ułóż plan" wyglądałby, jakby nic nie zrobił.
      navigate('/plany?widok=plan');
      // Każdy wygenerowany plan zostaje — z jednej tablicy może powstać ich wiele
      const { data: saved } = await (supabase as any)
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
      if (saved) setSavedPlans((prev) => [saved, ...prev]);
      refreshTokens();
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setPlanning(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16 text-muted-foreground">
        <Loader2 className="w-5 h-5 animate-spin mr-2" /> Wczytuję projekty…
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
      <div className="flex flex-wrap items-end justify-between gap-4 mb-8">
        <div>
          <p className="font-narrow uppercase tracking-[0.32em] text-[11px] text-muted-foreground">
            {!active ? 'Plany wyjazdów' : view === 'plan' ? 'Plan wyjazdu' : 'Tablica wyjazdu'}
          </p>
          <h1 className="font-display font-light text-[40px] leading-[1.05] tracking-[-0.02em] mt-2">
            {active ? active.name : 'Twoje wyjazdy'}
          </h1>
          {!active && (
            <p className="text-sm text-muted-foreground mt-2">
              Zbieraj miejsca, kiedy tylko chcesz. Trasy ułożymy z nich później.
            </p>
          )}
        </div>
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
          <Button size="sm" variant="outline" onClick={() => setCreating((v) => !v)}>
            <Plus className="w-4 h-4 mr-1" /> Nowy plan
          </Button>
          {active && mustCount > 0 && view === 'tablica' && (
            <Button onClick={() => buildPlan()} disabled={planning}
              className="bg-primary hover:bg-primary/90">
              {planning
                ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Układam…</>
                : <>Ułóż plan{active.days ? ` na ${active.days} dni` : ''} ↗</>}
            </Button>
          )}
        </div>
      </div>

      <div className="space-y-5">
        {creating && (
          <div className="grid gap-2 sm:grid-cols-4 p-4 bg-muted/50 rounded-md">
            <Input placeholder="Nazwa, np. Bukareszt — delegacja" value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })} className="sm:col-span-2" />
            <Input placeholder="Miasto" value={form.destination}
              onChange={(e) => setForm({ ...form, destination: e.target.value })} />
            <div className="flex gap-2">
              <Input placeholder="Dni" type="number" value={form.days}
                onChange={(e) => setForm({ ...form, days: e.target.value })} />
              <Input placeholder="h/dzień" type="number" value={form.hours}
                onChange={(e) => setForm({ ...form, hours: e.target.value })} />
            </div>
            <div className="sm:col-span-4 space-y-1.5">
              <span className="text-xs text-muted-foreground">Charakter wyjazdu — nadpisze Twoje domyślne preferencje na czas tego planu</span>
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
            <Button onClick={createProject} className="sm:col-span-4 bg-primary hover:bg-primary/90">
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
        {projects.length > 1 && (
          <div className="flex flex-wrap gap-x-5 gap-y-2 -mt-3">
            {projects.map((p) => (
              <button
                key={p.id}
                onClick={() => setActiveId(p.id)}
                className={`text-[13px] pb-1 border-b-2 transition-colors ${
                  p.id === activeId
                    ? 'border-b-foreground text-foreground'
                    : 'border-b-transparent text-muted-foreground hover:text-foreground'
                }`}
              >
                {p.name}
                {p.destination && <span className="opacity-60"> · {p.destination}</span>}
              </button>
            ))}
          </div>
        )}

        {active && (
          <>
            {view === 'tablica' && (<>
            {/* Kubełki od razu pod nagłówkiem. Wcześniej stało nad nimi pięć
                bloków — dane wyjazdu, suwak proporcji, wyszukiwarka, wydarzenia
                i ostrzeżenia — więc tablica zaczynała się poniżej ekranu. Reszta
                zeszła pod spód: to narzędzia do tablicy, nie sama tablica. */}
            {places.length > 0 && (
              <div>
                <div className="flex items-center justify-end mb-3">
                  <button onClick={() => setGrouped((v) => !v)}
                    className="text-xs text-muted-foreground hover:text-foreground transition-colors">
                    {grouped ? 'Pokaż jako jedną listę' : 'Grupuj wg kategorii'}
                  </button>
                </div>
                <div className="grid gap-3 md:grid-cols-3">
                  {ZONES.map((zone) => {
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
                        <div className="flex items-center justify-between px-4 py-3.5 border-b border-border">
                          <span className="flex items-center gap-2.5">
                            <span className={`w-2 h-2 rounded-full ${
                              zone.id === 'must' ? 'bg-primary'
                                : zone.id === 'nice' ? 'bg-dusty-blue' : 'bg-clay'
                            }`} />
                            <span className="font-narrow uppercase tracking-[0.18em] text-[11px] text-muted-foreground">
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
                                className={`group rounded-md border border-border bg-background p-3 cursor-grab
                                            active:cursor-grabbing shadow-token-sm hover:shadow-token-md transition-shadow ${
                                  zone.id === 'rejected' ? 'opacity-70' : ''
                                }`}
                              >
                                <div className="flex gap-3">
                                  <div className="w-[70px] h-[70px] rounded-sm bg-muted shrink-0 overflow-hidden
                                                  flex items-center justify-center">
                                    {p.image_url
                                      ? <img src={p.image_url} alt="" loading="lazy" className="w-full h-full object-cover" />
                                      : <Icon className="w-5 h-5 text-muted-foreground/60" />}
                                  </div>
                                  <div className="min-w-0 flex-1">
                                    <div className="flex items-start gap-1.5">
                                      <button onClick={() => openPlaceCard(p)}
                                        className="font-display text-[15px] leading-snug text-left flex-1
                                                   hover:text-primary transition-colors">
                                        {p.name}
                                      </button>
                                      <button onClick={() => unpin(p.id)} aria-label="Usuń z tablicy"
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
                                    <div className="flex gap-1.5 mt-2">
                                      {ZONES.map((z) => (
                                        <button key={z.id} onClick={() => movePlace(p.id, z.id)}
                                          className={`rounded-full px-2.5 py-1 text-[11px] transition-colors ${
                                            p.priority === z.id
                                              ? z.id === 'must' ? 'bg-primary text-primary-foreground'
                                                : z.id === 'nice' ? 'bg-dusty-blue text-dusty-blue-foreground'
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
                            <p className="text-[13px] text-muted-foreground px-3 py-10 text-center text-balance">
                              {zone.hint}
                            </p>
                          )}
                        </div>
                        </div>
                      </div>
                    );
                  })}
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
                  <span className="text-xs flex items-center gap-1 text-muted-foreground px-2" title="Współtwórcy tablicy">
                    <Users className="w-3.5 h-3.5" /> {shares.length}
                  </span>
                )}
                <button onClick={duplicateProject} title="Kopiuj tablicę"
                  className="text-muted-foreground hover:text-foreground p-2 rounded-md hover:bg-muted transition-colors">
                  <Copy className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Proporcja czasu: świadomy wybór, jak gęsty ma być dzień */}
            <div className="rounded-md border bg-muted/30 px-4 py-3">
              <div className="flex items-baseline justify-between gap-3 mb-2">
                <span className="text-sm font-medium">Ile czasu zaplanować</span>
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
                        budget.ratio > 1.05 ? 'bg-red-500' : budget.ratio > 0.85 ? 'bg-warning' : 'bg-primary'
                      }`}
                      style={{ width: `${Math.min(100, budget.ratio * 100)}%` }}
                    />
                  </div>
                  <p className="text-[11px] text-muted-foreground mt-1.5 tabular-nums">
                    <strong className="text-foreground">{places.length}</strong> miejsc ({mustCount} koniecznie) ·{' '}
                    Zebrane: <strong className="text-foreground">{(budget.used / 60).toFixed(1)} h</strong>
                    {' '}z {(budget.planned / 60).toFixed(1)} h zaplanowanego czasu
                    {' '}(okno {(budget.windowMin / 60).toFixed(0)} h, w tym przejścia po {TRANSFER_MIN} min)
                    {budget.ratio > 1.05 && <span className="text-red-600 font-medium"> — więcej, niż da się przejść</span>}
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

            <div>
              <div className="relative flex items-center">
                <Search className="w-4 h-4 absolute left-3 text-muted-foreground" />
                <Input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && search(query)}
                  placeholder={`Czego szukasz w: ${active.destination}?`}
                  className="pl-9 pr-24"
                />
                <Button size="sm" onClick={() => search(query)} disabled={searching || !query.trim()}
                  className="absolute right-1 bg-primary hover:bg-primary/90">
                  {searching ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Szukaj'}
                </Button>
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
                        <img src={r.image_url} alt="" loading="lazy"
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
                          {r.description || r.wiki_extract}
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
            </>)}

            {/* Okno karty miejsca zostaje poza podziałem: otwiera je zarówno kafelek
                na tablicy, jak i punkt na osi dnia w planie. */}
            <Dialog open={!!placeCard} onOpenChange={(open) => !open && setPlaceCard(null)}>
              <DialogContent className="max-w-md">
                <DialogHeader>
                  <DialogTitle className="pr-6 text-left leading-snug">{placeCard?.name}</DialogTitle>
                </DialogHeader>
                {placeCard && (
                  <div className="space-y-3">
                    {placeCard.photos?.length > 0 && (
                      <div className="relative rounded-md overflow-hidden bg-muted">
                        <img
                          src={placeCard.photos[Math.min(cardPhoto, placeCard.photos.length - 1)]}
                          alt={placeCard.name}
                          className="w-full h-48 object-cover"
                          onError={() => setPlaceCard((prev: any) => ({ ...prev, photos: [] }))}
                        />
                        {placeCard.photos.length > 1 && (
                          <div className="absolute bottom-2 left-0 right-0 flex justify-center gap-1.5">
                            {placeCard.photos.map((_: string, i: number) => (
                              <button key={i} onClick={() => setCardPhoto(i)}
                                className={`w-1.5 h-1.5 rounded-full ${i === Math.min(cardPhoto, placeCard.photos.length - 1) ? 'bg-white' : 'bg-white/50'}`} />
                            ))}
                          </div>
                        )}
                      </div>
                    )}

                    {placeCard.source === 'suggested' && (
                      <span className="inline-block text-[10px] text-primary bg-primary/10 rounded-full px-2 py-0.5">
                        propozycja agenta — nie ma jej jeszcze na Twojej tablicy
                      </span>
                    )}

                    {cardLoading && !placeCard.description && (
                      <p className="text-sm text-muted-foreground flex items-center gap-2">
                        <Loader2 className="w-4 h-4 animate-spin" /> Sprawdzam, co to za miejsce…
                      </p>
                    )}
                    {placeCard.description && <p className="text-sm leading-relaxed">{placeCard.description}</p>}
                    {placeCard.recommendation && (
                      <p className="text-xs bg-primary/10/70 border border-primary/30 rounded-md p-2.5 leading-relaxed">
                        <strong className="block text-[10px] uppercase tracking-wider text-primary mb-0.5">Wskazówka</strong>
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
                "dokładam dzień czy nie" — nie w osobnej zakładce. */}
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
                <div className="divide-y max-h-64 overflow-y-auto">
                  {events.map((ev) => (
                    <div key={ev.id} className="px-4 py-2.5 flex items-start gap-3 text-sm">
                      <span className="font-mono text-[11px] text-muted-foreground shrink-0 pt-0.5 w-[92px]">
                        {ev.starts_on?.slice(5)}{ev.ends_on && ev.ends_on !== ev.starts_on ? `–${ev.ends_on.slice(5)}` : ''}
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="font-medium leading-snug">{ev.name}</div>
                        {ev.description && (
                          <div className="text-xs text-muted-foreground leading-snug">{ev.description}</div>
                        )}
                      </div>
                      {ev.url && (
                        <a href={ev.url} target="_blank" rel="noreferrer"
                          className="text-muted-foreground hover:text-primary shrink-0 mt-0.5" title="Strona wydarzenia">
                          <ExternalLink className="w-3.5 h-3.5" />
                        </a>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {(outliers.length > 0 || duplicates.length > 0) && (
              <div className="rounded-md border border-warning/40 bg-warning/60 px-4 py-3 space-y-1.5">
                {outliers.length > 0 && (
                  <p className="text-xs text-warning-foreground">
                    <strong>Daleko od reszty:</strong> {outliers.map((p) => p.name).join(', ')}.
                    {' '}Dojazd zje czas przeznaczony na zwiedzanie — rozważ osobny dzień albo odpuszczenie.
                  </p>
                )}
                {duplicates.length > 0 && (
                  <p className="text-xs text-warning-foreground">
                    <strong>Możliwe duplikaty:</strong> {duplicates.join('; ')} — to samo miejsce pod dwiema nazwami.
                  </p>
                )}
              </div>
            )}


            <div className="border-t pt-4 space-y-2">
              <h3 className="text-sm font-semibold flex items-center gap-2">
                <Share2 className="w-4 h-4 text-primary" /> Udostępnij tablicę
              </h3>
              <div className="flex gap-2">
                <Input
                  type="email"
                  value={shareEmail}
                  onChange={(e) => setShareEmail(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && shareProject()}
                  placeholder="adres e-mail osoby, która ma współtworzyć"
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
                      <button onClick={() => revokeShare(sh.id)} className="text-muted-foreground hover:text-red-500">
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            </>)}

            {view === 'plan' && (<>
            {/* Pusto w zakładce planu nie znaczy "nic tu nie ma", tylko "nie ma
                jeszcze czego pokazać" — więc mówimy, czego brakuje i dajemy
                przycisk, zamiast zostawiać białą stronę. */}
            {!plan && savedPlans.length === 0 && (
              <div className="rounded-md border border-border bg-card px-6 py-16 text-center">
                <h2 className="font-display font-light text-[24px]">Planu jeszcze nie ma</h2>
                <p className="text-sm text-muted-foreground mt-2 max-w-[46ch] mx-auto text-pretty">
                  {mustCount > 0
                    ? `Na tablicy czeka ${mustCount} ${mustCount === 1 ? 'miejsce' : 'miejsc'} oznaczonych „na pewno”. Ułóż z nich dni.`
                    : 'Najpierw oznacz na tablicy miejsca, bez których wyjazd nie ma sensu. Z nich powstanie plan.'}
                </p>
                <Button
                  className="mt-6 bg-primary hover:bg-primary/90"
                  disabled={mustCount === 0 || planning}
                  onClick={() => (mustCount > 0 ? buildPlan() : navigate('/plany'))}
                >
                  {planning
                    ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Układam…</>
                    : mustCount > 0
                      ? <>Ułóż plan{active.days ? ` na ${active.days} dni` : ''} ↗</>
                      : 'Wróć na tablicę'}
                </Button>
              </div>
            )}

            {savedPlans.length > 0 && (
              <div className="border-t pt-4 space-y-2">
                <h3 className="text-sm font-semibold">Zapisane plany ({savedPlans.length})</h3>
                {savedPlans.map((sp) => (
                  <div key={sp.id} className="flex items-center gap-2 p-2 rounded-md bg-muted/50 text-sm">
                    <CalendarDays className="w-4 h-4 text-muted-foreground shrink-0" />
                    <button onClick={() => setPlan(sp.plan)} className="flex-1 text-left hover:underline truncate">
                      {sp.name}
                      <span className="text-xs text-muted-foreground ml-2">
                        {new Date(sp.created_at).toLocaleDateString('pl-PL')}
                      </span>
                    </button>
                    <button onClick={() => deletePlan(sp.id)} className="text-muted-foreground hover:text-red-500">
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
                    className="self-end bg-primary hover:bg-primary/90">
                    {planning ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Zaplanuj'}
                  </Button>
                </div>
                {planning && (
                  <p className="text-xs text-muted-foreground">
                    Sprawdzam godziny otwarcia i układam dni…
                  </p>
                )}
              </div>
            )}

            {plan && (
              <div className="space-y-5">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div>
                    <h2 className="font-display font-light text-[32px] leading-[1.05] tracking-[-0.02em]">
                      {plan.title || active?.name || 'Plan wyjazdu'}
                    </h2>
                    {plan.summary && (
                      <p className="text-sm text-muted-foreground mt-2 max-w-[62ch] text-pretty">{plan.summary}</p>
                    )}
                  </div>
                  <Button variant="outline" size="sm" onClick={buildPlan} disabled={planning}>
                    {planning
                      ? <><Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> Liczę…</>
                      : <><RefreshCw className="w-3.5 h-3.5 mr-1.5" /> Przelicz plan</>}
                  </Button>
                </div>

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
                                <span>Do przejścia: <strong className="font-mono tabular-nums text-foreground">{measured.km.toFixed(1)} km</strong></span>
                                <span>Marsz: <strong className="font-mono tabular-nums text-foreground">{Math.round(measured.h * 60)} min</strong></span>
                                <span className="text-primary">przeliczone po chodnikach</span>
                              </>
                            ) : (
                              <>
                                {km > 0 && <span>Do przejścia: <strong className="font-mono tabular-nums text-foreground">ok. {km.toFixed(1)} km</strong></span>}
                                {km > 0 && <span>Marsz: <strong className="font-mono tabular-nums text-foreground">ok. {Math.round((km / 4.5) * 60)} min</strong></span>}
                              </>
                            )}
                            <span>Punktów: <strong className="font-mono tabular-nums text-foreground">{items.length}</strong></span>
                            {items.filter((it: any) => it.lat != null).length >= 2 && !measured && (
                              <button
                                onClick={() => recalcDay(day)}
                                disabled={exact === 'loading'}
                                className="ml-auto flex items-center gap-1 text-primary hover:text-primary hover:underline disabled:opacity-60"
                              >
                                {exact === 'loading'
                                  ? <><Loader2 className="w-3 h-3 animate-spin" /> Liczę przebieg…</>
                                  : <><RefreshCw className="w-3 h-3" /> Przelicz dokładnie</>}
                              </button>
                            )}
                          </div>
                          </>
                        );
                      })()}

                      {(day.items || []).map((it: any, i: number) => {
                        const suggested = it.source === 'suggested';
                        const alreadyPinned = places.some((p) => p.name === it.name);
  return (
                          <div key={i} className="flex gap-3 px-4 py-2.5 text-sm items-start hover:bg-muted/40 transition-colors">
                            <span className="w-14 shrink-0 pt-0.5">
                              <span className="font-mono text-[13px] tabular-nums block">{it.time}</span>
                              {it.minutes && (
                                <span className="font-mono text-[11px] tabular-nums text-muted-foreground block mt-0.5">
                                  {formatMinutes(it.minutes)}
                                </span>
                              )}
                            </span>
                            {/* Numer na osi odpowiada numerowi pinezki na mapie obok. */}
                            <span className={`w-6 h-6 rounded-full shrink-0 mt-0.5 flex items-center justify-center
                                              text-[12px] font-medium ${
                              suggested
                                ? 'bg-dusty-blue text-dusty-blue-foreground'
                                : 'bg-primary text-primary-foreground'
                            }`}>
                              {i + 1}
                            </span>
                            <div className="min-w-0 flex-1">
                              <div className="font-display text-[15px] flex items-center gap-2 flex-wrap">
                                <button
                                  onClick={() => openPlaceCard(it)}
                                  className="text-left hover:text-primary hover:underline decoration-dotted underline-offset-2"
                                >
                                  {it.name}
                                </button>
                                {suggested && (
                                  <span className="text-[10px] font-normal text-primary bg-primary/10 rounded-full px-1.5 py-0.5">
                                    propozycja agenta
                                  </span>
                                )}
                              </div>
                              {it.note && <div className="text-xs text-muted-foreground">{it.note}</div>}
                            </div>
                            {suggested && !alreadyPinned && (
                              <button
                                onClick={() => pinSuggestion(it)}
                                title="Dodaj do tablicy"
                                className="text-muted-foreground hover:text-primary shrink-0 mt-0.5"
                              >
                                <Pin className="w-3.5 h-3.5" />
                              </button>
                            )}

                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))}

                {plan.not_scheduled?.length > 0 && (
                  <div className="rounded-md border border-warning/40 bg-warning/60 p-3">
                    <div className="text-sm font-semibold text-warning-foreground mb-1">Nie zmieściło się</div>
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
                      const pts = (d?.items || [])
                        .filter((it: any) => it.lat != null && it.lng != null)
                        .map((it: any) => ({ name: it.name, lat: it.lat, lng: it.lng }));
                      if (pts.length === 0) return null;
                      const dr = d ? dayRoutes[d.day] : null;
                      const dayTrack = dr && dr !== 'loading' ? dr.track ?? null : null;
                      const withoutCoords = (d?.items || []).length - pts.length;
                      return (
                        <div className="rounded-md border border-border overflow-hidden bg-card">
                          <PlanDayMap points={pts} track={dayTrack} className="h-[380px] w-full" />
                          <div className="flex items-center justify-between px-4 py-2.5 border-t border-border">
                            <span className="font-narrow uppercase tracking-[0.18em] text-[10px] text-muted-foreground">
                              Trasa dnia
                            </span>
                            <span className="font-mono text-[12px] tabular-nums text-muted-foreground">
                              {pts.length} {pts.length === 1 ? 'punkt' : 'punktów'}
                              {withoutCoords > 0 && ` · ${withoutCoords} bez położenia`}
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
            </>)}
          </>
        )}
      </div>
    </div>
  );
}
