import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Copy, Heart, Loader2, MapPin } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import PlannerHeader from '@/components/PlannerHeader';
import DiscoverMap from '@/components/DiscoverMap';
import { zakresDat } from '@/lib/daty';
import { inicjalyUzytkownika } from '@/lib/uzytkownik';

const KUBELKI = [
  { id: 'must', label: 'Na pewno', kolor: 'bg-primary' },
  { id: 'nice', label: 'Być może', kolor: 'bg-dusty-blue' },
] as const;

/**
 * Cudza tablica do obejrzenia i skopiowania.
 *
 * Baza była na to gotowa od dawna — polityki wpuszczały do publicznych tablic
 * i ich miejsc, na tablicy dyndał licznik kopii — ale w interfejsie nie istniała
 * żadna trasa, która by tu prowadziła. Publikowanie było funkcją bez odbiorcy:
 * dawało się opublikować, nie dawało się obejrzeć.
 *
 * „Publiczna" znaczy tu „widoczna dla zalogowanych", nie „widoczna w internecie" —
 * tak brzmi obietnica przy przełączniku publikacji i tak działają polityki, które
 * obejmują wyłącznie rolę authenticated. Niezalogowanemu mówimy to wprost, zamiast
 * udawać, że tablicy nie ma.
 */
export default function TablicaPubliczna() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [tablica, setTablica] = useState<any | null>(null);
  const [miejsca, setMiejsca] = useState<any[]>([]);
  const [polubiona, setPolubiona] = useState(false);
  const [ladowanie, setLadowanie] = useState(true);
  const [kopiuje, setKopiuje] = useState(false);
  const [inicjaly, setInicjaly] = useState<string | null>(null);
  const [jaId, setJaId] = useState<string | null>(null);

  useEffect(() => { (async () => setInicjaly(await inicjalyUzytkownika()))(); }, []);

  const wczytaj = useCallback(async () => {
    if (!id) return;
    setLadowanie(true);
    const { data: t } = await (supabase as any).from('trip_projects')
      .select('id, name, destination, days, trip_type, author_display, copy_count, like_count, start_date, end_date, is_public, user_id')
      .eq('id', id).maybeSingle();

    // Polityka odsiewa nieopublikowane, więc brak wiersza znaczy „nie dla ciebie".
    if (!t) { setTablica(null); setLadowanie(false); return; }

    const { data: pl } = await (supabase as any).from('trip_project_places')
      .select('id, name, category, priority, lat, lng, description, visit_minutes, image_url')
      .eq('project_id', id).order('sort_order', { ascending: true });
    setTablica(t);
    setMiejsca(pl ?? []);

    const { data: u } = await supabase.auth.getUser();
    setJaId(u.user?.id ?? null);
    if (u.user) {
      const { data: lk } = await (supabase as any).from('board_likes')
        .select('project_id').eq('user_id', u.user.id).eq('project_id', id).maybeSingle();
      setPolubiona(!!lk);
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

  const skopiujDoSiebie = async () => {
    const { data: u } = await supabase.auth.getUser();
    if (!u.user) return navigate(`/auth?redirect=/tablica/${id}`);
    if (u.user.id === tablica.user_id) return toast.info('To Twoja tablica');
    setKopiuje(true);
    try {
      const { data: kopia, error } = await (supabase as any).from('trip_projects').insert({
        user_id: u.user.id,
        name: tablica.name,
        destination: tablica.destination,
        days: tablica.days,
        trip_type: tablica.trip_type,
      }).select('id').single();
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
      toast.success('Tablica jest u Ciebie — zmień, co nie pasuje');
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

  if (!tablica && !jaId) {
    return (
      <div className="min-h-screen bg-background">
        <PlannerHeader initials={inicjaly} />
        <div className="max-w-[1400px] mx-auto px-6 py-16 text-center">
          <h1 className="font-display font-light text-[28px]">Tablice widzą zalogowani</h1>
          <p className="text-sm text-muted-foreground mt-2 max-w-[46ch] mx-auto text-pretty">
            Autor udostępnił tę tablicę osobom z kontem. Załóż je albo zaloguj się — zajmuje
            to chwilę i nic nie kosztuje.
          </p>
          <Button className="mt-6 bg-primary hover:bg-primary/90"
            onClick={() => navigate(`/auth?redirect=/tablica/${id}`)}>
            Zaloguj się, żeby zobaczyć ↗
          </Button>
        </div>
      </div>
    );
  }

  if (!tablica) {
    return (
      <div className="min-h-screen bg-background">
        <PlannerHeader initials={inicjaly} />
        <div className="max-w-[1400px] mx-auto px-6 py-16 text-center">
          <h1 className="font-display font-light text-[28px]">Nie ma takiej tablicy</h1>
          <p className="text-sm text-muted-foreground mt-2 max-w-[44ch] mx-auto text-pretty">
            Albo nigdy nie została opublikowana, albo autor cofnął publikację.
          </p>
          <Button className="mt-6 bg-primary hover:bg-primary/90" onClick={() => navigate('/')}>
            Wróć na stronę główną
          </Button>
        </div>
      </div>
    );
  }

  const naMapie = miejsca
    .filter((m) => m.lat != null && m.lng != null && m.priority !== 'rejected')
    .map((m) => ({ id: m.id, name: m.name, lat: m.lat, lng: m.lng, kubelek: m.priority }));

  return (
    <div className="min-h-screen bg-background">
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
              Tablica od {tablica.author_display || 'podróżnika'}
            </p>
            <h1 className="font-display font-light text-[40px] leading-[1.05] tracking-[-0.02em] mt-2">
              {tablica.name}
            </h1>
            <p className="font-mono text-[12px] tabular-nums text-muted-foreground mt-2">
              {[tablica.destination,
                tablica.days ? `${tablica.days} dni` : null,
                tablica.start_date ? zakresDat(tablica.start_date, tablica.end_date) : null,
                `${miejsca.length} miejsc`,
              ].filter(Boolean).join(' · ')}
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button onClick={przelaczPolubienie}
              aria-pressed={polubiona}
              className={`h-10 inline-flex items-center gap-2 rounded-full border px-4 text-sm
                          transition-colors ${polubiona
                            ? 'border-accent bg-accent/10 text-accent'
                            : 'border-border bg-card hover:bg-muted'}`}>
              <Heart className={`w-4 h-4 ${polubiona ? 'fill-accent' : ''}`} />
              {tablica.like_count ?? 0}
            </button>
            <Button onClick={skopiujDoSiebie} disabled={kopiuje}
              className="h-10 bg-primary hover:bg-primary/90">
              {kopiuje
                ? <><Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> Kopiuję…</>
                : <><Copy className="w-4 h-4 mr-1.5" /> Skopiuj do siebie</>}
            </Button>
          </div>
        </div>

        <div className="grid gap-3 md:grid-cols-3 mt-8">
          {KUBELKI.map((k) => {
            const swoje = miejsca.filter((m) => m.priority === k.id);
            if (swoje.length === 0) return null;
            return (
              <div key={k.id} className="rounded-md border border-border bg-card overflow-hidden">
                <div className="flex items-center justify-between px-4 py-3 border-b border-border">
                  <span className="font-narrow uppercase tracking-[0.18em] text-[10px] text-muted-foreground
                                   flex items-center gap-2">
                    <span className={`w-2 h-2 rounded-full ${k.kolor}`} /> {k.label}
                  </span>
                  <span className="font-mono text-[12px] tabular-nums text-muted-foreground">
                    {swoje.length}
                  </span>
                </div>
                <div className="divide-y divide-border">
                  {swoje.map((m) => (
                    <div key={m.id} className="px-4 py-3 flex gap-3">
                      <div className="w-11 h-11 rounded-sm overflow-hidden bg-muted shrink-0">
                        {m.image_url
                          ? <img src={m.image_url} alt="" loading="lazy" className="w-full h-full object-cover" />
                          : <div className="w-full h-full flex items-center justify-center text-muted-foreground/40">
                              <MapPin className="w-4 h-4" />
                            </div>}
                      </div>
                      <div className="min-w-0">
                        <div className="font-display text-[15px] leading-snug">{m.name}</div>
                        {m.description && (
                          <div className="text-xs text-muted-foreground line-clamp-2 mt-0.5">
                            {m.description}
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}

          {naMapie.length > 0 && (
            <div className="rounded-md border border-border bg-card overflow-hidden
                            flex flex-col self-start md:sticky md:top-[88px]">
              <div className="px-3 py-2.5 border-b border-border font-narrow uppercase
                              tracking-[0.18em] text-[10px] text-muted-foreground">
                Rozrzut miejsc
              </div>
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
