import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Clock, ExternalLink, Heart, Loader2, MapPin, Plus, Star } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';

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
  wiki_extract: string | null;
  photos: string[];
  opening_hours: string | null;
  website: string | null;
  visit_minutes: number | null;
  vibe_tags: string[];
  pin_count: number;
}

/**
 * Strona miejsca. Do tej pory miejsce istniało wyłącznie jako wiersz na czyjejś
 * tablicy — nie było czego otworzyć, na co podać komuś odnośnik ani do czego
 * wracać. To fundament dla feedu, kolekcji i podobnych miejsc: wszystko inne
 * tutaj prowadzi.
 */
export default function PlacePage() {
  const { slug } = useParams<{ slug: string }>();
  const navigate = useNavigate();

  const [place, setPlace] = useState<CatalogPlace | null>(null);
  const [loading, setLoading] = useState(true);
  const [photoIdx, setPhotoIdx] = useState(0);
  const [broken, setBroken] = useState<Set<string>>(new Set());
  const [favorite, setFavorite] = useState(false);
  const [boards, setBoards] = useState<{ id: string; name: string }[]>([]);
  const [myBoards, setMyBoards] = useState<{ id: string; name: string }[]>([]);
  const [similar, setSimilar] = useState<CatalogPlace[]>([]);

  useEffect(() => {
    if (!slug) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      const { data } = await (supabase as any)
        .from('place_catalog').select('*').eq('slug', slug).maybeSingle();
      if (cancelled) return;
      setPlace(data ?? null);
      setLoading(false);
      if (!data) return;

      const { data: userData } = await supabase.auth.getUser();
      if (!userData.user) return;

      const [{ data: fav }, { data: pinned }, { data: mine }] = await Promise.all([
        (supabase as any).from('place_favorites').select('place_id')
          .eq('user_id', userData.user.id).eq('place_id', data.id).maybeSingle(),
        (supabase as any).from('trip_project_places').select('project_id, trip_projects(id, name)')
          .eq('catalog_id', data.id),
        (supabase as any).from('trip_projects').select('id, name').order('updated_at', { ascending: false })
      ]);
      if (cancelled) return;
      setFavorite(!!fav);
      setBoards(((pinned ?? []) as any[]).map((r) => r.trip_projects).filter(Boolean));
      setMyBoards(mine ?? []);

      // Podobne w klimacie: część wspólna znaczników nastroju, a przy ich braku
      // to samo miasto. Sortowanie po liczbie przypięć, bo to jedyny sygnał
      // popularności, jaki mamy bez ocen i recenzji.
      const query = (supabase as any).from('place_catalog').select('*').neq('id', data.id).limit(40);
      const { data: sim } = data.vibe_tags?.length
        ? await query.overlaps('vibe_tags', data.vibe_tags)
        : await query.ilike('city', data.city ?? '');

      // Kolejność ma znaczenie: "podobne" to nie "cokolwiek z jednym wspólnym
      // znacznikiem". Sortujemy po liczbie wspólnych określeń, potem po tym samym
      // mieście, a dopiero na końcu po popularności — inaczej pierwsze miejsce na
      // liście byłoby przypadkowe.
      const myTags = new Set<string>(data.vibe_tags ?? []);
      const ranked = (sim ?? [])
        .map((sp: CatalogPlace) => ({
          sp,
          shared: (sp.vibe_tags ?? []).filter((t) => myTags.has(t)).length,
          sameCity: sp.city && data.city && sp.city.toLowerCase() === data.city.toLowerCase() ? 1 : 0
        }))
        .sort((a, b) => (b.shared - a.shared) || (b.sameCity - a.sameCity) || (b.sp.pin_count - a.sp.pin_count))
        .map((r) => r.sp);
      if (!cancelled) setSimilar(ranked.slice(0, 8));
    })();
    return () => { cancelled = true; };
  }, [slug]);

  const photos = useMemo(
    () => (place?.photos ?? []).filter((u) => !broken.has(u)),
    [place, broken]
  );

  const toggleFavorite = async () => {
    if (!place) return;
    const { data: userData } = await supabase.auth.getUser();
    if (!userData.user) return navigate('/auth');
    if (favorite) {
      await (supabase as any).from('place_favorites').delete()
        .eq('user_id', userData.user.id).eq('place_id', place.id);
      setFavorite(false);
    } else {
      await (supabase as any).from('place_favorites')
        .insert({ user_id: userData.user.id, place_id: place.id });
      setFavorite(true);
      toast.success('Dodano do ulubionych');
    }
  };

  const addToBoard = async (projectId: string) => {
    if (!place) return;
    const { error } = await (supabase as any).from('trip_project_places').insert({
      project_id: projectId,
      catalog_id: place.id,
      name: place.name,
      category: place.category,
      priority: 'nice',
      lat: place.lat,
      lng: place.lng,
      description: place.description,
      opening_hours: place.opening_hours,
      visit_minutes: place.visit_minutes,
      website: place.website,
      image_url: place.photos?.[0] ?? null,
      source: 'catalog'
    });
    if (error) return toast.error(error.message);
    toast.success('Dodano do tablicy');
    setBoards((prev) => [...prev, myBoards.find((b) => b.id === projectId)!].filter(Boolean));
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center text-muted-foreground">
        <Loader2 className="w-5 h-5 animate-spin mr-2" /> Wczytuję miejsce…
      </div>
    );
  }

  if (!place) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4">
        <p className="text-muted-foreground">Nie znaleziono takiego miejsca.</p>
        <Button onClick={() => navigate('/plany')}>Wróć do tablic</Button>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b sticky top-0 bg-background/95 backdrop-blur z-10">
        <div className="max-w-4xl mx-auto px-4 h-14 flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
            <ArrowLeft className="w-4 h-4" />
          </Button>
          <span className="font-medium truncate">{place.name}</span>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 py-6 space-y-6">
        {photos.length > 0 && (
          <div className="relative rounded-2xl overflow-hidden bg-muted">
            <img
              src={photos[Math.min(photoIdx, photos.length - 1)]}
              alt={place.name}
              className="w-full h-[280px] sm:h-[380px] object-cover"
              onError={(e) => setBroken((prev) => new Set(prev).add((e.target as HTMLImageElement).src))}
            />
            {photos.length > 1 && (
              <div className="absolute bottom-3 left-0 right-0 flex justify-center gap-1.5">
                {photos.map((_, i) => (
                  <button
                    key={i}
                    onClick={() => setPhotoIdx(i)}
                    aria-label={`Zdjęcie ${i + 1}`}
                    className={`w-2 h-2 rounded-full transition-colors ${
                      i === Math.min(photoIdx, photos.length - 1) ? 'bg-white' : 'bg-white/50'
                    }`}
                  />
                ))}
              </div>
            )}
          </div>
        )}

        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="min-w-0">
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">{place.name}</h1>
            <div className="flex items-center gap-3 text-sm text-muted-foreground mt-2 flex-wrap">
              {place.city && (
                <span className="flex items-center gap-1.5">
                  <MapPin className="w-4 h-4" />{place.city}{place.country ? `, ${place.country}` : ''}
                </span>
              )}
              {place.visit_minutes && (
                <span className="flex items-center gap-1.5"><Clock className="w-4 h-4" />ok. {place.visit_minutes} min</span>
              )}
              {place.pin_count > 0 && (
                <span className="flex items-center gap-1.5"><Star className="w-4 h-4" />{place.pin_count} przypięć</span>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Button variant={favorite ? 'default' : 'outline'} size="sm" onClick={toggleFavorite}
              className={favorite ? 'bg-rose-600 hover:bg-rose-500' : ''}>
              <Heart className={`w-4 h-4 mr-1.5 ${favorite ? 'fill-current' : ''}`} />
              {favorite ? 'W ulubionych' : 'Do ulubionych'}
            </Button>
          </div>
        </div>

        {place.vibe_tags?.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {place.vibe_tags.map((t) => (
              <span key={t} className="text-xs bg-muted rounded-full px-2.5 py-1 text-muted-foreground">{t}</span>
            ))}
          </div>
        )}

        {(place.description || place.wiki_extract) && (
          <p className="leading-relaxed text-[15px]">{place.description || place.wiki_extract}</p>
        )}

        <div className="flex flex-wrap gap-x-6 gap-y-2 text-sm text-muted-foreground border-t pt-4">
          {place.opening_hours && <span>Godziny: <strong className="text-foreground">{place.opening_hours}</strong></span>}
          {place.website && (
            <a href={place.website} target="_blank" rel="noreferrer" className="text-emerald-700 hover:underline flex items-center gap-1">
              Strona miejsca <ExternalLink className="w-3.5 h-3.5" />
            </a>
          )}
          <a
            href={`https://www.openstreetmap.org/?mlat=${place.lat}&mlon=${place.lng}#map=17/${place.lat}/${place.lng}`}
            target="_blank" rel="noreferrer"
            className="text-emerald-700 hover:underline flex items-center gap-1"
          >
            Pokaż na mapie <ExternalLink className="w-3.5 h-3.5" />
          </a>
        </div>

        <Card className="p-4 space-y-3">
          <h2 className="font-semibold text-sm">Dodaj do wyjazdu</h2>
          {boards.length > 0 && (
            <p className="text-xs text-muted-foreground">
              Już na tablicach: {boards.map((b) => b.name).join(', ')}
            </p>
          )}
          {myBoards.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Nie masz jeszcze żadnej tablicy.{' '}
              <button onClick={() => navigate('/plany')} className="text-emerald-700 hover:underline">Załóż pierwszą</button>.
            </p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {myBoards.map((b) => (
                <Button key={b.id} variant="outline" size="sm" onClick={() => addToBoard(b.id)}>
                  <Plus className="w-3.5 h-3.5 mr-1.5" />{b.name}
                </Button>
              ))}
            </div>
          )}
        </Card>

        {similar.length > 0 && (
          <section className="space-y-3">
            <h2 className="font-semibold">Podobne w klimacie</h2>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {similar.map((sp) => (
                <button
                  key={sp.id}
                  onClick={() => navigate(`/miejsce/${sp.slug}`)}
                  className="text-left rounded-xl overflow-hidden border hover:shadow-md transition-shadow bg-card"
                >
                  <div className="h-28 bg-muted">
                    {sp.photos?.[0] && (
                      <img src={sp.photos[0]} alt={sp.name} className="w-full h-full object-cover" loading="lazy" />
                    )}
                  </div>
                  <div className="p-2.5">
                    <div className="text-sm font-medium leading-snug line-clamp-2">{sp.name}</div>
                    {sp.city && <div className="text-xs text-muted-foreground mt-0.5">{sp.city}</div>}
                  </div>
                </button>
              ))}
            </div>
          </section>
        )}
      </main>
    </div>
  );
}
