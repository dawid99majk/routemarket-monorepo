import { useEffect, useState } from 'react';
import {
  AlertTriangle, Bed, CalendarDays, Clock, Coins, Copy, ExternalLink, Loader2, MapPin, Music, Pin, Plus, Search, Share2, Star, Trash2, Users, Utensils
} from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/integrations/supabase/client';
import { TRIP_PRESETS, EMPTY_AXES, mergePreferences, type AxisValues } from '@/lib/tripPresets';

interface TripProject extends Partial<AxisValues> {
  id: string;
  name: string;
  destination: string;
  days: number | null;
  hours_per_day: number | null;
  trip_type: string | null;
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
const ZONES: { id: Priority; label: string; hint: string }[] = [
  { id: 'must', label: 'Chcę zobaczyć', hint: 'Te miejsca planer wstawi w pierwszej kolejności' },
  { id: 'nice', label: 'Może', hint: 'Wypełnią luki, jeśli zostanie czas' },
  { id: 'rejected', label: 'Odrzucone', hint: 'Pomijane przy planowaniu' }
];

const CATEGORY_ICON: Record<string, any> = {
  attraction: MapPin,
  food: Utensils,
  nightlife: Music,
  hotel: Bed,
  other: MapPin
};

/** Podpowiedzi zapytań — pokazują, że można pytać naturalnie, a nie słowami kluczowymi. */
const SUGGESTIONS = [
  'najciekawsze muzea',
  'lokalny street food, nie turystyczne pułapki',
  'klimatyczne kawiarnie',
  'co robić wieczorem',
  'hotel blisko centrum'
];

export default function TripProjects() {
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
  const [plan, setPlan] = useState<any | null>(null);
  const [planForm, setPlanForm] = useState({ start: '17:00', end: '21:00', date: '', dinner: '20:00' });

  const [query, setQuery] = useState('');
  const [searching, setSearching] = useState(false);
  const [results, setResults] = useState<DiscoveredPlace[]>([]);

  const active = projects.find((p) => p.id === activeId) || null;

  useEffect(() => {
    (async () => {
      const { data: userData } = await supabase.auth.getUser();
      if (!userData.user) return setLoading(false);
      const { data } = await (supabase as any)
        .from('trip_projects')
        .select('id, name, destination, days, hours_per_day, trip_type, pace, popularity, wandering, dining, effort, crowds')
        .order('updated_at', { ascending: false });
      setProjects(data || []);
      if (data?.length) setActiveId(data[0].id);
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
    (async () => {
      const { data } = await (supabase as any)
        .from('trip_project_places')
        .select('id, name, category, priority, sort_order, description, opening_hours, visit_minutes, website, image_url, wiki_extract')
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
    if (!form.name.trim() || !form.destination.trim()) return;
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
      .select('id, name, destination, days, hours_per_day, trip_type, pace, popularity, wandering, dining, effort, crowds')
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
      const apiUrl = import.meta.env.VITE_API_URL || '/route-builder-api';
      const res = await fetch(`${apiUrl}/discover-places`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: q,
          destination: active.destination,
          creator_preferences: mergePreferences(userPrefs, active)
        })
      });
      if (!res.ok) throw new Error('Wyszukiwanie nie powiodło się');
      const data = await res.json();
      setResults(data.places || []);
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setSearching(false);
    }
  };

  const pin = async (place: DiscoveredPlace, priority: Priority) => {
    if (!active) return;
    const { data, error } = await (supabase as any)
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
      .select('id, name, category, priority, sort_order, description, opening_hours, visit_minutes, website, image_url, wiki_extract')
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
      .select('id, name, destination, days, hours_per_day, trip_type, pace, popularity, wandering, dining, effort, crowds')
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
      toast.success('Tablica udostępniona — druga osoba zobaczy ją u siebie po zalogowaniu');
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
      const apiUrl = import.meta.env.VITE_API_URL || '/route-builder-api';
      const res = await fetch(`${apiUrl}/plan-trip`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          destination: active.destination,
          days: active.days || 1,
          window: { start: planForm.start, end: planForm.end },
          start_date: planForm.date || undefined,
          hotel: hotel ? { name: hotel.name } : null,
          fixed: planForm.dinner ? [{ time: planForm.dinner, label: 'kolacja', minutes: 60 }] : [],
          places: places.map((p) => ({
            name: p.name, category: p.category, priority: p.priority,
            opening_hours: p.opening_hours, visit_minutes: p.visit_minutes, description: p.description
          })),
          creator_preferences: mergePreferences(userPrefs, active)
        })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Planowanie nie powiodło się');
      setPlan(data);
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

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between gap-4">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Pin className="w-5 h-5 text-emerald-600" />
              Plany wyjazdów
            </CardTitle>
            <CardDescription>
              Zbieraj miejsca, kiedy tylko chcesz. Trasy ułożymy z nich później.
            </CardDescription>
          </div>
          <Button size="sm" variant="outline" onClick={() => setCreating((v) => !v)}>
            <Plus className="w-4 h-4 mr-1" /> Nowy plan
          </Button>
        </div>
      </CardHeader>

      <CardContent className="space-y-5">
        {creating && (
          <div className="grid gap-2 sm:grid-cols-4 p-4 bg-muted/50 rounded-xl">
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
                        ? 'bg-emerald-600 border-emerald-600 text-white'
                        : 'bg-background hover:bg-muted'
                    }`}
                  >
                    {preset.label}
                  </button>
                ))}
              </div>
            </div>
            <Button onClick={createProject} className="sm:col-span-4 bg-emerald-600 hover:bg-emerald-500">
              Utwórz plan
            </Button>
          </div>
        )}

        {projects.length === 0 && !creating && (
          <p className="text-sm text-muted-foreground py-6 text-center">
            Nie masz jeszcze żadnego planu. Utwórz pierwszy — np. „Bukareszt, 3 dni po 3 godziny".
          </p>
        )}

        {projects.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {projects.map((p) => (
              <button
                key={p.id}
                onClick={() => setActiveId(p.id)}
                className={`rounded-full px-3.5 py-1.5 text-sm border transition-colors ${
                  p.id === activeId
                    ? 'bg-emerald-600 border-emerald-600 text-white'
                    : 'bg-background hover:bg-muted'
                }`}
              >
                {p.name}
                {p.days ? <span className="opacity-70"> · {p.days} dni</span> : null}
              </button>
            ))}
          </div>
        )}

        {active && (
          <>
            <div className="flex flex-wrap items-center gap-3 text-sm text-muted-foreground border-t pt-4">
              <span className="flex items-center gap-1.5"><MapPin className="w-4 h-4" />{active.destination}</span>
              {active.days && active.hours_per_day && (
                <span className="flex items-center gap-1.5">
                  <Clock className="w-4 h-4" />{active.days} × {active.hours_per_day} h
                </span>
              )}
              <button onClick={() => setEditingType((v) => !v)}
                className="rounded-full border px-2.5 py-0.5 text-xs hover:bg-muted transition-colors">
                {active.trip_type
                  ? (TRIP_PRESETS.find((t) => t.id === active.trip_type)?.label || active.trip_type)
                  : 'Ustaw charakter'}
              </button>
              <button onClick={duplicateProject}
                className="text-xs flex items-center gap-1 hover:text-foreground transition-colors">
                <Copy className="w-3.5 h-3.5" /> Kopiuj tablicę
              </button>
              {shares.length > 0 && (
                <span className="text-xs flex items-center gap-1">
                  <Users className="w-3.5 h-3.5" /> {shares.length}
                </span>
              )}
              <span>Przypięte: <strong className="text-foreground">{places.length}</strong> ({mustCount} koniecznie)</span>
              {totalMinutes > 0 && (
                <span>Zwiedzanie łącznie: <strong className="text-foreground">{Math.round(totalMinutes / 60)} h</strong></span>
              )}
            </div>

            {editingType && (
              <div className="rounded-xl bg-muted/50 p-3 space-y-2">
                <span className="text-xs text-muted-foreground">
                  Charakter można zmieniać do woli — liczy się dopiero przy wyszukiwaniu i planowaniu.
                </span>
                <div className="flex flex-wrap gap-1.5">
                  {TRIP_PRESETS.map((preset) => (
                    <button key={preset.id} title={preset.hint} onClick={() => changeTripType(preset.id)}
                      className={`rounded-full px-3 py-1.5 text-xs border transition-colors ${
                        active.trip_type === preset.id
                          ? 'bg-emerald-600 border-emerald-600 text-white'
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
                  className="absolute right-1 bg-emerald-600 hover:bg-emerald-500">
                  {searching ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Szukaj'}
                </Button>
              </div>
              <div className="flex flex-wrap gap-1.5 mt-2">
                {SUGGESTIONS.map((sug) => (
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
                    <div key={r.name} className="rounded-xl border overflow-hidden bg-background flex flex-col">
                      {r.image_url && (
                        <img src={r.image_url} alt="" loading="lazy"
                          className="w-full h-32 object-cover bg-muted" />
                      )}
                      <div className="p-3 space-y-2 flex-1 flex flex-col">
                        <div className="flex items-start gap-2">
                          <Icon className="w-4 h-4 mt-0.5 text-emerald-600 shrink-0" />
                          <div className="min-w-0 flex-1">
                            <div className="font-medium text-sm leading-snug">{r.name}</div>
                            {r.why && <div className="text-xs text-emerald-700 mt-0.5">{r.why}</div>}
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
                            className="text-xs text-emerald-700 hover:underline inline-flex items-center gap-1">
                            <ExternalLink className="w-3 h-3" /> Strona miejsca
                          </a>
                        )}
                        <div className="flex gap-2 pt-1">
                          <Button size="sm" className="flex-1 bg-emerald-600 hover:bg-emerald-500 h-8"
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

            {places.length > 0 && (
              <div className="border-t pt-4">
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-sm font-semibold">Tablica miejsc</h3>
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
                        className={`rounded-xl p-2.5 min-h-[120px] transition-colors ${
                          zone.id === 'rejected' ? 'bg-muted/40' : 'bg-muted/60'
                        }`}
                      >
                        <div className="flex items-baseline justify-between mb-2 px-1">
                          <span className="text-xs font-semibold">{zone.label}</span>
                          <span className="text-[11px] text-muted-foreground">{zonePlaces.length}</span>
                        </div>
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
                                className={`rounded-lg border bg-background overflow-hidden cursor-grab active:cursor-grabbing ${
                                  zone.id === 'rejected' ? 'opacity-60' : ''
                                }`}
                              >
                                {p.image_url && zone.id !== 'rejected' && (
                                  <img src={p.image_url} alt="" loading="lazy"
                                    className="w-full h-20 object-cover bg-muted" />
                                )}
                                <div className="p-2 space-y-1">
                                  <div className="flex items-start gap-1.5">
                                    <Icon className="w-3.5 h-3.5 mt-0.5 text-muted-foreground shrink-0" />
                                    <span className="text-xs font-medium leading-snug flex-1">{p.name}</span>
                                    <button onClick={() => unpin(p.id)}
                                      className="text-muted-foreground hover:text-red-500 shrink-0">
                                      <Trash2 className="w-3.5 h-3.5" />
                                    </button>
                                  </div>
                                  {p.opening_hours && (
                                    <div className="text-[10px] text-muted-foreground truncate">{p.opening_hours}</div>
                                  )}
                                  <div className="flex items-center gap-2">
                                    {p.visit_minutes && (
                                      <span className="text-[10px] text-muted-foreground">{p.visit_minutes} min</span>
                                    )}
                                    {p.website && (
                                      <a href={p.website} target="_blank" rel="noopener noreferrer"
                                        className="text-[10px] text-emerald-700 hover:underline inline-flex items-center gap-0.5">
                                        <ExternalLink className="w-2.5 h-2.5" /> strona
                                      </a>
                                    )}
                                  </div>
                                </div>
                              </div>
                            );
                          })}
                          </div>
                          ))}
                          {zonePlaces.length === 0 && (
                            <p className="text-[11px] text-muted-foreground px-1 py-3 text-center">
                              {zone.hint}
                            </p>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
                <p className="text-[11px] text-muted-foreground mt-2">
                  Przeciągnij kartkę między kolumnami, żeby zmienić jej wagę, albo upuść na inną kartkę, żeby ustawić kolejność.
                </p>
              </div>
            )}

            <div className="border-t pt-4 space-y-2">
              <h3 className="text-sm font-semibold flex items-center gap-2">
                <Share2 className="w-4 h-4 text-emerald-600" /> Udostępnij tablicę
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
                    <div key={sh.id} className="flex items-center gap-2 text-xs p-2 rounded-lg bg-muted/50">
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

            {savedPlans.length > 0 && (
              <div className="border-t pt-4 space-y-2">
                <h3 className="text-sm font-semibold">Zapisane plany ({savedPlans.length})</h3>
                {savedPlans.map((sp) => (
                  <div key={sp.id} className="flex items-center gap-2 p-2 rounded-lg bg-muted/50 text-sm">
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
                  <CalendarDays className="w-4 h-4 text-emerald-600" /> Ułóż plan dni
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
                  <label className="text-xs text-muted-foreground">Pierwszy dzień
                    <Input type="date" value={planForm.date}
                      onChange={(e) => setPlanForm({ ...planForm, date: e.target.value })} className="mt-1" />
                  </label>
                  <label className="text-xs text-muted-foreground">Kolacja o
                    <Input type="time" value={planForm.dinner}
                      onChange={(e) => setPlanForm({ ...planForm, dinner: e.target.value })} className="mt-1" />
                  </label>
                  <Button onClick={buildPlan} disabled={planning}
                    className="self-end bg-emerald-600 hover:bg-emerald-500">
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
              <div className="space-y-4">
                {(plan.days || []).map((day: any) => (
                  <div key={day.day} className="rounded-xl border overflow-hidden">
                    <div className="bg-muted/60 px-4 py-2 text-sm font-semibold">
                      Dzień {day.day}
                      {day.weekday && <span className="font-normal text-muted-foreground"> · {day.weekday} {day.date}</span>}
                    </div>
                    <div className="divide-y">
                      {(day.items || []).map((it: any, i: number) => (
                        <div key={i} className="flex gap-3 px-4 py-2 text-sm">
                          <span className="font-mono text-xs text-muted-foreground pt-0.5 w-12 shrink-0">{it.time}</span>
                          <div className="min-w-0">
                            <div className="font-medium">{it.name}</div>
                            {it.note && <div className="text-xs text-muted-foreground">{it.note}</div>}
                          </div>
                          {it.minutes && (
                            <span className="ml-auto text-xs text-muted-foreground shrink-0">{it.minutes} min</span>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                ))}

                {plan.not_scheduled?.length > 0 && (
                  <div className="rounded-xl border border-amber-200 bg-amber-50/60 p-3">
                    <div className="text-sm font-semibold text-amber-900 mb-1">Nie zmieściło się</div>
                    {plan.not_scheduled.map((n: any) => (
                      <div key={n.name} className="text-xs text-amber-900/80">
                        <strong>{n.name}</strong>{n.reason ? ` — ${n.reason}` : ''}
                      </div>
                    ))}
                  </div>
                )}

                {plan.warnings?.length > 0 && (
                  <div className="space-y-1.5">
                    {plan.warnings.map((w: string, i: number) => (
                      <div key={i} className="flex gap-2 text-xs text-muted-foreground">
                        <AlertTriangle className="w-3.5 h-3.5 text-amber-500 shrink-0 mt-0.5" />
                        <span>{w}</span>
                      </div>
                    ))}
                  </div>
                )}

                {plan.question && (
                  <div className="rounded-xl border border-emerald-200 bg-emerald-50/60 p-3 text-sm text-emerald-900">
                    {plan.question}
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
