import { useCallback, useEffect, useMemo, useState } from 'react';
import Zdjecie from '@/components/Zdjecie';
import GaleriaZdjec from '@/components/GaleriaZdjec';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, ChevronDown, ExternalLink, Heart, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { apiPost } from '@/lib/api';
import { Button } from '@/components/ui/button';
import PlannerHeader from '@/components/PlannerHeader';
import { opisMiejsca, wyroznikMiejsca } from '@/lib/opis';
import i18n from '@/i18n';
import { useTranslation } from 'react-i18next';
import { jakoZdjecia } from '@/lib/zBazy';
import { miniatura, SZEROKOSC } from '@/lib/zdjecia';
import AgentDymek from '@/components/AgentDymek';
import PrzelacznikDecyzji from '@/components/PrzelacznikDecyzji';
import FormularzNowejTablicy, { type UstawieniaNowejTablicy } from '@/components/FormularzNowejTablicy';
import type { AxisValues } from '@/lib/tripPresets';
import { etykietaRodzaju } from '@/lib/rodzaj';
import SEO from '@/components/SEO';

interface CatalogPlace {
  id: string; slug: string; name: string; city: string | null; country: string | null;
  lat: number; lng: number; category: string; kind: string | null;
  description: string; wiki_extract: string | null; photos: string[];
  opening_hours: string | null; website: string | null; visit_minutes: number | null;
  vibe_tags: string[]; pin_count: number;
}
type Bucket = 'must' | 'nice' | 'rejected';
type Tablica = { id: string; name: string; destination: string };

const OPIS_DECYZJI: Record<Bucket, string> = { must: 'na pewno', nice: 'być może', rejected: 'odrzucone' };

/** „Kraków”, „krakow ” i „Kraków, Polska” to ten sam cel wyjazdu. */
const klucz = (s: string | null | undefined) =>
  (s ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
const tenSamCel = (cel: string | null | undefined, miasto: string | null | undefined) => {
  const m = klucz(miasto);
  return !!m && klucz(cel).split(/[,·(/]/).some((czesc) => czesc.trim() === m);
};

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
  const [boards, setBoards] = useState<Tablica[]>([]);
  const [activeBoard, setActiveBoard] = useState<string | null>(null);
  /** Decyzja o tym miejscu na każdej tablicy — zmiana tablicy nie potrzebuje zapytania. */
  const [pinezki, setPinezki] = useState<Record<string, Bucket>>({});
  const mark = activeBoard ? pinezki[activeBoard] ?? null : null;
  const [zalogowany, setZalogowany] = useState(false);
  const [preferencjeKonta, setPreferencjeKonta] = useState<Partial<AxisValues> | null>(null);
  /** Decyzja czekająca na założenie tablicy — nie ma jeszcze wyjazdu do tego miasta. */
  const [nowaTablica, setNowaTablica] = useState<{ wykonaj: (id: string) => void } | null>(null);
  const [tworzeTablice, setTworzeTablice] = useState(false);
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

    // Pula do „w okolicy" i „podobnych" schodziła z bazy jako 2000 pełnych
    // wierszy z wiki_extract — megabajty na wejście na każdą stronę miejsca.
    // Warunki geograficzne i tagowe umie policzyć baza: to samo miasto, ramka
    // ~2 km wokół punktu i przecięcie vibe_tags. Trzy wąskie zapytania zamiast
    // jednej hurtowni, a logika niżej pracuje na tej samej strukturze co dotąd.
    // Zostaje JEDNO zapytanie: ramka ~2 km wokół punktu, z której liczy się
    // „W okolicy". Dobór podobnych zszedł do bazy (niżej), więc zapytanie po
    // mieście i po przecięciu tagów — razem 500 wierszy na każde wejście na
    // stronę — nie mają już po co przychodzić.
    const POOL_COLS = 'id, slug, name, city, country, lat, lng, category, kind, description, description_i18n, photos, visit_minutes, vibe_tags, pin_count';
    const wOkolicy = data.lat != null
      ? await supabase.from('place_catalog').select(POOL_COLS).neq('id', data.id)
          .gte('lat', data.lat - 0.02).lte('lat', data.lat + 0.02)
          .gte('lng', data.lng - 0.03).lte('lng', data.lng + 0.03).limit(200)
      : null;
    const pool = ((wOkolicy?.data ?? []) as unknown as CatalogPlace[]);
    setNearby(
      pool.filter((x) => x.lat != null)
        .map((x) => ({ x, km: kmBetween(data, x) }))
        .filter((r) => r.km < 2)
        .sort((a, b) => a.km - b.km)
        .slice(0, 3)
        .map((r) => r.x)
    );
    /* Podobne liczy baza — DOKŁADNIE ta sama funkcja, która zasila pasek
       w oknie miejsca. Wcześniej strona miała własny ranking po surowej liczbie
       wspólnych tagów i dla tego samego miejsca dawała inny, gorszy zestaw:
       przy Ogrodzie Botanicznym prowadziła pomnikiem Szermierza, bo trafienie
       w `ikoniczne` ważyło tam tyle samo co w `zielone`. */
    const { data: podobne, error: bladPodobnych } = await (supabase as any).rpc('podobne_miejsca', {
      p_place: data.id,
      p_limit: 8,
      p_pomin: [],
      p_jezyk: i18n.language?.split('-')[0] || 'pl',
    });
    if (bladPodobnych) console.warn('[miejsce] podobne_miejsca:', bladPodobnych.message);
    setSimilar(((podobne ?? []) as unknown) as CatalogPlace[]);

    // Dopiero teraz rzeczy osobiste. Gość ma za sobą komplet treści strony —
    // opis, zdjęcia, sąsiedztwo — a brakuje mu wyłącznie tego, co bez konta
    // nie ma sensu: ulubionych i przypisania miejsca do własnej tablicy.
    const { data: userData } = await supabase.auth.getUser();
    if (!userData.user) return;

    const uid = userData.user.id;
    setZalogowany(true);
    const [{ data: fav }, { data: projs }, { data: piny }, { data: pref }] = await Promise.all([
      supabase.from('place_favorites').select('place_id')
        .eq('user_id', uid).eq('place_id', data.id).maybeSingle(),
      // Własne i udostępnione. Bez filtra przychodziły też cudze tablice
      // publiczne, na których zapis i tak odbija się od uprawnień.
      supabase.from('trip_projects').select('id, name, destination')
        .or(`user_id.eq.${uid},is_public.eq.false`)
        .order('updated_at', { ascending: false }),
      supabase.from('trip_project_places').select('project_id, priority').eq('catalog_id', data.id),
      supabase.from('route_preferences')
        .select('pace, popularity, wandering, dining, effort, crowds')
        .eq('user_id', uid).maybeSingle(),
    ]);
    setFavorite(!!fav);
    if (pref) setPreferencjeKonta(pref as Partial<AxisValues>);
    const lista: Tablica[] = projs ?? [];
    setBoards(lista);
    const mapa: Record<string, Bucket> = {};
    for (const p of piny ?? []) if (p.priority) mapa[p.project_id] = p.priority as Bucket;
    setPinezki(mapa);

    /* Która tablica? Wcześniej zawsze ostatnio zmieniana — Wieża Trynitarska
       w Lublinie lądowała na tablicy „Haga”. Teraz: tablica, na której miejsce
       już jest; ostatnio otwarta, jeśli to wyjazd do tego miasta; najnowszy
       wyjazd do tego miasta. Innego miasta nie podstawiamy nigdy — wtedy
       pierwsza decyzja zakłada tablicę. */
    let ostatnia: string | null = null;
    try { ostatnia = localStorage.getItem('rm_ostatnia_tablica'); } catch { /* bez pamięci przeglądarki */ }
    const tutaj = (b: Tablica) => tenSamCel(b.destination, data.city);
    const zPinezka = lista.filter((b) => mapa[b.id]);
    const wybrana =
      zPinezka.find((b) => b.id === ostatnia)
      ?? zPinezka.find(tutaj)
      ?? zPinezka[0]
      ?? lista.find((b) => b.id === ostatnia && tutaj(b))
      ?? lista.find(tutaj)
      ?? null;
    setActiveBoard(wybrana?.id ?? null);
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

  /** Zapis na wskazaną tablicę; drugi klik w tę samą decyzję ją zdejmuje. */
  const zapiszNaTablicy = async (idTablicy: string, bucket: Bucket, obecna: Bucket | null) => {
    if (!place) return;
    const ustaw = (b: Bucket | null) => setPinezki((p) => {
      const n = { ...p };
      if (b) n[idTablicy] = b; else delete n[idTablicy];
      return n;
    });
    if (obecna === bucket) {
      ustaw(null);
      const { error } = await supabase.from('trip_project_places')
        .delete().eq('project_id', idTablicy).eq('catalog_id', place.id);
      if (error) { ustaw(obecna); toast.error(error.message); }
      return;
    }
    ustaw(bucket);
    const { error } = obecna
      ? await supabase.from('trip_project_places')
          .update({ priority: bucket }).eq('project_id', idTablicy).eq('catalog_id', place.id)
      : await supabase.from('trip_project_places').insert({
          project_id: idTablicy, catalog_id: place.id, name: place.name, category: place.category,
          priority: bucket, lat: place.lat, lng: place.lng, description: place.description,
          opening_hours: place.opening_hours, visit_minutes: place.visit_minutes,
          image_url: place.photos?.[0] ?? null, source: 'catalog',
        });
    if (error) { ustaw(obecna); toast.error(error.message); }
  };

  const setBucket = async (bucket: Bucket) => {
    if (!place) return;
    if (!zalogowany) {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) navigate('/auth');
      return;
    }
    // Nie ma wyjazdu do tego miasta: ten sam formularz co w Odkrywaj,
    // a decyzja zapisuje się zaraz po założeniu tablicy.
    if (!activeBoard) {
      setNowaTablica({ wykonaj: (id) => { void zapiszNaTablicy(id, bucket, null); } });
      return;
    }
    await zapiszNaTablicy(activeBoard, bucket, mark);
  };

  const utworzTablice = async (u2: UstawieniaNowejTablicy) => {
    if (!nowaTablica || tworzeTablice) return;
    const { wykonaj } = nowaTablica;
    setTworzeTablice(true);
    const { data: u } = await supabase.auth.getUser();
    if (!u.user) { setTworzeTablice(false); setNowaTablica(null); navigate('/auth'); return; }
    const { data: nowa, error } = await (supabase as any).from('trip_projects').insert({
      user_id: u.user.id,
      name: u2.nazwa,
      destination: place?.city || u2.nazwa,
      days: u2.dni,
      hours_per_day: u2.godzinDziennie,
      fill_percent: u2.wypelnienie,
      start_date: u2.dataOd,
      end_date: u2.dataDo,
      trip_type: u2.charakter,
      ...u2.osie,
    }).select('id, name, destination').single();
    setTworzeTablice(false);
    if (error) { toast.error(error.message); return; }
    setBoards((prev) => [nowa as Tablica, ...prev]);
    setActiveBoard(nowa.id);
    try { localStorage.setItem('rm_ostatnia_tablica', nowa.id); } catch { /* bez pamięci przeglądarki */ }
    setNowaTablica(null);
    wykonaj(nowa.id);
    toast.success(`Tablica „${nowa.name}" gotowa`, {
      action: { label: 'Otwórz', onClick: () => navigate(`/plany/${nowa.id}`) },
    });
  };

  const wybierzTablice = (id: string) => {
    if (id === '__nowa') { setNowaTablica({ wykonaj: () => {} }); return; }
    setActiveBoard(id);
    try { localStorage.setItem('rm_ostatnia_tablica', id); } catch { /* bez pamięci przeglądarki */ }
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
  // Wyjazdy do tego miasta na górze listy, reszta osobno — przy kilkudziesięciu
  // tablicach właściwa nie może ginąć między Hagą a Porto.
  const tabliceTutaj = boards.filter((b) => tenSamCel(b.destination, place.city));
  const tabliceInne = boards.filter((b) => !tabliceTutaj.includes(b));
  const opcjaTablicy = (b: Tablica, zCelem: boolean) => {
    const pin = pinezki[b.id];
    const cel = zCelem && b.destination && !klucz(b.name).includes(klucz(b.destination)) ? ` · ${b.destination}` : '';
    return <option key={b.id} value={b.id}>{b.name}{cel}{pin ? ` · ${OPIS_DECYZJI[pin]}` : ''}</option>;
  };
  return (
    <div className="min-h-screen bg-background">
      {/* Tytuł karty przeglądarki i opis muszą zmieniać się przy nawigacji.
          Serwer generuje własne znaczniki dla robotów społecznościowych, ale
          użytkownik chodzący po serwisie dostawał wszędzie ten sam domyślny
          tytuł — z „/odkrywaj" na stronę Wawelu wchodziło się bez śladu w karcie. */}
      <SEO
        title={`${place.name}${place.city ? ` · ${place.city}` : ''}`}
        description={opisMiejsca(place) || undefined}
        image={place.photos?.[0] ? miniatura(place.photos[0], SZEROKOSC.bohater) : undefined}
        url={`/miejsce/${place.slug}`}
      />
      {/* Strona miejsca nie miała paska w ogóle: jedynym wyjściem był przycisk
          "wróć do odkrywania", więc z karty miejsca nie dało się przejść na
          tablicę ani do planu bez cofania się. */}
      <PlannerHeader
        context={board ? `${board.name} · ${board.destination}` : null}
      />
      <FormularzNowejTablicy
        otwarte={!!nowaTablica}
        miasto={place.city || place.name}
        preferencjeKonta={preferencjeKonta}
        zapisywanie={tworzeTablice}
        onZamknij={() => setNowaTablica(null)}
        onOdmowa={() => {
          setNowaTablica(null);
          toast.info('Bez tablicy odłożysz miejsce sercem — znajdziesz je w „Zapisane".');
        }}
        onUtworz={utworzTablice}
      />
      <main className="max-w-[1160px] mx-auto px-6 pt-8 pb-24">
        <button onClick={() => navigate('/odkrywaj')}
          className="text-sm text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1.5">
          <ArrowLeft className="w-3.5 h-3.5" /> Wróć do odkrywania
        </button>

        <div className="mt-6 grid grid-cols-1 lg:grid-cols-[1fr_380px] gap-10 items-start">
          {/* Kolumna główna */}
          <div>
            {photos.length > 0 && (
              <GaleriaZdjec
                zdjecia={photos}
                nazwaMiejsca={place.name}
                aspectRatio="aspect-[4/3]"
              />
            )}

            <p className="font-narrow uppercase tracking-[0.32em] text-[11px] text-muted-foreground mt-8">
              {[etykietaRodzaju(place.kind) ?? etykietaRodzaju(place.category),
                [place.city, place.country].filter(Boolean).join(' / ')].filter(Boolean).join(' · ')}
            </p>
            <h1 className="font-display font-light text-[42px] leading-[1.05] tracking-[-0.02em] mt-3">
              {place.name}
            </h1>

            {wyroznikMiejsca(place) && (
              <p className="mt-5 max-w-[60ch] border-l-2 border-foreground/25 pl-4
                            text-[15px] leading-relaxed text-foreground/90 text-pretty">
                {wyroznikMiejsca(place)}
              </p>
            )}

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
                  {/* Zawsze to samo miasto: funkcja bazy nie wychodzi poza nie.
                      Wcześniej etykieta zapowiadała „dalej inne miasta", bo stary
                      dobór potrafił dosypać miejsc z innego kraju. */}
                  {place.city && (
                    <span className="font-narrow uppercase tracking-[0.18em] text-[10px] text-muted-foreground">
                      {place.city}
                    </span>
                  )}
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-4">
                  {similar.map((sp) => (
                    <button key={sp.id} onClick={() => navigate(`/miejsce/${sp.slug}`)}
                      className="text-left rounded-md overflow-hidden border border-border bg-card hover:shadow-token-md transition-shadow">
                      <div className="h-24 bg-muted">
                        {sp.photos?.[0] && <Zdjecie src={sp.photos[0]} gdzie="kafelek" alt={sp.name} className="w-full h-full object-cover" />}
                      </div>
                      <div className="p-2.5">
                        <div className="text-[13px] font-medium leading-snug line-clamp-2">{sp.name}</div>
                        {/* Bez tego karta mówiła samą nazwą. „Hala Targowa" przy atrakcji
                            w Lipsku nie zdradzała, że stoi we Wrocławiu — a to jedyna
                            informacja, która decyduje, czy propozycja ma sens. */}
                        {(sp.city || sp.country) && (
                          <div className={`font-mono text-[11px] mt-0.5 truncate ${
                            sp.city && sp.city === place.city ? 'text-muted-foreground' : 'text-foreground font-medium'
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
            <div className="rounded-2xl bg-card p-5 shadow-token-md">
              <h2 className="text-[12px] font-semibold text-muted-foreground">Do tablicy</h2>
              {boards.length > 0 && (
                <div className="relative mt-2">
                  <select value={activeBoard ?? ''} onChange={(e) => wybierzTablice(e.target.value)}
                    aria-label="Tablica, na którą zapisujesz decyzję"
                    className="w-full h-10 [@media(pointer:coarse)]:h-11 appearance-none rounded-md bg-secondary pl-3 pr-9
                               text-[14px] font-medium outline-none cursor-pointer focus-visible:ring-2 focus-visible:ring-ring">
                    {!activeBoard && <option value="" disabled>Wybierz tablicę</option>}
                    {tabliceTutaj.length > 0 && tabliceInne.length > 0 ? (
                      <>
                        <optgroup label={`Wyjazdy: ${place.city}`}>{tabliceTutaj.map((b) => opcjaTablicy(b, false))}</optgroup>
                        <optgroup label="Inne wyjazdy">{tabliceInne.map((b) => opcjaTablicy(b, true))}</optgroup>
                      </>
                    ) : (
                      boards.map((b) => opcjaTablicy(b, tabliceTutaj.length === 0))
                    )}
                    <option value="__nowa">+ Nowa tablica{place.city ? `: ${place.city}` : ''}</option>
                  </select>
                  <ChevronDown className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                </div>
              )}
              {zalogowany && !activeBoard && (
                <p className="mt-2 text-[12px] leading-snug text-muted-foreground">
                  {place.city ? 'Nie masz jeszcze wyjazdu do tego miasta' : 'Nie masz jeszcze tablicy'} — pierwsza decyzja założy nową.
                </p>
              )}
              {/* Ta sama pigułka decyzji co w Odkrywaj i na tablicy. */}
              <PrzelacznikDecyzji rozmiar="lg" className="mt-3" stan={mark}
                onDecyzja={(k) => setBucket(k as Bucket)} />
              <button onClick={toggleFavorite}
                className="mt-3 w-full flex items-center justify-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors">
                <Heart className={`w-3.5 h-3.5 ${favorite ? 'fill-foreground text-foreground' : ''}`} />
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
                      className="text-[12px] text-muted-foreground hover:text-foreground transition-colors">
                      Zapisane · załóż pierwszą kolekcję ↗
                    </button>
                  )}
                </div>
              )}
            </div>

            <div className="rounded-2xl bg-card p-5 shadow-token-md">
              <h2 className="font-narrow uppercase tracking-[0.18em] text-[10px] text-muted-foreground">{t('miejsce.agent_radzi')}</h2>
              {agentTip ? (
                <AgentDymek maly className="mt-3">{agentTip}</AgentDymek>
              ) : (
                <button onClick={fetchTip} disabled={tipLoading}
                  className="mt-2.5 text-sm text-foreground underline underline-offset-2 hover:no-underline disabled:opacity-60 flex items-center gap-1.5">
                  {tipLoading ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Sprawdzam…</> : 'Zapytaj o wskazówkę'}
                </button>
              )}
              <p className="font-mono text-[11px] text-muted-foreground tabular-nums mt-3">
                {place.lat.toFixed(5)}° N, {place.lng.toFixed(5)}° E
              </p>
              {place.website && (
                <a href={place.website} target="_blank" rel="noreferrer"
                  className="text-xs text-foreground underline underline-offset-2 hover:no-underline flex items-center gap-1 mt-2">
                  Strona miejsca <ExternalLink className="w-3 h-3" />
                </a>
              )}
            </div>

            {nearby.length > 0 && (
              <div className="rounded-2xl bg-card p-5 shadow-token-md">
                <h2 className="font-narrow uppercase tracking-[0.18em] text-[10px] text-muted-foreground">
                  W okolicy · do 2 km
                </h2>
                <div className="mt-3 space-y-3">
                  {nearby.map((n) => (
                    <button key={n.id} onClick={() => navigate(`/miejsce/${n.slug}`)}
                      className="w-full flex items-center gap-3 text-left group">
                      <div className="w-11 h-11 rounded-sm overflow-hidden bg-muted shrink-0">
                        {n.photos?.[0] && <Zdjecie src={n.photos[0]} gdzie="kafelek" alt="" className="w-full h-full object-cover" />}
                      </div>
                      <div className="min-w-0">
                        <div className="text-[13px] font-medium truncate group-hover:underline">{n.name}</div>
                        <div className="font-mono text-[11px] text-muted-foreground tabular-nums">
                          {formatDuration(n.visit_minutes)} · {kmBetween(place, n).toFixed(1).replace('.', ',')} km
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
