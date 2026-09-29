import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowUpRight, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { useTranslation } from 'react-i18next';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import PlannerHeader from '@/components/PlannerHeader';
import SEO from '@/components/SEO';
import AgentDymek from '@/components/AgentDymek';
import TablicaKafelek from '@/components/TablicaKafelek';
import Zdjecie from '@/components/Zdjecie';
import { Button } from '@/components/ui/button';
import { miniatura, SZEROKOSC } from '@/lib/zdjecia';
import { wyroznikMiejsca } from '@/lib/opis';
import { utworzWyjazd } from '@/lib/newTrip';
import { zdarzenie } from '@/lib/zdarzenia';
import {
  slugMiasta, tytulMiasta, coSieZmiesci, sumaMinut, dniNaZwiedzanie, czasZwiedzania, GODZIN_DZIENNIE,
} from '@/lib/miasta';

interface MiejsceMiasta {
  id: string; slug: string; name: string; city: string;
  photos: string[] | null; visit_minutes: number | null; opening_hours: string | null;
  wyroznik: string | null; wyroznik_i18n: Record<string, string> | null; waznosc: number | null;
}
interface TablicaMiasta {
  id: string; name: string; days: number | null; is_example: boolean | null;
  author_display: string | null; place_count: number; photos: string[];
}

/** Tyle miejsc liczy strona — tyle samo co treść dla robotów w API (wizytowkaMiasta). */
const ILE_MIEJSC = 12;

const KLIMATY = ['family', 'couple', 'business', 'friends', 'solo'] as const;

/**
 * „Co zobaczyć” to kategoria attraction, ale OSM wrzuca do niej też kina,
 * parkingi i elektrownie — te odsiewamy. Rodzaj „attraction” sam w sobie jest
 * tylko jednym z ~40 (muzea, kościoły, zamki mają własne), więc filtr po `kind`
 * zgubiłby połowę miasta. Ta sama lista w API (wizytowkaMiasta).
 */
const RODZAJE_POZA = '(cinema,parking,power_plant)';

/**
 * Strona miasta: „co zobaczyć w…” z liczbami, których nie podają blogi —
 * czas zwiedzania każdego miejsca, suma i odpowiedź na „ile dni”. Publiczna,
 * bez logowania: to na nią prowadzą wyszukiwarka i posty, a /odkrywaj wymaga konta.
 *
 * Treść dla robotów bez JavaScriptu składa API (services/wizytowki.ts,
 * wizytowkaMiasta) z tych samych danych i tą samą arytmetyką (lib/miasta.ts).
 */
export default function Miasto() {
  const { t, i18n } = useTranslation();
  const { slug = '' } = useParams<{ slug: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();

  const [miasto, setMiasto] = useState<string | null>(null);
  const [miasta, setMiasta] = useState<string[]>([]);
  const [miejsca, setMiejsca] = useState<MiejsceMiasta[]>([]);
  const [tablice, setTablice] = useState<TablicaMiasta[]>([]);
  const [wczytuje, setWczytuje] = useState(true);
  const [klimat, setKlimat] = useState<string>('couple');
  const [zakladam, setZakladam] = useState(false);

  useEffect(() => {
    let aktualne = true;
    (async () => {
      setWczytuje(true);
      const { data: lista } = await supabase.rpc('catalog_cities');
      const nazwy = ((lista ?? []) as { city: string }[]).map((r) => r.city);
      const znalezione = nazwy.find((n) => slugMiasta(n) === slug) ?? null;
      if (!aktualne) return;
      setMiasta(nazwy);
      setMiasto(znalezione);
      if (!znalezione) { setWczytuje(false); return; }

      const [{ data: kat }, { data: tab }] = await Promise.all([
        supabase.from('place_catalog')
          .select('id, slug, name, city, photos, visit_minutes, opening_hours, wyroznik, wyroznik_i18n, waznosc')
          .eq('city', znalezione).eq('category', 'attraction').not('kind', 'in', RODZAJE_POZA)
          .neq('status', 'hidden')
          .order('waznosc', { ascending: false, nullsFirst: false })
          .limit(ILE_MIEJSC * 2),
        supabase.from('trip_projects')
          .select('id, name, days, is_example, author_display, like_count, copy_count')
          .eq('is_public', true).ilike('destination', znalezione).limit(12),
      ]);
      // Miejsce bez zdjęcia na stronie „co zobaczyć” wygląda jak błąd, a nie jak atrakcja.
      const zeZdjeciem = ((kat ?? []) as MiejsceMiasta[]).filter((m) => m.photos?.length).slice(0, ILE_MIEJSC);

      let kafelki: TablicaMiasta[] = [];
      if (tab?.length) {
        const { data: pl } = await supabase.from('trip_project_places')
          .select('project_id, image_url, priority').in('project_id', tab.map((x: any) => x.id));
        kafelki = tab.map((x: any) => {
          const swoje = (pl ?? []).filter((p: any) => p.project_id === x.id && p.priority !== 'rejected');
          return {
            ...x, place_count: swoje.length,
            photos: swoje.filter((p: any) => p.image_url).slice(0, 3).map((p: any) => p.image_url),
          };
        }).filter((x) => x.place_count >= 3)
          .sort((a, b) => Number(!!b.is_example) - Number(!!a.is_example) || b.place_count - a.place_count);
      }
      if (!aktualne) return;
      setMiejsca(zeZdjeciem);
      setTablice(kafelki);
      setWczytuje(false);
    })();
    return () => { aktualne = false; };
  }, [slug]);

  const polski = (i18n.language || 'pl').startsWith('pl');
  const naglowek = miasto ? (polski ? tytulMiasta(miasto) : t('miasto.co_zobaczyc', { miasto })) : '';
  const suma = useMemo(() => sumaMinut(miejsca), [miejsca]);
  const dni = dniNaZwiedzanie(suma.minuty);
  const warianty = useMemo(() => [1, 2, 3].map((d) => ({ dni: d, ...coSieZmiesci(miejsca, d) })), [miejsca]);

  const zacznij = async () => {
    if (!miasto || zakladam) return;
    zdarzenie('zacznij_planowanie', { miasto, zrodlo: 'strona_miasta', klimat });
    if (!user) {
      sessionStorage.setItem('rm_zamiar', JSON.stringify({ cel: miasto, klimat }));
      return navigate('/auth?redirect=/start');
    }
    setZakladam(true);
    try {
      const id = await utworzWyjazd({ cel: miasto, klimat });
      navigate(id ? `/odkrywaj?wyjazd=${id}` : '/odkrywaj');
    } catch (e: any) {
      toast.error(e.message || t('miasto.blad_zakladania'));
    } finally {
      setZakladam(false);
    }
  };

  if (wczytuje) return (
    <div className="min-h-screen bg-background">
      <PlannerHeader />
      <div className="flex items-center justify-center py-32 text-muted-foreground">
        <Loader2 className="w-5 h-5 animate-spin mr-2" /> {t('miasto.wczytuje')}
      </div>
    </div>
  );

  if (!miasto) return (
    <div className="min-h-screen bg-background">
      <SEO title={t('miasto.nie_znaleziono')} noIndex />
      <PlannerHeader />
      <div className="flex flex-col items-center justify-center py-32 gap-4 px-6 text-center">
        <p className="text-muted-foreground">{t('miasto.nie_znaleziono')}</p>
        <Button onClick={() => navigate('/tablice')}>{t('miasto.zobacz_tablice')}</Button>
      </div>
    </div>
  );

  const inneMiasta = miasta.filter((m) => m !== miasto);

  return (
    <div className="min-h-screen bg-background">
      <SEO
        title={`${naglowek} — ${t('landing.ile_miejsc', { count: miejsca.length })}`}
        description={t('miasto.opis_seo', {
          miasto, ile: t('landing.ile_miejsc', { count: miejsca.length }),
          czas: czasZwiedzania(suma.minuty), dni: t('miasto.ile_dni', { count: dni }),
        })}
        image={miejsca[0]?.photos?.[0] ? miniatura(miejsca[0].photos[0], SZEROKOSC.bohater) : undefined}
        url={`/miasto/${slug}`}
      />
      <PlannerHeader />

      <main className="max-w-[1160px] mx-auto px-5 sm:px-6 pt-8 pb-24">
        {/* Nagłówek z liczbami: od nich zależy, czy ktoś zostanie na stronie. */}
        <header className="grid grid-cols-1 lg:grid-cols-[1fr_420px] gap-8 items-end">
          <div className="min-w-0">
            <p className="text-[12px] font-bold text-muted-foreground">{t('miasto.nadtytul')}</p>
            <h1 className="font-display text-[clamp(34px,5vw,52px)] leading-[1.04] mt-2 text-balance">{naglowek}</h1>
            <p className="font-mono tabular-nums text-[14px] text-muted-foreground mt-4">
              {[t('landing.ile_miejsc', { count: miejsca.length }),
                t('miasto.czas_zwiedzania', { czas: czasZwiedzania(suma.minuty) }),
                t('miasto.ile_dni', { count: dni })].join(' · ')}
            </p>
          </div>
          <AgentDymek>
            {t('miasto.wniosek', {
              ile: t('landing.ile_miejsc', { count: miejsca.length }),
              czas: czasZwiedzania(suma.minuty), godzin: GODZIN_DZIENNIE,
              dni: t('miasto.ile_dni', { count: dni }),
            })}
            {suma.bezCzasu > 0 && ` ${t('miasto.brak_czasu', { count: suma.bezCzasu })}`}
          </AgentDymek>
        </header>

        {/* Ile dni: odpowiedź policzona z katalogu, z zastrzeżeniem przy wyniku. */}
        <section className="mt-12" aria-labelledby="ile-dni">
          <h2 id="ile-dni" className="font-display text-[26px]">{t('miasto.ile_dni_tytul')}</h2>
          <p className="text-[15px] text-muted-foreground mt-2 max-w-[70ch] text-pretty">
            {t('miasto.ile_dni_opis', { godzin: GODZIN_DZIENNIE })}
          </p>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-5">
            {warianty.map((w) => (
              <div key={w.dni} className="rounded-lg bg-card p-5 shadow-token-md min-w-0">
                <div className="flex items-baseline justify-between gap-3">
                  <h3 className="font-display text-[22px]">{t('miasto.ile_dni', { count: w.dni })}</h3>
                  <span className="font-mono tabular-nums text-[13px] text-muted-foreground">
                    {czasZwiedzania(w.minuty)}
                  </span>
                </div>
                <ol className="mt-3 space-y-1.5 text-[14.5px]">
                  {w.miejsca.map((m) => (
                    <li key={m.id} className="flex gap-2 min-w-0">
                      <span className="mt-[7px] w-2 h-2 rounded-full bg-primary shrink-0" aria-hidden="true" />
                      <span className="min-w-0">{m.name}
                        <span className="text-muted-foreground font-mono tabular-nums text-[12.5px]"> · {czasZwiedzania(m.visit_minutes)}</span>
                      </span>
                    </li>
                  ))}
                </ol>
              </div>
            ))}
          </div>
        </section>

        {/* Miejsca w kolejności rozpoznawalności — numer niesie tę kolejność. */}
        <section className="mt-14" aria-labelledby="miejsca">
          <h2 id="miejsca" className="font-display text-[26px]">{t('miasto.miejsca_tytul')}</h2>
          <p className="text-[13px] text-muted-foreground mt-1">{t('miasto.zrodlo')}</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5 mt-5">
            {miejsca.map((m, i) => (
              <a key={m.id} href={`/miejsce/${m.slug}`}
                onClick={(e) => { e.preventDefault(); navigate(`/miejsce/${m.slug}`); }}
                className="group rounded-lg bg-card overflow-hidden shadow-token-md hover:shadow-token-lg transition-shadow
                           flex flex-col min-w-0 focus-visible:ring-2 focus-visible:ring-ring outline-none">
                <div className="relative aspect-[4/3] bg-placeholder-photo">
                  <Zdjecie src={m.photos?.[0]} gdzie="karta" alt={m.name} className="w-full h-full object-cover" />
                  <span className="absolute left-3 top-3 rounded-full bg-card px-2.5 py-0.5 text-[12px] font-mono tabular-nums shadow-token-sm">
                    {String(i + 1).padStart(2, '0')}
                  </span>
                </div>
                <div className="p-4 flex flex-col gap-2 min-w-0">
                  <h3 className="font-display text-[19px] leading-snug group-hover:underline underline-offset-4">{m.name}</h3>
                  <div className="flex flex-wrap gap-1.5">
                    {m.visit_minutes ? (
                      <span className="rounded-full bg-secondary px-2.5 py-0.5 text-[12.5px] font-mono tabular-nums">
                        {t('miasto.czas_zwiedzania', { czas: czasZwiedzania(m.visit_minutes) })}
                      </span>
                    ) : null}
                  </div>
                  {wyroznikMiejsca(m) && (
                    <p className="text-[14px] leading-relaxed text-foreground/85 text-pretty">{wyroznikMiejsca(m)}</p>
                  )}
                  {m.opening_hours && (
                    <p className="text-[12.5px] text-muted-foreground font-mono break-words">
                      {t('miasto.godziny')}: {m.opening_hours}
                    </p>
                  )}
                </div>
              </a>
            ))}
          </div>
        </section>

        {tablice.length > 0 && (
          <section className="mt-14" aria-labelledby="tablice">
            <h2 id="tablice" className="font-display text-[26px]">{t('miasto.tablice_tytul')}</h2>
            <p className="text-[15px] text-muted-foreground mt-2">{t('miasto.tablice_opis')}</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5 mt-5">
              {tablice.map((tb) => (
                <TablicaKafelek key={tb.id}
                  nazwa={tb.name}
                  meta={[t('landing.ile_miejsc', { count: tb.place_count }), tb.days ? t('miasto.ile_dni', { count: tb.days }) : null].filter(Boolean).join(' · ')}
                  zdjecia={tb.photos}
                  przyklad={!!tb.is_example}
                  autor={tb.is_example ? null : tb.author_display || 'Podróżnik'}
                  onClick={() => navigate(`/tablica/${tb.id}`)} />
              ))}
            </div>
          </section>
        )}

        {/* Wejście do planowania — ta sama droga co pole na stronie głównej. */}
        <section className="mt-14 rounded-xl bg-foreground text-background p-6 sm:p-8" aria-labelledby="zaplanuj">
          <h2 id="zaplanuj" className="font-display text-[28px] text-background">{t('miasto.cta_tytul', { miasto })}</h2>
          <p className="text-[15.5px] text-background/80 mt-2 max-w-[62ch] text-pretty">{t('miasto.cta_opis')}</p>
          <div className="flex flex-wrap items-center gap-2 mt-5">
            <span className="text-[13px] text-background/70 mr-1">{t('landing.jade')}</span>
            {KLIMATY.map((k) => (
              <button key={k} onClick={() => setKlimat(k)} aria-pressed={klimat === k}
                className={`rounded-full px-3.5 h-9 [@media(pointer:coarse)]:h-11 text-[13.5px] font-medium transition-colors
                  focus-visible:ring-2 focus-visible:ring-background outline-none ${
                  klimat === k ? 'bg-background text-foreground' : 'bg-background/10 text-background hover:bg-background/20'}`}>
                {t(`landing.klimat.${k}`)}
              </button>
            ))}
          </div>
          <Button onClick={zacznij} disabled={zakladam} size="lg"
            className="mt-5 bg-background text-foreground hover:bg-background/90">
            {zakladam ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
            {t('miasto.cta_przycisk')} <ArrowUpRight className="w-4 h-4 ml-1.5" />
          </Button>
        </section>

        {inneMiasta.length > 0 && (
          <nav className="mt-14" aria-labelledby="inne-miasta">
            <h2 id="inne-miasta" className="font-display text-[22px]">{t('miasto.inne_miasta')}</h2>
            <ul className="flex flex-wrap gap-2 mt-4">
              {inneMiasta.map((m) => (
                <li key={m}>
                  <a href={`/miasto/${slugMiasta(m)}`}
                    onClick={(e) => { e.preventDefault(); navigate(`/miasto/${slugMiasta(m)}`); window.scrollTo(0, 0); }}
                    className="inline-flex rounded-full bg-card px-3.5 py-1.5 text-[14px] shadow-token-xs hover:shadow-token-sm
                               focus-visible:ring-2 focus-visible:ring-ring outline-none">
                    {m}
                  </a>
                </li>
              ))}
            </ul>
          </nav>
        )}
      </main>
    </div>
  );
}
