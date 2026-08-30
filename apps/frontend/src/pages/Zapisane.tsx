import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Heart, Loader2, MapPin, Plus } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import PlannerHeader from '@/components/PlannerHeader';
import { inicjalyUzytkownika } from '@/lib/uzytkownik';
import { useTranslation } from 'react-i18next';

interface Kolekcja { id: string; name: string; slug: string; is_public: boolean }

/**
 * Zapisane miejsca w jednym miejscu: pełny zbiór plus kolekcje jako jego podzbiory.
 *
 * Wcześniej to były dwa osobne ekrany. Ulubione dawały zapis jednym kliknięciem,
 * ale bez porządku; kolekcje dawały porządek, ale nie dało się do nich niczego
 * dodać — w całym froncie nie było ani jednego zapisu do collection_places, więc
 * kolekcja mogła powstać wyłącznie pusta. Użytkownik miał dwa wejścia do tej samej
 * intencji i żadne nie robiło całości.
 *
 * Teraz zapis jest jeden: kliknięcie serca ląduje w place_favorites i to ten zbiór
 * jest kompletny — bo z niego kiedyś powstanie personalizacja, a każde dodatkowe
 * pytanie przy zapisie kosztowałoby sygnał. Kolekcje są półkami zakładanymi po
 * fakcie, przez tych, którzy chcą porządku.
 */
export default function Zapisane() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [places, setPlaces] = useState<any[]>([]);
  const [kolekcje, setKolekcje] = useState<Kolekcja[]>([]);
  /** Przypisania miejsce → kolekcje. Jedno miejsce może leżeć na kilku półkach. */
  const [przypisania, setPrzypisania] = useState<Record<string, string[]>>({});
  const [filtr, setFiltr] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [boards, setBoards] = useState<{ id: string; name: string }[]>([]);
  const [inicjaly, setInicjaly] = useState<string | null>(null);
  const [nowaNazwa, setNowaNazwa] = useState('');
  const [zakladam, setZakladam] = useState(false);

  useEffect(() => { (async () => setInicjaly(await inicjalyUzytkownika()))(); }, []);

  const load = async () => {
    setLoading(true);
    const { data: userData } = await supabase.auth.getUser();
    if (!userData.user) { navigate('/auth'); return; }

    const [{ data }, { data: projs }, { data: kol }] = await Promise.all([
      supabase.from('place_favorites')
        .select('created_at, place_catalog(*)')
        .eq('user_id', userData.user.id)
        .order('created_at', { ascending: false }),
      supabase.from('trip_projects').select('id, name').order('updated_at', { ascending: false }),
      supabase.from('collections').select('id, name, slug, is_public')
        .eq('user_id', userData.user.id).order('created_at', { ascending: false }),
    ]);

    const zapisane = (data ?? []).map((r: any) => r.place_catalog).filter(Boolean);
    setPlaces(zapisane);
    setBoards(projs ?? []);
    setKolekcje(kol ?? []);

    if ((kol ?? []).length > 0) {
      const { data: pary } = await supabase
        .from('collection_places').select('collection_id, place_id')
        .in('collection_id', (kol ?? []).map((k: Kolekcja) => k.id));
      const wg: Record<string, string[]> = {};
      for (const p of pary ?? []) (wg[p.place_id] ??= []).push(p.collection_id);
      setPrzypisania(wg);
    }
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const widoczne = useMemo(
    () => (filtr ? places.filter((p) => (przypisania[p.id] ?? []).includes(filtr)) : places),
    [places, filtr, przypisania]);

  const usun = async (placeId: string) => {
    const { data: userData } = await supabase.auth.getUser();
    if (!userData.user) return;
    await supabase.from('place_favorites').delete()
      .eq('user_id', userData.user.id).eq('place_id', placeId);
    setPlaces((prev) => prev.filter((p) => p.id !== placeId));
  };

  /** Operacja, której dotąd nie było nigdzie w aplikacji. */
  const przelaczKolekcje = async (placeId: string, collectionId: string) => {
    const juz = (przypisania[placeId] ?? []).includes(collectionId);
    if (juz) {
      await supabase.from('collection_places').delete()
        .eq('collection_id', collectionId).eq('place_id', placeId);
      setPrzypisania((prev) => ({
        ...prev, [placeId]: (prev[placeId] ?? []).filter((id) => id !== collectionId),
      }));
      return;
    }
    const { error } = await supabase.from('collection_places')
      .insert({ collection_id: collectionId, place_id: placeId });
    if (error) return toast.error(error.message);
    setPrzypisania((prev) => ({ ...prev, [placeId]: [...(prev[placeId] ?? []), collectionId] }));
  };

  const zalozKolekcje = async () => {
    const nazwa = nowaNazwa.trim();
    if (!nazwa || zakladam) return;
    setZakladam(true);
    const { data: userData } = await supabase.auth.getUser();
    const slug = `${nazwa.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
      .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}-${Math.random().toString(36).slice(2, 6)}`;
    const { data, error } = await supabase.from('collections')
      .insert({ user_id: userData.user!.id, name: nazwa, slug, is_public: false })
      .select('id, name, slug, is_public').single();
    setZakladam(false);
    if (error) return toast.error(error.message);
    setKolekcje((prev) => [data, ...prev]);
    setNowaNazwa('');
  };

  const dodajDoTablicy = async (place: any, projectId: string) => {
    const { error } = await supabase.from('trip_project_places').insert({
      project_id: projectId, catalog_id: place.id, name: place.name, category: place.category,
      priority: 'nice', lat: place.lat, lng: place.lng, description: place.description,
      image_url: place.photos?.[0] ?? null, source: 'catalog',
    });
    if (error) return toast.error(error.message);
    toast.success(t('zapisane.dodano_do_tablicy'));
  };

  return (
    <div className="min-h-screen bg-background">
      <PlannerHeader initials={inicjaly} />

      <main className="max-w-[1400px] mx-auto px-6 py-8">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="font-narrow uppercase tracking-[0.32em] text-[11px] text-muted-foreground">
              Odłożone na później
            </p>
            <h1 className="font-display font-light text-[40px] leading-[1.05] tracking-[-0.02em] mt-2">
              Zapisane
            </h1>
            <p className="text-sm text-muted-foreground mt-2 max-w-[52ch] text-pretty">
              Miejsca zapisane poza wyjazdem. Kolekcje to półki, na które możesz je odłożyć —
              nie musisz, zapis działa i bez nich.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Input value={nowaNazwa} onChange={(e) => setNowaNazwa(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && zalozKolekcje()}
              placeholder={t('zapisane.nazwa_nowej_kolekcji')} className="w-[220px]" />
            <Button variant="outline" onClick={zalozKolekcje} disabled={!nowaNazwa.trim() || zakladam}>
              <Plus className="w-4 h-4 mr-1.5" /> Kolekcja
            </Button>
          </div>
        </div>

        {/* Kolekcje jako filtry, nie osobny ekran: to podzbiory tego samego zbioru,
            więc przełączanie ich nie powinno przenosić użytkownika gdzie indziej. */}
        {kolekcje.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mt-6">
            <button onClick={() => setFiltr(null)} aria-pressed={filtr === null}
              className={`rounded-full px-3 py-1 text-xs border transition-colors ${
                filtr === null ? 'bg-foreground border-foreground text-background'
                               : 'bg-background border-border hover:bg-muted text-muted-foreground'}`}>
              Wszystkie {places.length > 0 && `· ${places.length}`}
            </button>
            {kolekcje.map((k) => {
              const ile = places.filter((p) => (przypisania[p.id] ?? []).includes(k.id)).length;
              return (
                <button key={k.id} onClick={() => setFiltr(k.id)} aria-pressed={filtr === k.id}
                  className={`rounded-full px-3 py-1 text-xs border transition-colors ${
                    filtr === k.id ? 'bg-foreground border-foreground text-background'
                                   : 'bg-background border-border hover:bg-muted text-muted-foreground'}`}>
                  {k.name} {ile > 0 && `· ${ile}`}
                </button>
              );
            })}
          </div>
        )}

        {loading ? (
          <p className="text-muted-foreground flex items-center gap-2 py-16">
            <Loader2 className="w-4 h-4 animate-spin" /> Wczytuję…
          </p>
        ) : places.length === 0 ? (
          <div className="rounded-md border border-border bg-card px-6 py-16 text-center mt-8">
            <Heart className="w-9 h-9 text-muted-foreground/40 mx-auto" />
            <h2 className="font-display font-light text-[24px] mt-4">{t('zapisane.nic_tu_jeszcze_nie_ma')}</h2>
            <p className="text-sm text-muted-foreground mt-2 max-w-[46ch] mx-auto text-pretty">
              Zapisane to miejsca odłożone na później — bez decydowania, kiedy i czy w ogóle
              tam pojedziesz. Klikaj serce wszędzie, gdzie coś Ci się spodoba.
            </p>
            <Button className="mt-6 bg-foreground text-background hover:bg-foreground/90" onClick={() => navigate('/odkrywaj')}>
              Zacznij odkrywać ↗
            </Button>
          </div>
        ) : widoczne.length === 0 ? (
          <div className="rounded-md border border-border bg-card px-6 py-16 text-center mt-8">
            <p className="text-sm text-muted-foreground">
              Ta kolekcja jest pusta. Odłóż tu coś przyciskiem pod kartką.
            </p>
          </div>
        ) : (
          <div className="mt-6 grid gap-4 [grid-template-columns:repeat(auto-fill,minmax(min(100%,248px),1fr))]">
            {widoczne.map((p) => (
              <div key={p.id} className="rounded-md overflow-hidden border border-border bg-card
                                         hover:shadow-token-md transition-shadow flex flex-col">
                <button onClick={() => navigate(`/miejsce/${p.slug}`)} className="text-left">
                  <div className="h-40 bg-muted relative">
                    {p.photos?.[0] ? (
                      <img src={p.photos[0]} alt={p.name} loading="lazy" className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-muted-foreground/40">
                        <MapPin className="w-7 h-7" />
                      </div>
                    )}
                    <button onClick={(e) => { e.stopPropagation(); usun(p.id); }}
                      aria-label={t('zapisane.usun_z_zapisanych')}
                      className="absolute top-2 right-2 w-8 h-8 rounded-full bg-ink/40 hover:bg-ink/60
                                 backdrop-blur flex items-center justify-center">
                      <Heart className="w-4 h-4 fill-accent text-accent" />
                    </button>
                  </div>
                  <div className="p-3">
                    <div className="font-medium text-sm leading-snug line-clamp-2">{p.name}</div>
                    {(p.city || p.country) && (
                      <div className="font-mono text-[11px] text-muted-foreground mt-0.5 truncate">
                        {[p.city, p.country].filter(Boolean).join(' / ')}
                      </div>
                    )}
                  </div>
                </button>

                <div className="px-3 pb-3 mt-auto space-y-1.5">
                  {kolekcje.length > 0 && (
                    <select value=""
                      onChange={(e) => { if (e.target.value) { przelaczKolekcje(p.id, e.target.value); e.target.value = ''; } }}
                      aria-label={t('zapisane.od_oz_do_kolekcji')}
                      className="w-full text-[11px] border border-border rounded-md px-2 py-1.5
                                 bg-background hover:bg-muted cursor-pointer">
                      <option value="">
                        {(przypisania[p.id] ?? []).length > 0
                          ? `na ${(przypisania[p.id] ?? []).length} półkach`
                          : '+ odłóż do kolekcji'}
                      </option>
                      {kolekcje.map((k) => (
                        <option key={k.id} value={k.id}>
                          {(przypisania[p.id] ?? []).includes(k.id) ? '✓ ' : ''}{k.name}
                        </option>
                      ))}
                    </select>
                  )}
                  {boards.length > 0 && (
                    <select value=""
                      onChange={(e) => { if (e.target.value) { dodajDoTablicy(p, e.target.value); e.target.value = ''; } }}
                      aria-label={t('zapisane.dodaj_do_tablicy')}
                      className="w-full text-[11px] border border-border rounded-md px-2 py-1.5
                                 bg-background hover:bg-muted cursor-pointer">
                      <option value="">+ dodaj do wyjazdu</option>
                      {boards.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
                    </select>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
