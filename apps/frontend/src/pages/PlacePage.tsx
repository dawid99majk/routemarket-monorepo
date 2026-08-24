import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, ExternalLink, Heart, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { apiPost } from '@/lib/api';
import { Button } from '@/components/ui/button';
import PlannerHeader from '@/components/PlannerHeader';
import { opisMiejsca } from '@/lib/opis';
import { useTranslation } from 'react-i18next';
import { jakoZdjecia } from '@/lib/zBazy';

interface CatalogPlace {
  id: string; slug: string; name: string; city: string | null; country: string | null;
  lat: number; lng: number; category: string; kind: string | null;
  description: string; wiki_extract: string | null; photos: string[];
  opening_hours: string | null; website: string | null; visit_minutes: number | null;
  vibe_tags: string[]; pin_count: number;
}
type Bucket = 'must' | 'nice' | 'rejected';

function formatDuration(min: number | null): string {
  if (!min) return '—';
  const h = Math.floor(min / 60), m = min % 60;
  if (h && m) return `${h} g ${m} min`;
  if (h) return `${h} g`;
  return `${m} min`;
}

const kmBetween = (a: {lat:number;lng:number}, b: {lat:number;lng:number}) => {
  const dLat = (a.lat - b.lat) * 111;
  const dLng = (a.lng - b.lng) * 111 * Math.cos((a.lat * Math.PI) / 180);
  return Math.sqrt(dLat * dLat + dLng * dLng);
};

/**
 * Strona miejsca w układzie z dokumentu przekazania: siatka 1fr 380px, kolumna boczna
 * przyklejona, pasek trzech danych ograniczony liniami. Sekcji z opiniami nie ma —
 * projekt ją przewiduje, ale nie mamy żadnych prawdziwych opinii, a wymyślone byłyby
 * po prostu fałszywe.
 */
export default function PlacePage() {
  const { t } = useTranslation();
  const { slug } = useParams<{ slug: string }>();
  const navigate = useNavigate();

  const [place, setPlace] = useState<CatalogPlace | null>(null);
  const [loading, setLoading] = useState(true);
  const [photoIdx, setPhotoIdx] = useState(0);
  const [broken, setBroken] = useState<Set<string>>(new Set());
  const [favorite, setFavorite] = useState(false);
  const [boards, setBoards] = useState<{ id: string; name: string; destination: string }[]>([]);
  const [activeBoard, setActiveBoard] = useState<string | null>(null);
  const [mark, setMark] = useState<Bucket | null>(null);
  const [nearby, setNearby] = useState<CatalogPlace[]>([]);
  const [similar, setSimilar] = useState<CatalogPlace[]>([]);
  const [kolekcje, setKolekcje] = useState<{ id: string; name: string }[]>([]);
  /** Widoczny tylko przez chwilę po zapisaniu — propozycja, nie warunek. */
  const [poZapisie, setPoZapisie] = useState(false);
  const [agentTip, setAgentTip] = useState<string | null>(null);
  const [tipLoading, setTipLoading] = useState(false);

  const load = useCallback(async () => {
    if (!slug) return;
    setLoading(true);
    const { data } = await supabase.from('place_catalog').select('*').eq('slug', slug).maybeSingle();
    setPlace(data ? ({ ...data, photos: jakoZdjecia(data.photos) } as CatalogPlace) : null);
    setLoading(false);
    setPhotoIdx(0);
    setAgentTip(null);
    if (!data) return;

    const { data: userData } = await supabase.auth.getUser();
    if (!userData.user) return;

    // Pula do „w okolicy" i „podobnych" schodziła z bazy jako 2000 pełnych
    // wierszy z wiki_extract — megabajty na wejście na każdą stronę miejsca.
    // Warunki geograficzne i tagowe umie policzyć baza: to samo miasto, ramka
    // ~2 km wokół punktu i przecięcie vibe_tags. Trzy wąskie zapytania zamiast
    // jednej hurtowni, a logika niżej pracuje na tej samej strukturze co dotąd.
    const POOL_COLS = 'id, slug, name, city, country, lat, lng, category, kind, description, description_i18n, photos, visit_minutes, vibe_tags, pin_count';
    const poolQueries = [
      data.city
        ? supabase.from('place_catalog').select(POOL_COLS).neq('id', data.id).eq('city', data.city).limit(300)
        : null,
      data.lat != null
        ? supabase.from('place_catalog').select(POOL_COLS).neq('id', data.id)
            .gte('lat', data.lat - 0.02).lte('lat', data.lat + 0.02)
            .gte('lng', data.lng - 0.03).lte('lng', data.lng + 0.03).limit(200)
        : null,
      (data.vibe_tags ?? []).length > 0
        ? supabase.from('place_catalog').select(POOL_COLS).neq('id', data.id)
            .overlaps('vibe_tags', data.vibe_tags as string[])
            .order('pin_count', { ascending: false }).limit(200)
        : null,
    ];
    const [{ data: fav }, { data: projs }, ...poolParts] = await Promise.all([
      supabase.from('place_favorites').select('place_id')
        .eq('user_id', userData.user.id).eq('place_id', data.id).maybeSingle(),
      supabase.from('trip_projects').select('id, name, destination').order('updated_at', { ascending: false }),
      ...poolQueries.filter((q): q is NonNullable<typeof q> => q !== null),
    ]);
    const seen = new Set<string>();
    const all = poolParts
      .flatMap((part) => (part.data ?? []) as unknown as CatalogPlace[])
      .filter((x) => (seen.has(x.id) ? false : (seen.add(x.id), true)));
    setFavorite(!!fav);
    setBoards(projs ?? []);
    const boardId = (projs ?? [])[0]?.id ?? null;
    setActiveBoard(boardId);

    if (boardId) {
      const { data: pinned } = await supabase.from('trip_project_places')
        .select('priority').eq('project_id', boardId).eq('catalog_id', data.id).maybeSingle();
      setMark((pinned?.priority as Bucket) ?? null);
    }

    // „W okolicy" liczone z prawdziwych współrzędnych, nie zgadywane
    const pool = all;
    setNearby(
      pool.filter((x) => x.lat != null)
        .map((x) => ({ x, km: kmBetween(data, x) }))
        .filter((r) => r.km < 2)
        .sort((a, b) => a.km - b.km)
        .slice(0, 3)
        .map((r) => r.x)
    );
    // Podobne dobierane były wyłącznie po tagach klimatu, bez żadnego warunku
    // geograficznego. Przy atrakcji w Lipsku wychodziły więc miejsca z Rygi,
    // Tallina i Wrocławia — trafne co do klimatu, bezużyteczne przy planowaniu.
    // Teraz to samo miasto idzie pierwsze, a resztę dobieramy tylko wtedy, gdy
    // w mieście brakuje propozycji.
    const myTags = new Set<string>(data.vibe_tags ?? []);
    const wgKlimatu = pool
      .map((x) => ({ x, shared: (x.vibe_tags ?? []).filter((t) => myTags.has(t)).length }))
      .filter((r) => r.shared > 0)
      .sort((a, b) => b.shared - a.shared || b.x.pin_count - a.x.pin_count);
    const wMiescie = wgKlimatu.filter((r) => r.x.city && r.x.city === data.city);
    const gdzieIndziej = wgKlimatu.filter((r) => !r.x.city || r.x.city !== data.city);
    setSimilar([...wMiescie, ...gdzieIndziej].slice(0, 8).map((r) => r.x));
  }, [slug]);

  useEffect(() => { load(); }, [load]);

  /** Wskazówka agenta dociągana raz, na żądanie — nie przy każdym otwarciu strony. */
  const fetchTip = async () => {
    if (!place || agentTip || tipLoading) return;
    setTipLoading(true);
    try {
      const data = await apiPost<any>('/points-details', {
        points: [{ name: place.name, lat: place.lat, lng: place.lng }],
      }, { timeoutMs: 60_000 });
      setAgentTip(data.details?.[place.name]?.recommendation || 'Brak dodatkowej wskazówki dla tego miejsca.');
    } catch {
      setAgentTip('Nie udało się pobrać wskazówki.');
    } finally {
      setTipLoading(false);
    }
  };

  const photos = useMemo(() => (place?.photos ?? []).filter((u) => !broken.has(u)), [place, broken]);

  const setBucket = async (bucket: Bucket) => {
    if (!place) return;
    if (!activeBoard) return toast.error(t('miejsce.najpierw_za_oz_wyjazd_do'));
    if (mark === bucket) {
      setMark(null);
      await supabase.from('trip_project_places')
        .delete().eq('project_id', activeBoard).eq('catalog_id', place.id);
      return;
    }
    const had = mark;
    setMark(bucket);
    if (had) {
      await supabase.from('trip_project_places')
        .update({ priority: bucket }).eq('project_id', activeBoard).eq('catalog_id', place.id);
      return;
    }
    const { error } = await supabase.from('trip_project_places').insert({
      project_id: activeBoard, catalog_id: place.id, name: place.name, category: place.category,
      priority: bucket, lat: place.lat, lng: place.lng, description: place.description,
      opening_hours: place.opening_hours, visit_minutes: place.visit_minutes,
      image_url: place.photos?.[0] ?? null, source: 'catalog',
    });
    if (error) { setMark(had); toast.error(error.message); }
  };

  const toggleFavorite = async () => {
    if (!place) return;
    const { data: userData } = await supabase.auth.getUser();
    if (!userData.user) return navigate('/auth');
    if (favorite) {
      await supabase.from('place_favorites').delete()
        .eq('user_id', userData.user.id).eq('place_id', place.id);
      setFavorite(false);
    } else {
      await supabase.from('place_favorites').insert({ user_id: userData.user.id, place_id: place.id });
      setFavorite(true);
      const { data: kol } = await supabase.from('collections')
        .select('id, name').eq('user_id', userData.user.id).order('created_at', { ascending: false });
      setKolekcje(kol ?? []);
      setPoZapisie(true);
      window.setTimeout(() => setPoZapisie(false), 8000);
    }
  };

  if (loading) return (
    <div className="min-h-screen bg-background">
      <PlannerHeader />
      <div className="flex items-center justify-center py-32 text-muted-foreground">
        <Loader2 className="w-5 h-5 animate-spin mr-2" /> Wczytuję miejsce…
      </div>
    </div>
  );
  if (!place) return (
    <div className="min-h-screen bg-background">
      <PlannerHeader />
      <div className="flex flex-col items-center justify-center py-32 gap-4">
        <p className="text-muted-foreground">{t('miejsce.nie_znaleziono_takiego_miejsca')}</p>
        <Button onClick={() => navigate('/odkrywaj')}>{t('miejsce.wroc_do_odkrywania')}</Button>
      </div>
    </div>
  );

  const board = boards.find((b) => b.id === activeBoard) ?? null;
  const buckets: [Bucket, string, string][] = [
    ['must', 'Na pewno', 'bg-primary text-primary-foreground border-primary'],
    ['nice', 'Być może', 'bg-dusty-blue text-dusty-blue-foreground border-dusty-blue'],
    ['rejected', 'Nie tym razem', 'bg-clay text-clay-foreground border-clay'],
  ];

  return (
    <div className="min-h-screen bg-background">
      {/* Strona miejsca nie miała paska w ogóle: jedynym wyjściem był przycisk
          "wróć do odkrywania", więc z karty miejsca nie dało się przejść na
          tablicę ani do planu bez cofania się. */}
      <PlannerHeader
        context={board ? `${board.name} · ${board.destination}` : null}
      />
      <main className="max-w-[1160px] mx-auto px-6 pt-8 pb-24">
        <button onClick={() => navigate('/odkrywaj')}
          className="text-sm text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1.5">
          <ArrowLeft className="w-3.5 h-3.5" /> Wróć do odkrywania
        </button>

        <div className="mt-6 grid lg:grid-cols-[1fr_380px] gap-10 items-start">
          {/* Kolumna główna */}
          <div>
            {photos.length > 0 && (
              <>
                <div className="rounded-md overflow-hidden bg-muted h-[380px]">
                  <img src={photos[Math.min(photoIdx, photos.length - 1)]} alt={place.name}
                    className="w-full h-full object-cover"
                    onError={(e) => setBroken((p) => new Set(p).add((e.target as HTMLImageElement).src))} />
                </div>
                {photos.length > 1 && (
                  <div className="grid grid-cols-3 gap-3 mt-3">
                    {photos.slice(0, 3).map((u, i) => (
                      <button key={u} onClick={() => setPhotoIdx(i)}
                        className={`h-24 rounded-md overflow-hidden bg-muted border transition-colors ${
                          i === Math.min(photoIdx, photos.length - 1) ? 'border-foreground/40' : 'border-border'
                        }`}>
                        <img src={u} alt="" className="w-full h-full object-cover" loading="lazy" />
                      </button>
                    ))}
                  </div>
                )}
              </>
            )}

            <p className="font-narrow uppercase tracking-[0.32em] text-[11px] text-muted-foreground mt-8">
              {[place.kind || place.category,
                [place.city, place.country].filter(Boolean).join(' / ')].filter(Boolean).join(' · ')}
            </p>
            <h1 className="font-display font-light text-[42px] leading-[1.05] tracking-[-0.02em] mt-3">
              {place.name}
            </h1>

            {(place.description || place.wiki_extract) && (
              <p className="text-[17px] leading-[1.6] mt-5 max-w-[60ch] text-foreground/85 text-pretty">
                {opisMiejsca(place)}
              </p>
            )}

            {/* Pasek trzech danych, ograniczony liniami góra i dół */}
            <div className="mt-10 border-y border-border grid grid-cols-3">
              {[
                ['Czas zwiedzania', formatDuration(place.visit_minutes)],
                ['Godziny otwarcia', place.opening_hours || '—'],
                ['Współrzędne', `${place.lat.toFixed(4)}, ${place.lng.toFixed(4)}`],
              ].map(([label, value], i) => (
                <div key={label} className={`py-5 px-4 ${i > 0 ? 'border-l border-border' : ''}`}>
                  <div className="font-narrow uppercase tracking-[0.18em] text-[10px] text-muted-foreground">{label}</div>
                  <div className="font-mono text-[19px] tabular-nums mt-1.5 truncate" title={String(value)}>{value}</div>
                </div>
              ))}
            </div>

            {place.vibe_tags?.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mt-6">
                {place.vibe_tags.map((t) => (
                  <span key={t} className="text-xs bg-muted rounded-full px-2.5 py-1 text-muted-foreground">{t}</span>
                ))}
              </div>
            )}

            {similar.length > 0 && (
              <section className="mt-12">
                <div className="flex items-baseline justify-between gap-3 flex-wrap">
                  <h2 className="font-display text-[22px]">{t('miejsce.podobne_w_klimacie')}</h2>
                  {place.city && (
                    <span className="font-narrow uppercase tracking-[0.18em] text-[10px] text-muted-foreground">
                      {similar.some((sp) => sp.city !== place.city)
                        ? `najpierw ${place.city}, dalej inne miasta`
                        : place.city}
                    </span>
                  )}
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-4">
                  {similar.map((sp) => (
                    <button key={sp.id} onClick={() => navigate(`/miejsce/${sp.slug}`)}
                      className="text-left rounded-md overflow-hidden border border-border bg-card hover:shadow-token-md transition-shadow">
                      <div className="h-24 bg-muted">
                        {sp.photos?.[0] && <img src={sp.photos[0]} alt={sp.name} loading="lazy" className="w-full h-full object-cover" />}
                      </div>
                      <div className="p-2.5">
                        <div className="text-[13px] font-medium leading-snug line-clamp-2">{sp.name}</div>
                        {/* Bez tego karta mówiła samą nazwą. „Hala Targowa" przy atrakcji
                            w Lipsku nie zdradzała, że stoi we Wrocławiu — a to jedyna
                            informacja, która decyduje, czy propozycja ma sens. */}
                        {(sp.city || sp.country) && (
                          <div className={`font-mono text-[11px] mt-0.5 truncate ${
                            sp.city && sp.city === place.city ? 'text-muted-foreground' : 'text-clay'
                          }`}>
                            {[sp.city, sp.country].filter(Boolean).join(' / ')}
                          </div>
                        )}
                      </div>
                    </button>
                  ))}
                </div>
              </section>
            )}
          </div>

          {/* Kolumna boczna, przyklejona */}
          <aside className="lg:sticky lg:top-[88px] space-y-5">
            <div className="rounded-md border border-border bg-card p-4">
              <h2 className="font-narrow uppercase tracking-[0.18em] text-[10px] text-muted-foreground">
                Do tablicy{board ? ` · ${board.destination}` : ''}
              </h2>
              <div className="mt-3 space-y-2">
                {buckets.map(([b, label, active]) => (
                  <button key={b} onClick={() => setBucket(b)}
                    className={`w-full rounded-sm border py-2 text-sm transition-colors ${
                      mark === b ? active : 'border-border hover:bg-muted text-foreground/80'
                    }`}>
                    {label}
                  </button>
                ))}
              </div>
              <button onClick={toggleFavorite}
                className="mt-3 w-full flex items-center justify-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors">
                <Heart className={`w-3.5 h-3.5 ${favorite ? 'fill-accent text-accent' : ''}`} />
                {favorite ? 'Zapisane' : 'Zapisz na później'}
              </button>

              {poZapisie && (
                <div className="mt-2 rounded-md border border-border bg-muted/50 px-3 py-2
                                animate-in fade-in slide-in-from-top-1 duration-200">
                  {kolekcje.length > 0 ? (
                    <select value=""
                      onChange={async (e) => {
                        if (!e.target.value || !place) return;
                        const { error } = await supabase.from('collection_places')
                          .insert({ collection_id: e.target.value, place_id: place.id });
                        e.target.value = '';
                        if (error) return toast.error(error.message);
                        toast.success(t('miejsce.od_ozone_do_kolekcji'));
                        setPoZapisie(false);
                      }}
                      aria-label={t('miejsce.od_oz_do_kolekcji')}
                      className="w-full text-[12px] bg-transparent outline-none cursor-pointer">
                      <option value="">{t('miejsce.zapisane_od_oz_do_kolekcji')}</option>
                      {kolekcje.map((k) => <option key={k.id} value={k.id}>{k.name}</option>)}
                    </select>
                  ) : (
                    <button onClick={() => navigate('/zapisane')}
                      className="text-[12px] text-muted-foreground hover:text-primary transition-colors">
                      Zapisane · załóż pierwszą kolekcję ↗
                    </button>
                  )}
                </div>
              )}
            </div>

            <div className="rounded-md bg-muted border border-border p-4">
              <h2 className="font-narrow uppercase tracking-[0.18em] text-[10px] text-muted-foreground">{t('miejsce.agent_radzi')}</h2>
              {agentTip ? (
                <p className="text-sm leading-relaxed mt-2.5 text-foreground/85">{agentTip}</p>
              ) : (
                <button onClick={fetchTip} disabled={tipLoading}
                  className="mt-2.5 text-sm text-primary hover:underline disabled:opacity-60 flex items-center gap-1.5">
                  {tipLoading ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Sprawdzam…</> : 'Zapytaj o wskazówkę'}
                </button>
              )}
              <p className="font-mono text-[11px] text-muted-foreground tabular-nums mt-3">
                {place.lat.toFixed(5)}° N, {place.lng.toFixed(5)}° E
              </p>
              {place.website && (
                <a href={place.website} target="_blank" rel="noreferrer"
                  className="text-xs text-primary hover:underline flex items-center gap-1 mt-2">
                  Strona miejsca <ExternalLink className="w-3 h-3" />
                </a>
              )}
            </div>

            {nearby.length > 0 && (
              <div className="rounded-md border border-border bg-card p-4">
                <h2 className="font-narrow uppercase tracking-[0.18em] text-[10px] text-muted-foreground">
                  W okolicy · do 2 km
                </h2>
                <div className="mt-3 space-y-3">
                  {nearby.map((n) => (
                    <button key={n.id} onClick={() => navigate(`/miejsce/${n.slug}`)}
                      className="w-full flex items-center gap-3 text-left group">
                      <div className="w-11 h-11 rounded-sm overflow-hidden bg-muted shrink-0">
                        {n.photos?.[0] && <img src={n.photos[0]} alt="" className="w-full h-full object-cover" loading="lazy" />}
                      </div>
                      <div className="min-w-0">
                        <div className="text-[13px] font-medium truncate group-hover:text-primary transition-colors">{n.name}</div>
                        <div className="font-mono text-[11px] text-muted-foreground tabular-nums">
                          {formatDuration(n.visit_minutes)} · {kmBetween(place, n).toFixed(1)} km
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </aside>
        </div>
      </main>
    </div>
  );
}
