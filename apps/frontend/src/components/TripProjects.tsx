import { useEffect, useState } from 'react';
import {
  AlertTriangle, Bed, CalendarDays, Clock, Coins, Loader2, MapPin, Music, Pin, Plus, Search, Star, Trash2, Utensils
} from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/integrations/supabase/client';

interface TripProject {
  id: string;
  name: string;
  destination: string;
  days: number | null;
  hours_per_day: number | null;
}

interface PinnedPlace {
  id: string;
  name: string;
  category: string;
  priority: 'must' | 'nice';
  description: string | null;
  opening_hours: string | null;
  visit_minutes: number | null;
}

interface DiscoveredPlace {
  name: string;
  category: string;
  description: string;
  why: string;
  visit_minutes: number | null;
  price_hint: string | null;
  opening_hours: string | null;
  lat: number | null;
  lng: number | null;
  verified: boolean;
}

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
  const [form, setForm] = useState({ name: '', destination: '', days: '', hours: '' });

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
        .select('id, name, destination, days, hours_per_day')
        .order('updated_at', { ascending: false });
      setProjects(data || []);
      if (data?.length) setActiveId(data[0].id);
      setLoading(false);
    })();
  }, []);

  useEffect(() => {
    if (!activeId) return setPlaces([]);
    (async () => {
      const { data } = await (supabase as any)
        .from('trip_project_places')
        .select('id, name, category, priority, description, opening_hours, visit_minutes')
        .eq('project_id', activeId)
        .order('created_at', { ascending: true });
      setPlaces(data || []);
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
        hours_per_day: form.hours ? Number(form.hours) : null
      })
      .select('id, name, destination, days, hours_per_day')
      .single();
    if (error) return toast.error(error.message);
    setProjects((prev) => [data, ...prev]);
    setActiveId(data.id);
    setCreating(false);
    setForm({ name: '', destination: '', days: '', hours: '' });
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
        body: JSON.stringify({ query: q, destination: active.destination })
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

  const pin = async (place: DiscoveredPlace, priority: 'must' | 'nice') => {
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
        visit_minutes: place.visit_minutes
      })
      .select('id, name, category, priority, description, opening_hours, visit_minutes')
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

  const togglePriority = async (place: PinnedPlace) => {
    const next = place.priority === 'must' ? 'nice' : 'must';
    await (supabase as any).from('trip_project_places').update({ priority: next }).eq('id', place.id);
    setPlaces((prev) => prev.map((p) => (p.id === place.id ? { ...p, priority: next } : p)));
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
          }))
        })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Planowanie nie powiodło się');
      setPlan(data);
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
              <span>Przypięte: <strong className="text-foreground">{places.length}</strong> ({mustCount} koniecznie)</span>
              {totalMinutes > 0 && (
                <span>Zwiedzanie łącznie: <strong className="text-foreground">{Math.round(totalMinutes / 60)} h</strong></span>
              )}
            </div>

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
              <div className="grid gap-3 sm:grid-cols-2">
                {results.map((r) => {
                  const Icon = CATEGORY_ICON[r.category] || MapPin;
                  return (
                    <div key={r.name} className="rounded-xl border p-3 space-y-2 bg-background">
                      <div className="flex items-start gap-2">
                        <Icon className="w-4 h-4 mt-0.5 text-emerald-600 shrink-0" />
                        <div className="min-w-0 flex-1">
                          <div className="font-medium text-sm leading-snug">{r.name}</div>
                          {r.why && <div className="text-xs text-emerald-700 mt-0.5">{r.why}</div>}
                        </div>
                      </div>
                      <p className="text-xs text-muted-foreground leading-relaxed">{r.description}</p>
                      <div className="flex flex-wrap gap-1.5 text-[11px]">
                        {r.visit_minutes && <Badge variant="secondary">{r.visit_minutes} min</Badge>}
                        {r.price_hint && (
                          <Badge variant="secondary" className="gap-1"><Coins className="w-3 h-3" />{r.price_hint}</Badge>
                        )}
                        {r.opening_hours && <Badge variant="outline" className="font-normal">{r.opening_hours}</Badge>}
                      </div>
                      <div className="flex gap-2 pt-1">
                        <Button size="sm" className="flex-1 bg-emerald-600 hover:bg-emerald-500 h-8"
                          onClick={() => pin(r, 'must')}>
                          <Star className="w-3.5 h-3.5 mr-1" /> Koniecznie
                        </Button>
                        <Button size="sm" variant="outline" className="flex-1 h-8" onClick={() => pin(r, 'nice')}>
                          Jeśli wyjdzie
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {places.length > 0 && (
              <div className="border-t pt-4 space-y-2">
                <h3 className="text-sm font-semibold">Przypięte miejsca</h3>
                {places.map((p) => {
                  const Icon = CATEGORY_ICON[p.category] || MapPin;
                  return (
                    <div key={p.id} className="flex items-center gap-2 p-2.5 rounded-lg bg-muted/50">
                      <Icon className="w-4 h-4 text-muted-foreground shrink-0" />
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium truncate">{p.name}</div>
                        {p.opening_hours && (
                          <div className="text-[11px] text-muted-foreground truncate">{p.opening_hours}</div>
                        )}
                      </div>
                      <button onClick={() => togglePriority(p)}
                        className={`text-[11px] rounded-full px-2 py-0.5 border transition-colors ${
                          p.priority === 'must'
                            ? 'bg-emerald-600 border-emerald-600 text-white'
                            : 'bg-background text-muted-foreground hover:bg-muted'
                        }`}>
                        {p.priority === 'must' ? 'koniecznie' : 'jeśli wyjdzie'}
                      </button>
                      <button onClick={() => unpin(p.id)} className="text-muted-foreground hover:text-red-500">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  );
                })}
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
