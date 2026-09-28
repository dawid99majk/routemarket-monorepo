import { useCallback, useEffect, useState } from 'react';
import Zdjecie from '@/components/Zdjecie';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Copy, Heart, Loader2, MapPin } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import PlannerHeader from '@/components/PlannerHeader';
import DiscoverMap from '@/components/DiscoverMap';
import { zakresDat } from '@/lib/daty';
import { inicjalyUzytkownika } from '@/lib/uzytkownik';
import { glosujNaMiejsce, wczytajMojeGlosy } from '@/lib/glosowanie';
import { useTranslation } from 'react-i18next';
import SEO from '@/components/SEO';
import { odmien } from '@/lib/odmiana';

const KUBELKI = [
  { id: 'must', label: 'Na pewno', kolor: 'border-primary' },
  { id: 'nice', label: 'Być może', kolor: 'border-accent-strong' },
] as const;

/**
 * Cudza tablica do obejrzenia i skopiowania.
 *
 * Baza była na to gotowa od dawna — polityki wpuszczały do publicznych tablic
 * i ich miejsc, na tablicy dyndał licznik kopii — ale w interfejsie nie istniała
 * żadna trasa, która by tu prowadziła. Publikowanie było funkcją bez odbiorcy:
 * dawało się opublikować, nie dawało się obejrzeć.
 *
 * „Publiczna" znaczy „widoczna w internecie": polityki odczytu obejmują też rolę
 * anon, więc tablicę obejrzy każdy, kto dostanie odnośnik, bez zakładania konta.
 * Zrobić z nią nie może nic — polubienia i licznik kopii wymagają roli
 * authenticated, więc gościowi nie pokazujemy przycisków, których i tak baza by
 * nie przyjęła. Zamiast wyszarzonych guzików dostaje jedno zaproszenie.
 */
export default function TablicaPubliczna() {
  const { t } = useTranslation();
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [tablica, setTablica] = useState<any | null>(null);
  const [miejsca, setMiejsca] = useState<any[]>([]);
  const [polubiona, setPolubiona] = useState(false);
  const [ladowanie, setLadowanie] = useState(true);
  const [kopiuje, setKopiuje] = useState(false);
  const [inicjaly, setInicjaly] = useState<string | null>(null);
  const [jaId, setJaId] = useState<string | null>(null);
  const [mojeGlosy, setMojeGlosy] = useState<Set<string>>(new Set());
  /** Moja kopia tej tablicy, jeśli już ją zrobiłem. */
  const [mojaKopia, setMojaKopia] = useState<{ id: string; copied_at: string | null } | null>(null);

  useEffect(() => { (async () => setInicjaly(await inicjalyUzytkownika()))(); }, []);

  const wczytaj = useCallback(async () => {
    if (!id) return;
    setLadowanie(true);
    const { data: t } = await (supabase as any).from('trip_projects')
      .select('id, name, destination, days, trip_type, author_display, copy_count, like_count, start_date, end_date, is_public, user_id, updated_at, is_example')
      .eq('id', id).maybeSingle();

    // Polityka odsiewa nieopublikowane, więc brak wiersza znaczy „nie dla ciebie".
    if (!t) { setTablica(null); setLadowanie(false); return; }

    const { data: pl } = await (supabase as any).from('trip_project_places')
      .select('id, name, category, priority, lat, lng, description, visit_minutes, image_url, vote_count, place_catalog(photos)')
      .eq('project_id', id).order('sort_order', { ascending: true });
    setTablica(t);
    // image_url zapisuje sie raz, przy dodawaniu miejsca. Zdjecia w katalogu
    // dochodza pozniej, wiec bez tego kafelek zostawal pusty mimo istniejacej
    // galerii — tak wygladalo 5 z 14 miejsc na tablicy "Praga - klimat we dwoje".
    setMiejsca((pl ?? []).map((m: any) => ({
      ...m,
      image_url: m.image_url || (Array.isArray(m.place_catalog?.photos)
        ? m.place_catalog.photos.find((u: unknown) => typeof u === 'string' && u)
        : null) || null,
    })));

    if (pl?.length) {
      wczytajMojeGlosy(pl.map((m: any) => m.id)).then(setMojeGlosy);
    }

    const { data: u } = await supabase.auth.getUser();
    setJaId(u.user?.id ?? null);
    if (u.user) {
      const { data: lk } = await (supabase as any).from('board_likes')
        .select('project_id').eq('user_id', u.user.id).eq('project_id', id).maybeSingle();
      setPolubiona(!!lk);

      const { data: kop } = await (supabase as any).from('trip_projects')
        .select('id, copied_at').eq('user_id', u.user.id).eq('copied_from', id)
        .order('copied_at', { ascending: false }).limit(1).maybeSingle();
      setMojaKopia(kop ?? null);
    }
    setLadowanie(false);
  }, [id]);

  useEffect(() => { wczytaj(); }, [wczytaj]);

  const przelaczPolubienie = async () => {
    const { data: u } = await supabase.auth.getUser();
    if (!u.user) return navigate(`/auth?redirect=/tablica/${id}`);
    // Licznik przestawiamy od razu, a dopiero potem czekamy na bazę — polubienie
    // ma odpowiadać natychmiast, bo to gest, nie operacja.
    const bylo = polubiona;
    setPolubiona(!bylo);
    setTablica((t: any) => ({ ...t, like_count: (t.like_count ?? 0) + (bylo ? -1 : 1) }));

    const { error } = bylo
      ? await (supabase as any).from('board_likes').delete()
          .eq('user_id', u.user.id).eq('project_id', id)
      : await (supabase as any).from('board_likes')
          .insert({ user_id: u.user.id, project_id: id });

    if (error) {
      setPolubiona(bylo);
      setTablica((t: any) => ({ ...t, like_count: (t.like_count ?? 0) + (bylo ? 1 : -1) }));
      toast.error(error.message);
    }
  };

  const glosuj = async (placeId: string) => {
    const juz = mojeGlosy.has(placeId);
    setMojeGlosy((prev) => {
      const next = new Set(prev);
      if (juz) next.delete(placeId); else next.add(placeId);
      return next;
    });
    setMiejsca((prev) => prev.map((m) => {
      if (m.id !== placeId) return m;
      const count = Math.max(0, (m.vote_count ?? 0) + (juz ? -1 : 1));
      return { ...m, vote_count: count };
    }));
    try {
      const wynik = await glosujNaMiejsce(placeId);
      setMiejsca((prev) => prev.map((m) => m.id === placeId ? { ...m, vote_count: wynik.vote_count } : m));
    } catch {
      toast.error('Nie udało się zapisać głosu');
    }
  };

  const skopiujDoSiebie = async () => {
    const { data: u } = await supabase.auth.getUser();
    if (!u.user) return navigate(`/auth?redirect=/tablica/${id}`);
    if (u.user.id === tablica.user_id) return navigate(`/plany/${tablica.id}`);
    if (mojaKopia) return navigate(`/plany/${mojaKopia.id}`);
    setKopiuje(true);
    try {
      const { data: kopia, error } = await (supabase as any).from('trip_projects').insert({
        user_id: u.user.id,
        name: tablica.name,
        destination: tablica.destination,
        days: tablica.days,
        trip_type: tablica.trip_type,
        copied_from: id,
        copied_at: new Date().toISOString(),
      }).select('id, copied_at').single();
      if (error) throw new Error(error.message);

      if (miejsca.length) {
        await (supabase as any).from('trip_project_places').insert(
          miejsca.map((m) => ({
            project_id: kopia.id, name: m.name, category: m.category, priority: m.priority,
            lat: m.lat, lng: m.lng, description: m.description,
            visit_minutes: m.visit_minutes, image_url: m.image_url, source: 'kopia',
          })));
      }
      // Licznik kopii utrzymuje właściciel oryginału; podbijamy go przez RPC,
      // bo polityka nie pozwala obcemu pisać po cudzym wierszu.
      await (supabase as any).rpc('rm_podbij_kopie', { p_project: id });
      setMojaKopia({ id: kopia.id, copied_at: kopia.copied_at ?? new Date().toISOString() });
      toast.success(t('publiczna.skopiowana'));
      navigate(`/plany/${kopia.id}`);
    } catch (e: any) {
      toast.error(e.message || 'Nie udało się skopiować');
    } finally {
      setKopiuje(false);
    }
  };

  if (ladowanie) {
    return (
      <div className="min-h-screen bg-background">
        <PlannerHeader initials={inicjaly} />
        <p className="max-w-[1400px] mx-auto px-6 py-16 flex items-center gap-2 text-muted-foreground">
          <Loader2 className="w-4 h-4 animate-spin" /> Wczytuję tablicę…
        </p>
      </div>
    );
  }

  if (!tablica) {
    return (
      <div className="min-h-screen bg-background">
        <PlannerHeader initials={inicjaly} />
        <div className="max-w-[1400px] mx-auto px-6 py-16 text-center">
          <h1 className="font-display font-light text-[28px]">{t('publiczna.brak_tytul')}</h1>
          <p className="text-sm text-muted-foreground mt-2 max-w-[44ch] mx-auto text-pretty">
            {t('publiczna.brak_opis')}
          </p>
          <Button className="mt-6 bg-foreground text-background hover:bg-foreground/90" onClick={() => navigate('/')}>
            {t('publiczna.wroc')}
          </Button>
        </div>
      </div>
    );
  }

  /* Autor mógł tablicę zmienić już po tym, jak ją skopiowałem. Mówimy o tym
     wprost, ale NIE wciągamy zmian do kopii: to od tego momentu Twój wyjazd,
     w którym mogłeś poprzestawiać decyzje i ułożyć plan. Scalanie musiałoby
     albo nadpisać Twoją pracę, albo zgadywać — jedno i drugie gorsze niż
     uczciwa informacja. */
  const zrodloZmienione = !!(mojaKopia?.copied_at && (tablica as any)?.updated_at
    && new Date((tablica as any).updated_at) > new Date(mojaKopia.copied_at));

  const naMapie = miejsca
    .filter((m) => m.lat != null && m.lng != null && m.priority !== 'rejected')
    .map((m) => ({ id: m.id, name: m.name, lat: m.lat, lng: m.lng, kubelek: m.priority }));

  return (
    <div className="min-h-screen bg-background">
      <SEO
        title={`${tablica.name}${tablica.destination ? ` · ${tablica.destination}` : ''}`}
        url={`/tablica/${tablica.id}`}
      />
      <PlannerHeader initials={inicjaly} />

      <main className="max-w-[1400px] mx-auto px-6 py-8">
        <button onClick={() => navigate('/tablice')}
          className="inline-flex items-center gap-2 text-[13px] text-muted-foreground
                     hover:text-foreground transition-colors">
          <ArrowLeft className="w-3.5 h-3.5" /> Wszystkie publiczne tablice
        </button>

        <div className="flex flex-wrap items-end justify-between gap-4 mt-4">
          <div className="max-w-[620px]">
            <p className="font-narrow uppercase tracking-[0.32em] text-[11px] text-muted-foreground">
              {tablica.is_example
                ? 'Przykładowa tablica'
                : `Tablica od ${tablica.author_display || 'podróżnika'}`}
            </p>
            <h1 className="font-display font-light text-[40px] leading-[1.05] tracking-[-0.02em] mt-2">
              {tablica.name}
            </h1>
            <p className="font-mono text-[12px] tabular-nums text-muted-foreground mt-2">
              {[tablica.destination,
                tablica.days ? `${tablica.days} ${odmien(tablica.days, 'dzień', 'dni', 'dni')}` : null,
                tablica.start_date ? zakresDat(tablica.start_date, tablica.end_date) : null,
                `${miejsca.length} ${odmien(miejsca.length, 'miejsce', 'miejsca', 'miejsc')}`,
              ].filter(Boolean).join(' · ')}
            </p>
          </div>

          <div className="flex items-center gap-2">
            {/* Gość widzi liczbę, nie przycisk. Wyszarzony guzik kusiłby do
                kliknięcia, po którym i tak nic by się nie stało — baza odrzuca
                polubienia i podbicie licznika kopii od roli anon. */}
            {jaId ? (
              <>
                <button onClick={przelaczPolubienie}
                  aria-pressed={polubiona}
                  className={`h-10 inline-flex items-center gap-2 rounded-full px-4 text-sm font-bold
                              transition-colors ${polubiona
                                ? 'bg-foreground text-background'
                                : 'bg-card shadow-token-sm hover:bg-secondary'}`}>
                  <Heart className={`w-4 h-4 ${polubiona ? 'fill-current' : ''}`} />
                  {tablica.like_count ?? 0}
                </button>
                {jaId === tablica.user_id ? (
                  /* Własna tablica: dymek „to Twoja" wyglądał na działający przycisk,
                     który nic nie robi. Teraz prowadzi tam, gdzie się ją edytuje. */
                  <Button onClick={() => navigate(`/plany/${tablica.id}`)}
                    className="h-10 bg-foreground text-background hover:bg-foreground/90">
                    Otwórz swoją tablicę ↗
                  </Button>
                ) : mojaKopia ? (
                  /* Już skopiowana — druga identyczna kopia nikomu nie służy. */
                  <div className="flex flex-col items-end gap-1">
                    <Button onClick={() => navigate(`/plany/${mojaKopia.id}`)}
                      className="h-10 bg-foreground text-background hover:bg-foreground/90">
                      Otwórz swoją kopię ↗
                    </Button>
                    <span className="font-mono text-[11px] tabular-nums text-muted-foreground">
                      {mojaKopia.copied_at
                        ? `skopiowana ${new Date(mojaKopia.copied_at).toLocaleDateString('pl-PL')}`
                        : 'masz już swoją kopię'}
                      {zrodloZmienione && ' · autor coś od tego czasu zmienił'}
                    </span>
                  </div>
                ) : (
                  <Button onClick={skopiujDoSiebie} disabled={kopiuje}
                    className="h-10 bg-foreground text-background hover:bg-foreground/90">
                    {kopiuje
                      ? <><Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> {t('publiczna.kopiuje')}</>
                      : <><Copy className="w-4 h-4 mr-1.5" /> {t('publiczna.skopiuj')}</>}
                  </Button>
                )}
              </>
            ) : (
              <>
                <span className="h-10 inline-flex items-center gap-2 rounded-full bg-card shadow-token-sm
                                 px-4 text-sm font-bold text-muted-foreground tabular-nums">
                  <Heart className="w-4 h-4" /> {tablica.like_count ?? 0}
                </span>
                <Button onClick={() => navigate(`/auth?redirect=/tablica/${id}`)}
                  className="h-10 bg-foreground text-background hover:bg-foreground/90">
                  Załóż konto, żeby skopiować ↗
                </Button>
              </>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-3 mt-8 items-start">
          {KUBELKI.map((k) => {
            const swoje = miejsca.filter((m) => m.priority === k.id);
            if (swoje.length === 0) return null;
            return (
              <section key={k.id} className="rounded-2xl bg-muted p-3.5 flex flex-col gap-2">
                <div className="flex items-center gap-2 px-1 pb-1">
                  <span aria-hidden className={`w-2.5 h-2.5 rounded-full ${
                    k.id === 'must' ? 'bg-primary' : k.id === 'nice' ? 'bg-accent-strong' : 'bg-clay'}`} />
                  <h2 className="font-display text-[18px] font-bold">{k.label}</h2>
                  <span className="flex-1" />
                  <span className={`rounded-full px-2.5 py-0.5 text-[13px] font-bold tabular-nums ${
                    k.id === 'must' ? 'bg-primary text-primary-foreground'
                      : k.id === 'nice' ? 'bg-accent text-accent-foreground' : 'bg-clay text-foreground'}`}>
                    {swoje.length}
                  </span>
                </div>
                {swoje.map((m) => (
                  <div key={m.id} className="rounded-md bg-card p-2 flex gap-3 items-center shadow-token-xs">
                    <div className="w-14 h-14 rounded-[12px] overflow-hidden bg-placeholder-photo shrink-0 flex items-center justify-center">
                      {m.image_url
                        ? <Zdjecie src={m.image_url} gdzie="kafelek" alt="" className="w-full h-full object-cover" />
                        : <MapPin className="w-5 h-5 text-muted-foreground" />}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="text-[15px] font-semibold leading-snug">{m.name}</div>
                      {m.description && (
                        <div className="text-[12.5px] text-muted-foreground line-clamp-1 mt-0.5">{m.description}</div>
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={() => glosuj(m.id)}
                      aria-label="Głosuj na to miejsce"
                      title="Głosuj na to miejsce"
                      className={`shrink-0 self-center inline-flex items-center gap-1 h-9 px-2.5 rounded-full text-[12px] transition-colors ${
                        mojeGlosy.has(m.id)
                          ? 'bg-foreground text-background font-bold'
                          : 'bg-secondary text-muted-foreground hover:text-foreground'
                      }`}
                    >
                      <Heart className={`w-3.5 h-3.5 ${mojeGlosy.has(m.id) ? 'fill-current' : ''}`} />
                      {(m.vote_count ?? 0) > 0 ? (
                        <span className="tabular-nums font-bold">{m.vote_count}</span>
                      ) : null}
                    </button>
                  </div>
                ))}
              </section>
            );
          })}

          {naMapie.length > 0 && (
            <div className="rounded-2xl bg-card overflow-hidden shadow-token-md
                            flex flex-col self-start md:sticky md:top-[88px]">
              <h2 className="px-4 py-3 font-display text-[18px] font-bold">Na mapie</h2>
              <DiscoverMap places={naMapie} doKadru={naMapie} className="h-[420px]" />
            </div>
          )}
        </div>

        {tablica.copy_count > 0 && (
          <p className="font-mono text-[12px] tabular-nums text-muted-foreground mt-6">
            Skopiowana {tablica.copy_count} razy
          </p>
        )}
      </main>
    </div>
  );
}
