import { useEffect, useMemo, useState } from 'react';
import Zdjecie from '@/components/Zdjecie';
import { useNavigate } from 'react-router-dom';
import { Heart, Loader2, MapPin, Plus } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import PlannerHeader from '@/components/PlannerHeader';
import { inicjalyUzytkownika } from '@/lib/uzytkownik';
import { odmien } from '@/lib/odmiana';
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
  const [boards, setBoards] = useState<{ id: string; name: string; destination?: string | null }[]>([]);
  const [skladam, setSkladam] = useState<string | null>(null);
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
      supabase.from('trip_projects').select('id, name, destination').order('updated_at', { ascending: false }),
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

  /**
   * Miasta, z których uzbierało się na wyjazd.
   *
   * Serduszko było dotąd ścieżką bez wyjścia: kto nie chciał zakładać tablicy,
   * odkładał miejsca tutaj i na tym się kończyło. Skoro ktoś zapisał sześć
   * miejsc w jednym mieście, to nie jest już zbieranie — to jest wyjazd, tylko
   * bez tablicy. Proponujemy złożenie jej z tego, co już jest.
   *
   * Istniejąca tablica na to miasto nie wycisza propozycji, tylko zmienia jej
   * treść: sensowną ofertą jest wtedy dopisanie miejsc do niej, a nie drugi
   * wyjazd w to samo miejsce. Wyciszanie sprawiało, że przy koncie z tablicami
   * do prawie każdego miasta ta funkcja nie pokazywała się nigdy.
   */
  const propozycjeTablic = useMemo(() => {
    const wgMiasta: Record<string, any[]> = {};
    for (const p of places) {
      const miasto = (p.city || '').trim();
      if (!miasto) continue;
      (wgMiasta[miasto] ??= []).push(p);
    }
    return Object.entries(wgMiasta)
      .filter(([, lista]) => lista.length >= 2)
      .map(([miasto, lista]) => ({
        miasto,
        lista,
        istniejaca: boards.find(
          (b) => (b.destination || '').trim().toLowerCase() === miasto.toLowerCase()) ?? null,
      }))
      .sort((a, b) => b.lista.length - a.lista.length)
      .slice(0, 3);
  }, [places, boards]);

  /**
   * Wszystko ląduje w „być może". Serce znaczy „chcę to zapamiętać", a nie
   * „to na pewno jadę zobaczyć" — awans do „na pewno" jest decyzją, której nie
   * wolno podjąć za kogoś. Ten sam kubełek co przy „dodaj do tablicy" niżej.
   */
  const zlozTablice = async (miasto: string, lista: any[], istniejaca: { id: string } | null) => {
    if (skladam) return;
    setSkladam(miasto);
    const { data: userData } = await supabase.auth.getUser();
    if (!userData.user) { setSkladam(null); navigate('/auth'); return; }

    let idTablicy = istniejaca?.id ?? null;
    if (!idTablicy) {
      const { data: tablica, error } = await (supabase as any).from('trip_projects').insert({
        user_id: userData.user.id,
        name: miasto,
        destination: miasto,
        days: 3,
        hours_per_day: 8,
        fill_percent: 70,
      }).select('id, name').single();
      if (error || !tablica) {
        setSkladam(null);
        return toast.error(error?.message ?? 'Nie udało się utworzyć tablicy');
      }
      idTablicy = tablica.id;
    }

    /* Do istniejącej tablicy dopisujemy tylko to, czego jeszcze na niej nie ma —
       inaczej powtórne kliknięcie zrobiłoby duplikaty. */
    const { data: juzTam } = await supabase.from('trip_project_places')
      .select('catalog_id').eq('project_id', idTablicy);
    const znane = new Set((juzTam ?? []).map((r: any) => r.catalog_id).filter(Boolean));
    const doDodania = lista.filter((p: any) => !znane.has(p.id));

    if (doDodania.length === 0) {
      setSkladam(null);
      navigate(`/plany/${idTablicy}`);
      return;
    }

    const { error: bladMiejsc } = await supabase.from('trip_project_places').insert(
      doDodania.map((p: any) => ({
        project_id: idTablicy,
        catalog_id: p.id,
        name: p.name,
        category: p.category,
        priority: 'nice',
        lat: p.lat,
        lng: p.lng,
        description: p.description,
        opening_hours: p.opening_hours ?? null,
        visit_minutes: p.visit_minutes ?? null,
        image_url: p.photos?.[0] ?? null,
        source: 'catalog',
      })));

    setSkladam(null);
    if (bladMiejsc) return toast.error(bladMiejsc.message);
    navigate(`/plany/${idTablicy}`);
  };

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

        {propozycjeTablic.length > 0 && (
          <section className="mt-8 rounded-md border border-primary/20 bg-primary/5 px-5 py-4">
            <p className="font-narrow uppercase tracking-[0.18em] text-[10px] text-primary">
              Z tego zrobi się wyjazd
            </p>
            <p className="text-[13.5px] text-muted-foreground mt-1.5 max-w-[62ch]">
              Zapisane miejsca zebrały się w jednym mieście. Trafią do „być może"
              na tablicy — co pewne, przesuniesz sam.
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              {propozycjeTablic.map(({ miasto, lista, istniejaca }) => (
                <button
                  key={miasto}
                  onClick={() => zlozTablice(miasto, lista, istniejaca)}
                  disabled={!!skladam}
                  className="inline-flex items-center gap-2 rounded-full border border-primary/30
                             bg-background px-4 py-2 text-[13px] hover:bg-primary/10
                             disabled:opacity-50 transition-colors"
                >
                  {skladam === miasto
                    ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    : <Plus className="w-3.5 h-3.5 text-primary" />}
                  <span className="font-medium">{miasto}</span>
                  <span className="font-mono text-[11px] text-muted-foreground">
                    {lista.length} {odmien(lista.length, 'miejsce', 'miejsca', 'miejsc')}
                    {istniejaca ? ' → istniejąca tablica' : ' → nowa tablica'}
                  </span>
                </button>
              ))}
            </div>
          </section>
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
                      <Zdjecie src={p.photos[0]} gdzie="kafelek" alt={p.name} className="w-full h-full object-cover" />
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
                          {/* Znacznik wyboru nie jest na liście dozwolonych znaków typograficznych,
                              a w <option> nie da się wstawić ikony — zostaje słowo. */}
                          {k.name}{(przypisania[p.id] ?? []).includes(k.id) ? ` · ${t("zapisane.juz_w_kolekcji")}` : ""}
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
