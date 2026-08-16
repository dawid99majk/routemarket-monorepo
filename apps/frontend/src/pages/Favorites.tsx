import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Heart, Loader2, MapPin } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import PlannerHeader from '@/components/PlannerHeader';

/**
 * Ulubione: zbiór miejsca poza jakimkolwiek wyjazdem. Ktoś zapisuje kawiarnię w
 * Lizbonie na długo przed tym, zanim wie, czy w ogóle tam pojedzie — tablica
 * wyjazdu jest na to za ciasna, bo wymaga zdecydowania się na cel.
 */
export default function Favorites() {
  const navigate = useNavigate();
  const [places, setPlaces] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [boards, setBoards] = useState<{ id: string; name: string }[]>([]);

  const load = async () => {
    setLoading(true);
    const { data: userData } = await supabase.auth.getUser();
    if (!userData.user) { navigate('/auth'); return; }
    const [{ data }, { data: projs }] = await Promise.all([
      supabase.from('place_favorites')
        .select('created_at, place_catalog(*)')
        .eq('user_id', userData.user.id)
        .order('created_at', { ascending: false }),
      supabase.from('trip_projects').select('id, name').order('updated_at', { ascending: false })
    ]);
    setPlaces((data ?? []).map((r: any) => r.place_catalog).filter(Boolean));
    setBoards(projs ?? []);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const remove = async (placeId: string) => {
    const { data: userData } = await supabase.auth.getUser();
    if (!userData.user) return;
    await supabase.from('place_favorites').delete()
      .eq('user_id', userData.user.id).eq('place_id', placeId);
    setPlaces((prev) => prev.filter((p) => p.id !== placeId));
  };

  const addToBoard = async (place: any, projectId: string) => {
    const { error } = await supabase.from('trip_project_places').insert({
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
    toast.success('Dodano do tablicy');
  };

  return (
    <div className="min-h-screen bg-background">
      <PlannerHeader />

      <main className="max-w-6xl mx-auto px-4 py-6">
        {loading ? (
          <p className="text-muted-foreground flex items-center gap-2 py-10">
            <Loader2 className="w-4 h-4 animate-spin" /> Wczytuję…
          </p>
        ) : places.length === 0 ? (
          <div className="text-center py-16 space-y-4">
            <Heart className="w-9 h-9 text-muted-foreground/40 mx-auto" />
            <p className="text-muted-foreground max-w-md mx-auto">
              Nic tu jeszcze nie ma. Ulubione to miejsca odłożone na później — bez decydowania,
              kiedy i czy w ogóle tam pojedziesz.
            </p>
            <Button onClick={() => navigate('/odkrywaj')} className="bg-primary hover:bg-primary/90">
              Zacznij odkrywać
            </Button>
          </div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {places.map((p) => (
              <div key={p.id} className="rounded-md overflow-hidden border bg-card hover:shadow-token-lg transition-shadow flex flex-col">
                <button onClick={() => navigate(`/miejsce/${p.slug}`)} className="text-left">
                  <div className="h-40 bg-muted relative">
                    {p.photos?.[0] ? (
                      <img src={p.photos[0]} alt={p.name} loading="lazy" className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-muted-foreground/40">
                        <MapPin className="w-7 h-7" />
                      </div>
                    )}
                    <button
                      onClick={(e) => { e.stopPropagation(); remove(p.id); }}
                      aria-label="Usuń z ulubionych"
                      className="absolute top-2 right-2 w-8 h-8 rounded-full bg-black/40 hover:bg-black/60 backdrop-blur flex items-center justify-center"
                    >
                      <Heart className="w-4 h-4 fill-accent text-accent" />
                    </button>
                  </div>
                  <div className="p-3">
                    <div className="font-medium text-sm leading-snug line-clamp-2">{p.name}</div>
                    {p.city && <div className="text-xs text-muted-foreground mt-0.5">{p.city}</div>}
                  </div>
                </button>
                {boards.length > 0 && (
                  <div className="px-3 pb-3 mt-auto">
                    <select
                      onChange={(e) => { if (e.target.value) { addToBoard(p, e.target.value); e.target.value = ''; } }}
                      defaultValue=""
                      className="w-full text-[11px] border rounded-md px-2 py-1.5 bg-background hover:bg-muted cursor-pointer"
                      aria-label="Dodaj do tablicy"
                    >
                      <option value="">+ dodaj do tablicy</option>
                      {boards.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
                    </select>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
