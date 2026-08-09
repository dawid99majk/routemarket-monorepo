import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Heart, Loader2, MapPin, Plus, Search, Sparkles } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { apiPost } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

interface CatalogPlace {
  id: string;
  slug: string;
  name: string;
  city: string | null;
  lat: number;
  lng: number;
  category: string;
  description: string;
  photos: string[];
  vibe_tags: string[];
  pin_count: number;
}

const VIBES = [
  'ikoniczne', 'nietypowe', 'zielone', 'widokowe', 'kulinarne',
  'sztuka', 'historyczne', 'dla-dzieci', 'nadwodne', 'nocne'
];

/**
 * Feed odkrywczy. Wyszukiwarka obsługuje moment, w którym ktoś wie, czego chce;
 * feed obsługuje ten dłuższy, w którym jeszcze nie wie. Karty prowadzą na stronę
 * miejsca, a dwie czynności — do tablicy i do ulubionych — są na wierzchu, bo to
 * one budują zbiór, do którego potem się wraca.
 */
export default function Discover() {
  const navigate = useNavigate();
  const [city, setCity] = useState('');
  const [query, setQuery] = useState('');
  const [vibe, setVibe] = useState<string | null>(null);
  const [places, setPlaces] = useState<CatalogPlace[]>([]);
  const [loading, setLoading] = useState(true);
  const [seeding, setSeeding] = useState(false);
  const [favorites, setFavorites] = useState<Set<string>>(new Set());
  const [boards, setBoards] = useState<{ id: string; name: string }[]>([]);
  const [cities, setCities] = useState<string[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    let q = (supabase as any).from('place_catalog').select('*').limit(60);
    if (city.trim()) q = q.ilike('city', city.trim());
    if (vibe) q = q.contains('vibe_tags', [vibe]);
    if (query.trim()) q = q.ilike('name', `%${query.trim()}%`);
    const { data } = await q.order('pin_count', { ascending: false }).order('created_at', { ascending: false });
    setPlaces(data ?? []);
    setLoading(false);
  }, [city, vibe, query]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    (async () => {
      const { data: userData } = await supabase.auth.getUser();
      if (!userData.user) return;
      const [{ data: favs }, { data: projs }, { data: allCities }] = await Promise.all([
        (supabase as any).from('place_favorites').select('place_id').eq('user_id', userData.user.id),
        (supabase as any).from('trip_projects').select('id, name').order('updated_at', { ascending: false }),
        (supabase as any).from('place_catalog').select('city').not('city', 'is', null).limit(500)
      ]);
      setFavorites(new Set((favs ?? []).map((f: any) => f.place_id)));
      setBoards(projs ?? []);
      setCities([...new Set((allCities ?? []).map((r: any) => r.city))].sort() as string[]);
    })();
  }, []);

  const toggleFavorite = async (place: CatalogPlace) => {
    const { data: userData } = await supabase.auth.getUser();
    if (!userData.user) return navigate('/auth');
    if (favorites.has(place.id)) {
      await (supabase as any).from('place_favorites').delete()
        .eq('user_id', userData.user.id).eq('place_id', place.id);
      setFavorites((prev) => { const next = new Set(prev); next.delete(place.id); return next; });
    } else {
      await (supabase as any).from('place_favorites')
        .insert({ user_id: userData.user.id, place_id: place.id });
      setFavorites((prev) => new Set(prev).add(place.id));
    }
  };

  const addToBoard = async (place: CatalogPlace, projectId: string) => {
    const { error } = await (supabase as any).from('trip_project_places').insert({
      project_id: projectId,
      catalog_id: place.id,
      name: place.name,
      category: place.category,
      priority: 'nice',
      lat: place.lat,
      lng: place.lng,
      description: place.description,
      image_url: place.photos?.[0] ?? null,
      source: 'catalog'
    });
    if (error) return toast.error(error.message);
    toast.success(`Dodano do tablicy: ${place.name}`);
  };

  /** Miasto bez wpisów to pusta półka — pozwalamy ją zapełnić na żądanie. */
  const seedCity = async () => {
    if (!city.trim()) return toast.error('Podaj miasto, które mamy przejrzeć');
    setSeeding(true);
    try {
      const data = await apiPost<any>('/catalog/seed', { city: city.trim(), limit: 24 }, { timeoutMs: 180_000 });
      toast.success(`Dodano ${data.added} miejsc w: ${data.city}`);
      await load();
    } catch (err: any) {
      toast.error(err.message || 'Nie udało się zebrać miejsc');
    } finally {
      setSeeding(false);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b sticky top-0 bg-background/95 backdrop-blur z-10">
        <div className="max-w-6xl mx-auto px-4 h-14 flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => navigate('/')}>
            <ArrowLeft className="w-4 h-4" />
          </Button>
          <span className="font-semibold">Odkrywaj miejsca</span>
          <div className="ml-auto flex gap-2">
            <Button variant="ghost" size="sm" onClick={() => navigate('/plany')}>Moje tablice</Button>
            <Button variant="ghost" size="sm" onClick={() => navigate('/ulubione')}>Ulubione</Button>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 py-6 space-y-5">
        <div className="flex flex-wrap gap-2">
          <div className="relative flex-1 min-w-[180px]">
            <MapPin className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              list="znane-miasta"
              value={city}
              onChange={(e) => setCity(e.target.value)}
              placeholder="Miasto"
              className="pl-9"
            />
            <datalist id="znane-miasta">
              {cities.map((c) => <option key={c} value={c} />)}
            </datalist>
          </div>
          <div className="relative flex-1 min-w-[180px]">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Nazwa miejsca" className="pl-9" />
          </div>
        </div>

        <div className="flex flex-wrap gap-1.5">
          {VIBES.map((v) => (
            <button
              key={v}
              onClick={() => setVibe(vibe === v ? null : v)}
              className={`text-xs rounded-full px-3 py-1.5 border transition-colors ${
                vibe === v ? 'bg-emerald-600 border-emerald-600 text-white' : 'bg-background hover:bg-muted'
              }`}
            >
              {v}
            </button>
          ))}
        </div>

        {loading ? (
          <p className="text-muted-foreground flex items-center gap-2 py-10">
            <Loader2 className="w-4 h-4 animate-spin" /> Wczytuję miejsca…
          </p>
        ) : places.length === 0 ? (
          <div className="text-center py-14 space-y-4">
            <Sparkles className="w-9 h-9 text-muted-foreground/40 mx-auto" />
            <p className="text-muted-foreground max-w-md mx-auto">
              {city.trim()
                ? `Nie mamy jeszcze miejsc dla: ${city}. Możemy je zebrać — potrwa to kilkadziesiąt sekund.`
                : 'Wpisz miasto, żeby zobaczyć, co w nim jest.'}
            </p>
            {city.trim() && (
              <Button onClick={seedCity} disabled={seeding} className="bg-emerald-600 hover:bg-emerald-500">
                {seeding
                  ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Przeglądam miasto…</>
                  : <>Zbierz miejsca dla: {city}</>}
              </Button>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {places.map((p) => (
              <div key={p.id} className="group rounded-2xl overflow-hidden border bg-card hover:shadow-lg transition-shadow flex flex-col">
                <button onClick={() => navigate(`/miejsce/${p.slug}`)} className="block text-left">
                  <div className="h-40 bg-muted relative">
                    {p.photos?.[0] ? (
                      <img src={p.photos[0]} alt={p.name} loading="lazy" className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-muted-foreground/40">
                        <MapPin className="w-7 h-7" />
                      </div>
                    )}
                    <button
                      onClick={(e) => { e.stopPropagation(); toggleFavorite(p); }}
                      aria-label="Do ulubionych"
                      className="absolute top-2 right-2 w-8 h-8 rounded-full bg-black/40 hover:bg-black/60 backdrop-blur flex items-center justify-center transition-colors"
                    >
                      <Heart className={`w-4 h-4 ${favorites.has(p.id) ? 'fill-rose-500 text-rose-500' : 'text-white'}`} />
                    </button>
                  </div>
                  <div className="p-3">
                    <div className="font-medium text-sm leading-snug line-clamp-2">{p.name}</div>
                    {p.description && (
                      <p className="text-xs text-muted-foreground mt-1 line-clamp-2 leading-snug">{p.description}</p>
                    )}
                  </div>
                </button>
                <div className="px-3 pb-3 mt-auto flex items-center gap-1.5 flex-wrap">
                  {p.vibe_tags?.slice(0, 2).map((t) => (
                    <span key={t} className="text-[10px] bg-muted rounded-full px-2 py-0.5 text-muted-foreground">{t}</span>
                  ))}
                  {boards.length > 0 && (
                    <select
                      onChange={(e) => { if (e.target.value) { addToBoard(p, e.target.value); e.target.value = ''; } }}
                      defaultValue=""
                      className="ml-auto text-[11px] border rounded-lg px-1.5 py-1 bg-background hover:bg-muted cursor-pointer"
                      aria-label="Dodaj do tablicy"
                    >
                      <option value="">+ tablica</option>
                      {boards.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
                    </select>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        {places.length > 0 && city.trim() && (
          <div className="text-center pt-4">
            <Button variant="outline" size="sm" onClick={seedCity} disabled={seeding}>
              {seeding
                ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Szukam kolejnych…</>
                : <><Plus className="w-4 h-4 mr-2" /> Poszukaj więcej miejsc w: {city}</>}
            </Button>
          </div>
        )}
      </main>
    </div>
  );
}
