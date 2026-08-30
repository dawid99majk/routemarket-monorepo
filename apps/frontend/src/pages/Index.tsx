import { Fragment, useEffect, useMemo, useState } from 'react';
import Zdjecie from '@/components/Zdjecie';
import { useNavigate } from 'react-router-dom';
import { ArrowRight, ArrowUpRight, Heart, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { utworzWyjazd } from '@/lib/newTrip';
import PlannerHeader from '@/components/PlannerHeader';
import Logo from '@/components/Logo';
import contour from '@/assets/patterns/contour.svg';
import TablicaKafelek from '@/components/TablicaKafelek';
import { toast } from 'sonner';
import { useTranslation } from 'react-i18next';

/** Klimaty w brzmieniu z landingu; identyfikatory te same, co w presetach planera. */
const KLIMATY = [
  { id: 'family', klucz: 'landing.klimat.family' },
  { id: 'couple', klucz: 'landing.klimat.couple' },
  { id: 'business', klucz: 'landing.klimat.business' },
  { id: 'friends', klucz: 'landing.klimat.friends' },
  { id: 'solo', klucz: 'landing.klimat.solo' },
];

const KROKI = ['01', '02', '03', '04'];

const PLAN_DEMO = [
  ['14:20', 'Amfiteatr w Durrës', 'landing.demo.poz1'],
  ['16:05', 'Forum bizantyjskie', 'landing.demo.poz2'],
  ['16:45', 'Wieża Wenecka', 'landing.demo.poz3'],
  ['17:35', 'Promenada Durrës', 'landing.demo.poz4'],
];

const DNI = [
  { nr: 1, przystanki: ['Amfiteatr', 'Forum bizantyjskie', 'Wieża Wenecka', 'Promenada'] },
  { nr: 2, przystanki: ['Plaża Golem', 'Park zabaw Adriatik', 'Bazar rybny'] },
  { nr: 3, przystanki: ['Muzeum Archeologiczne', 'Mury Kalaja', 'Plaża Currila'] },
];

const GPX_PRZYKLAD = `<gpx version="1.1" creator="Routemarket">
  <metadata><name>Durrës · dzień 1</name></metadata>
  <wpt lat="41.31278" lon="19.44139">
    <name>Amfiteatr w Durrës</name>
    <desc>14:20 · 1 g 30 min</desc>
  </wpt>
  <trk><name>Trasa pieszo · 3,8 km</name></trk>
</gpx>`;

const KANALY = ['zegarek', 'mapy', 'nawigacja'];

const FAQ = ['zrodla', 'przeciazenie', 'poza_europa', 'aplikacja'];

const NAWIGACJA = [
  ['naglowek.odkrywaj', '/odkrywaj'],
  ['landing.nav.jak', '#jak-to-dziala'],
  ['naglowek.inspiracje', '/tablice'],
  ['landing.nav.gpx', '#gpx'],
];

interface Tablica {
  id: string; name: string; destination: string | null; author_display: string | null;
  copy_count: number; like_count: number | null; place_count: number; photos?: string[];
}

export default function Index() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [cel, setCel] = useState('');
  const [klimat, setKlimat] = useState('family');
  const [tablice, setTablice] = useState<Tablica[]>([]);
  const [zakladam, setZakladam] = useState(false);
  const [szukajTablic, setSzukajTablic] = useState('');
  const [ileWKatalogu, setIleWKatalogu] = useState<number | null>(null);

  useEffect(() => {
    (async () => {
      const { count } = await supabase.from('place_catalog')
        .select('id', { count: 'exact', head: true });
      if (typeof count === 'number') setIleWKatalogu(count);
    })();
  }, []);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.from('trip_projects')
        .select('id, name, destination, author_display, copy_count, like_count')
        .eq('is_public', true).limit(12);
      if (!data?.length) return setTablice([]);
      const { data: miejsca } = await supabase.from('trip_project_places')
        .select('project_id, image_url').in('project_id', data.map((b: any) => b.id));
      const popularnosc = (b: any) => (b.like_count ?? 0) + (b.copy_count ?? 0) * 2;
      setTablice([...data].sort((a: any, b: any) => popularnosc(b) - popularnosc(a)).map((b: any) => {
        const swoje = (miejsca ?? []).filter((m: any) => m.project_id === b.id);
        return {
          ...b,
          place_count: swoje.length,
          photos: swoje.filter((m: any) => m.image_url).slice(0, 3).map((m: any) => m.image_url),
        };
      }));
    })();
  }, []);

  /**
   * Jedna droga z obu pól destynacji. Projekt zakłada planowanie bez rejestracji,
   * ale feed wymaga konta — więc zamiast udawać, że go nie wymaga, zapamiętujemy
   * zamiar i wracamy do niego zaraz po zalogowaniu.
   */
  /**
   * Wpisanie miasta ma od razu zaczynać planowanie, a nie prowadzić do kolejnego
   * formularza z tym samym pytaniem. Zalogowanemu zakładamy wyjazd tu i teraz
   * i przenosimy prosto do miejsc; niezalogowany odkłada zamiar na czas logowania.
   */
  const zacznij = async () => {
    if (!cel.trim() || zakladam) return;
    if (!user) {
      sessionStorage.setItem('rm_zamiar', JSON.stringify({ cel: cel.trim(), klimat }));
      // Bez wskazania celu logowanie odsyła na stronę główną, a ta zamiaru nie
      // czyta — odczytuje go Start. Miasto wpisane przed rejestracją ginęło.
      return navigate('/auth?redirect=/start');
    }
    setZakladam(true);
    try {
      await utworzWyjazd({ cel: cel.trim(), klimat });
      navigate('/odkrywaj?nowy=1');
    } catch (e: any) {
      toast.error(e.message || 'Nie udało się założyć wyjazdu');
    } finally {
      setZakladam(false);
    }
  };

  /** Zdjęcia do kart pływających w hero — z tablic, które strona i tak wczytuje. */
  const zdjeciaHero = useMemo(
    () => tablice.flatMap((tb) => tb.photos ?? []).filter(Boolean).slice(0, 4),
    [tablice]);

  const poleDestynacji = (
    <div className="flex gap-2 rounded-md bg-card border border-border shadow-token-sm p-2 max-w-[560px]">
      <input value={cel} onChange={(e) => setCel(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && zacznij()}
        placeholder={t('landing.dokad')}
        className="flex-1 min-w-0 bg-transparent px-3 h-11 text-[16px] outline-none placeholder:text-muted-foreground" />
      <Button onClick={zacznij} disabled={zakladam}
        className="bg-foreground text-background hover:bg-foreground/90 shrink-0 h-11 px-5">
        {zakladam ? t('landing.zakladam') : t('landing.cta_glowne')}
      </Button>
    </div>
  );

  return (
    <div className="min-h-screen bg-background">
      {/* Zalogowany dostaje ten sam pasek co w całej aplikacji. Wcześniej strona
          główna miała własną nawigację kotwicową, więc po wejściu tutaj z planera
          znikały wszystkie zakładki i trzeba było szukać drogi powrotnej.
          Niezalogowany widzi nawigację sprzedażową — zakładki planera nie miałyby
          dla niego sensu, bo każda prowadzi do ekranu za logowaniem. */}
      {user && <PlannerHeader />}

      {!user && (
      <header className="sticky top-0 z-30 h-[74px] border-b border-border bg-surface/90 backdrop-blur-[8px]">
        <div className="max-w-[1280px] mx-auto h-full px-5 sm:px-10 flex items-center gap-4 sm:gap-8">
          <Logo size="md" />
          <nav className="hidden lg:flex items-center gap-6">
            {NAWIGACJA.map(([label, href]) => (
              href.startsWith('/')
                ? <button key={href} onClick={() => navigate(href)}
                    className="text-sm text-muted-foreground hover:text-foreground transition-colors">{t(label)}</button>
                : <a key={href} href={href}
                    className="text-sm text-muted-foreground hover:text-foreground transition-colors">{t(label)}</a>
            ))}
          </nav>
          <div className="ml-auto flex items-center gap-2">
            <Button size="sm" variant="outline" className="hidden sm:inline-flex" onClick={() => navigate('/auth')}>{t('common.login')}</Button>
            <Button size="sm" onClick={() => navigate('/auth')} className="bg-foreground text-background hover:bg-foreground/90">
              {t('landing.cta_naglowek')}
            </Button>
          </div>
        </div>
      </header>
      )}

      {/* 1. Hero — kompozycja wyśrodkowana (wariant 3c).
          Pole wyszukiwania stoi w środku, treść produktu pływa dookoła. Cztery
          reguły z kierunek.md, bez których układ rozjeżdża się w równą rozsypkę:
          trzy plany głębi (rozmiar i cień zmieniają się RAZEM), dwie–trzy karty
          przycięte krawędzią, najwyżej jedna karta z pełnym zdaniem, dokładnie
          dwa kolorowe wypełnienia (orzech i terakota).

          Karty pływające pokazujemy dopiero od xl: pakiet jest desktopowy (1300 px),
          a niżej nie ma ich gdzie przyciąć, żeby nie zasłoniły nagłówka. Poniżej
          zostaje sam środek, który niesie całą funkcję. */}
      <main id="gora">
        <section className="relative overflow-hidden bg-background flex flex-col items-center justify-center
                            px-5 py-[72px] xl:py-0 xl:h-[660px]">
          <div aria-hidden
            className="pointer-events-none absolute left-1/2 -top-[180px] w-[1120px] h-[1120px] -ml-[560px]
                       opacity-[0.14] bg-no-repeat"
            style={{ backgroundImage: `url(${contour})`, backgroundSize: '1120px auto' }} />

          {/* ── plan daleki: samo zdjęcie, bez tytułu, shadow-sm ── */}
          <div aria-hidden className="hidden xl:block absolute left-[56px] top-[58px] w-[132px] rotate-[5deg]
                          rounded-[9px] bg-card p-[7px] shadow-token-sm">
            <div className="h-[84px] rounded-[6px] overflow-hidden bg-placeholder-photo">
              {zdjeciaHero[0] && <Zdjecie src={zdjeciaHero[0]} gdzie="kafelek" alt="" className="w-full h-full object-cover" />}
            </div>
          </div>
          <div aria-hidden className="hidden xl:block absolute right-[250px] top-[74px] w-[140px] rotate-[-5deg]
                          rounded-[9px] bg-card p-[7px] shadow-token-sm">
            <div className="h-[90px] rounded-[6px] overflow-hidden bg-placeholder-photo">
              {zdjeciaHero[1] && <Zdjecie src={zdjeciaHero[1]} gdzie="kafelek" alt="" className="w-full h-full object-cover" />}
            </div>
          </div>

          {/* ── plan środkowy ── */}
          <div aria-hidden className="hidden xl:block absolute left-[198px] top-[150px] w-[172px] rotate-[-4deg]
                          rounded-[10px] bg-card p-[9px] shadow-token-md">
            <div className="h-[112px] rounded-[7px] overflow-hidden bg-placeholder-photo">
              {zdjeciaHero[2] && <Zdjecie src={zdjeciaHero[2]} gdzie="kafelek" alt="" className="w-full h-full object-cover" />}
            </div>
            <div className="text-[13px] leading-[1.3] font-medium mt-[9px] mx-[2px]">Wieża Wenecka</div>
          </div>

          {/* ── plan bliski, przycięty lewą krawędzią ── */}
          <div aria-hidden className="hidden xl:block absolute left-[-58px] top-[238px] w-[272px] rotate-[-6deg]
                          rounded-[10px] bg-card p-[11px] shadow-token-lg">
            <div className="h-[178px] rounded-[7px] overflow-hidden bg-placeholder-photo">
              {zdjeciaHero[3] && <Zdjecie src={zdjeciaHero[3]} gdzie="karta" alt="" className="w-full h-full object-cover" />}
            </div>
            <div className="text-[17px] leading-[1.3] font-medium mt-[13px] mx-[3px]">Amfiteatr w Durrës</div>
            <div className="font-mono text-[11px] leading-[1.3] text-muted-foreground mt-[7px] mx-[3px]">
              1 g 30 min · rzymski · cień po 15:00
            </div>
          </div>

          {/* ── wypełnienie 1 z 2: orzech ── */}
          <div aria-hidden className="hidden xl:block absolute left-[238px] top-[404px] w-[158px] rotate-[6deg]
                          rounded-[9px] bg-foreground text-background px-[14px] py-[13px] shadow-token-md">
            <div className="font-narrow uppercase tracking-[0.26em] text-[9px] text-background/50">Tablica</div>
            <div className="flex items-baseline gap-[7px] mt-[10px]">
              <span className="font-display font-light text-[30px] leading-none tabular-nums">12</span>
              <span className="text-[11px] text-background/50">na pewno</span>
            </div>
            <div className="h-[3px] rounded-full bg-background/15 mt-[12px] overflow-hidden">
              <div className="w-[70%] h-full bg-accent" />
            </div>
          </div>

          {/* ── przycięta dolną krawędzią ── */}
          <div aria-hidden className="hidden xl:flex absolute left-[126px] top-[606px] w-[210px] rotate-[-3deg]
                          rounded-[9px] bg-card px-[14px] py-[11px] items-center gap-[11px] shadow-token-lg">
            <span className="w-[30px] h-[30px] rounded-[7px] bg-muted flex items-center justify-center
                             text-[13px] text-secondary shrink-0">↓</span>
            <span className="min-w-0">
              <span className="block font-mono text-[12px] leading-[1.2] truncate">durres-dzien-1.gpx</span>
              <span className="block font-mono text-[10px] leading-[1.2] text-muted-foreground mt-[3px]">3,8 km · +46 m</span>
            </span>
          </div>

          {/* ── plan dnia, przycięty prawą krawędzią ── */}
          <div aria-hidden className="hidden xl:block absolute right-[-62px] top-[158px] w-[268px] rotate-[6deg]
                          rounded-[10px] bg-card px-[19px] py-[17px] shadow-token-lg">
            <div className="flex items-baseline justify-between">
              <span className="font-narrow uppercase tracking-[0.26em] text-[9px] text-muted-foreground">Dzień 1</span>
              <span className="font-mono text-[10px] text-accent">3 g 25</span>
            </div>
            <div className="grid grid-cols-[44px_1fr] gap-x-3 gap-y-[7px] mt-[14px] items-baseline">
              {PLAN_DEMO.map(([godz, nazwa]) => (
                <Fragment key={nazwa}>
                  <span className="font-mono text-[11px] leading-[1.5] tabular-nums text-muted-foreground">{godz}</span>
                  <span className="text-[14px] leading-[1.5] truncate">{nazwa.replace(' w Durrës', '').replace(' Durrës', '')}</span>
                </Fragment>
              ))}
            </div>
          </div>

          <div aria-hidden className="hidden xl:block absolute right-[242px] top-[368px] w-[126px] rotate-[7deg]
                          rounded-full bg-card px-[14px] py-[8px] shadow-token-sm
                          font-mono text-[11px] text-secondary text-center">870 m pieszo</div>

          {/* ── wypełnienie 2 z 2: terakota, i jedyna karta z pełnym zdaniem ── */}
          <div aria-hidden className="hidden xl:block absolute right-[88px] top-[454px] w-[214px] rotate-[-4deg]
                          rounded-[10px] bg-accent px-[17px] py-[16px] shadow-token-lg">
            <div className="font-narrow uppercase tracking-[0.26em] text-[9px] text-accent-foreground/70">Agent zauważa</div>
            <div className="text-[14px] leading-[1.45] text-accent-foreground mt-[9px] text-pretty">
              Czwarty punkt by się zmieścił, ale to dużo schodów jak na jedno popołudnie.
            </div>
          </div>

          {/* ── kolumna środkowa: nad kartami, ona niesie funkcję ── */}
          <div className="relative z-10 w-full flex flex-col items-center">
            {ileWKatalogu != null && (
              <div className="flex items-center gap-[9px] rounded-full bg-card/70 border border-border
                              px-[15px] py-[7px]">
                <span className="w-1.5 h-1.5 rounded-full bg-accent" />
                <span className="text-[12px] text-secondary">
                  {ileWKatalogu.toLocaleString('pl-PL')} miejsc z OpenStreetMap
                </span>
              </div>
            )}

            <h1 className="font-display font-normal text-center text-balance mt-[26px]
                           tracking-[-0.04em] leading-[0.98] max-w-[14ch]
                           text-[clamp(42px,6vw,76px)]">
              {t('landing.hero.tytul')}
            </h1>

            <div className="w-full max-w-[560px] mt-[34px] rounded-[12px] bg-card border border-border
                            shadow-token-lg p-[18px] pb-[14px]">
              <div className="flex gap-2">
                <input value={cel} onChange={(e) => setCel(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && zacznij()}
                  placeholder={t('landing.dokad')}
                  className="flex-1 min-w-0 bg-transparent px-1 h-11 text-[17px] outline-none
                             placeholder:text-muted-foreground" />
                <Button onClick={zacznij} disabled={zakladam}
                  className="bg-foreground text-background hover:bg-foreground/90 shrink-0 h-11 px-5">
                  {zakladam ? t('landing.zakladam') : t('landing.cta_glowne')}
                </Button>
              </div>
              <div className="flex flex-wrap items-center gap-1.5 mt-3.5">
                <span className="text-[13px] text-muted-foreground mr-1">{t('landing.jade')}</span>
                {KLIMATY.map((k) => (
                  <button key={k.id} onClick={() => setKlimat(k.id)}
                    className={`rounded-full px-3.5 py-1.5 text-[13px] transition-colors ${
                      klimat === k.id
                        ? 'bg-foreground text-background'
                        : 'text-secondary hover:bg-muted'
                    }`}>
                    {t(k.klucz)}
                  </button>
                ))}
              </div>
            </div>

            <p className="font-mono text-[12px] text-muted-foreground mt-5 text-center">
              {t('landing.hero.zapewnienia')}
            </p>
          </div>
        </section>
      </main>

      {/* 2. Jak to działa */}
      <section id="jak-to-dziala" className="bg-card border-y border-border">
        <div className="max-w-[1280px] mx-auto px-5 sm:px-10 py-20">
          <p className="font-narrow uppercase tracking-[0.32em] text-[11px] text-muted-foreground">{t('landing.nav.jak')}</p>
          <h2 className="font-display font-light mt-3 text-[clamp(30px,3.1vw,40px)] leading-tight text-balance">
            Cztery kroki od pomysłu do trasy w zegarku
          </h2>
          <div className="mt-12 border-t border-border grid [grid-template-columns:repeat(auto-fit,minmax(min(100%,230px),1fr))]">
            {KROKI.map((nr, i) => (
              <div key={nr} className={`pt-6 pb-2 px-6 ${i > 0 ? 'md:border-l border-border' : 'md:pl-0'}`}>
                <span className="font-mono text-[13px] tabular-nums text-primary">{nr}</span>
                <h3 className="font-display text-[20px] mt-3 leading-snug">{t(`landing.krok.${nr}.tytul`)}</h3>
                <p className="text-[14px] leading-relaxed text-muted-foreground mt-2.5 text-pretty">{t(`landing.krok.${nr}.opis`)}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* 3. Prawdziwy przykład */}
      <section id="przyklad" className="max-w-[1280px] mx-auto px-5 sm:px-10 py-[88px]
                                        grid gap-12 [grid-template-columns:repeat(auto-fit,minmax(min(100%,380px),1fr))] items-start">
        <div className="lg:sticky lg:top-[100px] max-w-[460px]">
          <p className="font-narrow uppercase tracking-[0.32em] text-[11px] text-muted-foreground">{t('landing.przyklad_nadtytul')}</p>
          <h2 className="font-display font-light mt-3 text-[clamp(30px,3.1vw,40px)] leading-tight text-balance">
            Trzy popołudnia w Durrës, z sześciolatkiem
          </h2>
          <p className="text-[16px] leading-relaxed text-foreground/80 mt-5 text-pretty">
            Dwanaście obejrzanych miejsc, dziewięć zapisanych, trzy odrzucone. Agent dostał jedno
            ograniczenie: start po czternastej, maksymalnie cztery godziny dziennie.
          </p>
          <p className="text-[16px] leading-relaxed text-foreground/80 mt-4 text-pretty">
            Przylądek Rodonit sam wypadł z planu — godzina drogi w jedną stronę nie mieści się
            w takim popołudniu. Agent to napisał wprost, zamiast wcisnąć go na siłę.
          </p>
          <Button variant="outline" className="mt-7" onClick={() => navigate(user ? '/plany?widok=plan' : '/auth')}>
            Zobacz cały plan <ArrowUpRight className="w-4 h-4 ml-1.5" />
          </Button>
        </div>

        <div className="space-y-4">
          {DNI.map((d) => (
            <div key={d.nr} className="rounded-md bg-card border border-border p-6">
              <h3 className="font-display text-[20px] leading-snug">{t(`landing.dzien.${d.nr}.tytul`)}</h3>
              <p className="font-mono text-[12px] tabular-nums text-muted-foreground mt-1.5">{t(`landing.dzien.${d.nr}.meta`)}</p>
              <div className="flex flex-wrap gap-1.5 mt-4">
                {d.przystanki.map((p) => (
                  <span key={p} className="rounded-full bg-muted px-3 py-1 text-[12px] text-foreground/75">{p}</span>
                ))}
              </div>
              <div className="mt-5 rounded-md bg-warning/15 border border-warning/30 px-4 py-3.5 flex items-start gap-3">
                <span className="font-narrow uppercase tracking-[0.18em] text-[10px] text-warning-foreground
                                 border border-warning/45 rounded-full px-2.5 py-1 shrink-0">{t('landing.realizm')}</span>
                <p className="text-[13px] leading-relaxed text-warning-foreground text-pretty">{t(`landing.dzien.${d.nr}.realizm`)}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* 4. Nawigacja i GPX */}
      <section id="gpx" className="bg-foreground text-background">
        <div className="max-w-[1280px] mx-auto px-5 sm:px-10 py-[88px]
                        grid gap-12 [grid-template-columns:repeat(auto-fit,minmax(min(100%,380px),1fr))] items-start">
          <div>
            <p className="font-narrow uppercase tracking-[0.32em] text-[11px] text-primary-light">{t('landing.nav.gpx')}</p>
            <h2 className="font-display font-light mt-3 text-[clamp(30px,3.1vw,40px)] leading-tight text-balance">
              Plan kończy się plikiem, nie zakładką w przeglądarce
            </h2>
            <p className="text-[16px] leading-relaxed text-primary-foreground/75 mt-5 max-w-[46ch] text-pretty">
              Trasa wychodzi z Routemarket w formacie, który rozumie sprzęt — nie tylko nasza strona.
            </p>
            <div className="mt-8">
              {KANALY.map((tytul, i) => (
                <div key={tytul} className={`py-5 ${i > 0 ? 'border-t border-primary-foreground/15' : ''}`}>
                  <h3 className="font-display text-[17px]">{t(`landing.kanal.${tytul}.tytul`)}</h3>
                  <p className="text-[14px] leading-relaxed text-primary-foreground/70 mt-1.5 text-pretty">{t(`landing.kanal.${tytul}.opis`)}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-md bg-primary-foreground/[0.05] border border-primary-foreground/15 overflow-hidden">
            <div className="px-5 py-3 border-b border-primary-foreground/15 flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <span className="font-mono text-[12px] text-primary-light">durres-dzien-1.gpx</span>
              {/* Podpis, bo bez niego wycinek pliku czyta się jak kod, który wyciekł
                  na stronę, zamiast jak dowód, że plan wychodzi w otwartym formacie. */}
              <span className="text-[12px] text-primary-foreground/55">
                fragment pliku, który pobierasz
              </span>
            </div>
            <pre className="px-5 py-4 font-mono text-[12px] leading-relaxed text-primary-foreground/80
                            whitespace-pre-wrap [overflow-wrap:anywhere]">{GPX_PRZYKLAD}</pre>
          </div>
        </div>
      </section>

      {/* 5. Tablice od podróżników — tylko gdy naprawdę są */}
      {tablice.length > 0 && (
        <section id="tablice" className="max-w-[1280px] mx-auto px-5 sm:px-10 py-[88px]">
          <div className="flex flex-wrap items-end justify-between gap-6">
            <div className="max-w-[560px]">
              <p className="font-narrow uppercase tracking-[0.32em] text-[11px] text-muted-foreground">
                Tablice od podróżników
              </p>
              <h2 className="font-display font-light mt-3 text-[clamp(30px,3.1vw,40px)] leading-tight text-balance">
                Nie zaczynaj od pustej tablicy
              </h2>
              <p className="text-[16px] leading-relaxed text-foreground/80 mt-4 text-pretty">
                Skopiuj tablicę kogoś, kto był tam przed tobą, i wyrzuć z niej to, co do ciebie nie
                pasuje. Twoje tablice możesz współdzielić z osobą, z którą jedziesz.
              </p>
            </div>
            {/* Szukanie tu, a nie dopiero w galerii: to jest pierwszy ekran i to na
                nim pada pytanie „czy ktoś już był tam, dokąd jadę". Wpisanie miasta
                przenosi do galerii z gotowym zapytaniem, zamiast filtrować pasek
                kafli, w którym i tak mieści się kilkanaście pozycji. */}
            <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
              <div className="relative flex-1 sm:flex-none min-w-0">
                <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <input
                  value={szukajTablic}
                  onChange={(e) => setSzukajTablic(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      navigate(`/tablice${szukajTablic.trim() ? `?q=${encodeURIComponent(szukajTablic.trim())}` : ''}`);
                    }
                  }}
                  placeholder={t('landing.szukaj_tablicy')}
                  className="h-10 w-full sm:w-[220px] rounded-full border border-border bg-card pl-9 pr-4
                             text-sm outline-none focus:border-primary transition-colors"
                />
              </div>
              <Button variant="outline" onClick={() =>
                navigate(`/tablice${szukajTablic.trim() ? `?q=${encodeURIComponent(szukajTablic.trim())}` : ''}`)}>
                {t('landing.przegladaj')}
              </Button>
            </div>
          </div>

          {/* Pas nachodzących kart — tylko desktop. Rozmiar, odsunięcie i cień
              maleją razem w prawo, ostatnia karta wychodzi poza prawą krawędź. */}
          <div className="hidden xl:block mt-10 -mr-10 overflow-hidden">
            <div className="flex items-start">
              {tablice.slice(0, 5).map((tb, i) => {
                const w = [250, 236, 220, 204, 190][i];
                const hFoto = [156, 146, 134, 124, 116][i];
                const ml = [0, -22, -18, -16, -14][i];
                const mt = [0, 26, 52, 78, 104][i];
                const cien = ['shadow-token-lg', 'shadow-token-md', 'shadow-token-md', 'shadow-token-sm', 'shadow-token-sm'][i];
                const obrot = ['-rotate-3', 'rotate-2', '-rotate-2', 'rotate-3', '-rotate-3'][i];
                return (
                  <button key={tb.id} onClick={() => navigate(`/tablica/${tb.id}`)}
                    style={{ width: w, marginLeft: ml, marginTop: mt, zIndex: 5 - i }}
                    className={`relative shrink-0 text-left rounded-[10px] bg-card p-2.5 ${cien} ${obrot}
                                transition-transform hover:-translate-y-1`}>
                    <div className="rounded-[7px] overflow-hidden bg-placeholder-photo"
                         style={{ height: hFoto }}>
                      {tb.photos?.[0] && (
                        <Zdjecie src={tb.photos[0]} gdzie="kafelek" alt=""
                             className="w-full h-full object-cover" />
                      )}
                    </div>
                    <div className="text-[15px] leading-[1.3] font-medium mt-3 mx-0.5 truncate">{tb.name}</div>
                    <div className="font-mono text-[11px] leading-[1.3] text-muted-foreground mt-1.5 mx-0.5 truncate">
                      {[`${tb.place_count} miejsc`, tb.author_display || 'Podróżnik'].join(' · ')}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Poniżej xl: pas przewijany poziomo, bez nachodzenia. */}
          <div className="xl:hidden">
          <div className="mt-10 -mx-5 px-5 sm:-mx-10 sm:px-10 overflow-x-auto
                          [scrollbar-width:thin] snap-x snap-mandatory">
            <div className="flex gap-5 pb-2">
              {tablice.map((t) => (
                <div key={t.id} className="w-[290px] shrink-0 snap-start">
                  <TablicaKafelek
                    nazwa={t.name}
                    meta={[t.destination, `${t.place_count} miejsc`].filter(Boolean).join(' · ')}
                    zdjecia={t.photos ?? []}
                    autor={t.author_display || 'Podróżnik'}
                    odznaka={
                      (t.like_count ?? 0) > 0 || (t.copy_count ?? 0) > 0 ? (
                        <span className="shrink-0 inline-flex items-center gap-1 rounded-full bg-muted
                                         px-2 py-0.5 text-[11px] font-mono tabular-nums text-muted-foreground">
                          <Heart className="w-3 h-3" /> {t.like_count ?? 0}
                        </span>
                      ) : undefined
                    }
                    onClick={() => navigate(`/tablica/${t.id}`)}
                  />
                </div>
              ))}
            </div>
          </div>
          </div>
        </section>
      )}

      {/* 6. Częste pytania */}
      <section className="bg-card border-y border-border">
        <div className="max-w-[1280px] mx-auto px-5 sm:px-10 py-20
                        grid gap-12 [grid-template-columns:repeat(auto-fit,minmax(min(100%,360px),1fr))] items-start">
          <div>
            <p className="font-narrow uppercase tracking-[0.32em] text-[11px] text-muted-foreground">{t('landing.faq_nadtytul')}</p>
            <h2 className="font-display font-light mt-3 text-[clamp(30px,3.1vw,40px)] leading-tight">{t('landing.faq_tytul')}</h2>
          </div>
          <div>
            {FAQ.map((q, i) => (
              <div key={q} className={`py-6 ${i > 0 ? 'border-t border-border' : 'pt-0'}`}>
                <h3 className="font-display text-[18px] leading-snug">{t(`landing.faq.${q}.pytanie`)}</h3>
                <p className="text-[15px] leading-relaxed text-muted-foreground mt-2.5 text-pretty">{t(`landing.faq.${q}.odpowiedz`)}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* 7. Końcowe CTA */}
      <section className="max-w-[1280px] mx-auto px-5 sm:px-10 py-24 text-center">
        <h2 className="font-display font-light mx-auto max-w-[18ch] text-balance leading-tight
                       text-[clamp(34px,3.6vw,48px)]">
          Dokąd jedziesz w tym roku?
        </h2>
        <p className="text-[16px] leading-relaxed text-foreground/80 mt-5 max-w-[52ch] mx-auto text-pretty">
          Wpisz miasto, a agent zbierze pierwsze propozycje na Twoją tablicę.
          Zajmie to jedną chwilę i konto.
        </p>
        <div className="mt-8 flex justify-center">
          <div className="w-full max-w-[520px]">{poleDestynacji}</div>
        </div>
      </section>

      <footer className="border-t border-border">
        <div className="max-w-[1280px] mx-auto px-5 sm:px-10 py-11 flex flex-wrap items-center gap-6">
          <span className="font-display text-[18px] font-medium">Routemarket</span>
          <nav className="flex flex-wrap items-center gap-5">
            <a href="#jak-to-dziala" className="text-sm text-muted-foreground hover:text-foreground transition-colors">Jak to działa</a>
            <a href="#gpx" className="text-sm text-muted-foreground hover:text-foreground transition-colors">GPX</a>
            <a href="#tablice" className="text-sm text-muted-foreground hover:text-foreground transition-colors">Tablice</a>
            <button onClick={() => navigate('/legal/privacy')} className="text-sm text-muted-foreground hover:text-foreground transition-colors">{t('landing.stopka_prywatnosc')}</button>
            <button onClick={() => navigate('/contact')} className="text-sm text-muted-foreground hover:text-foreground transition-colors">{t('landing.stopka_kontakt')}</button>
          </nav>
          <span className="ml-auto font-mono text-[12px] text-muted-foreground">
            Aplikacje iOS i Android — wkrótce
          </span>
        </div>
      </footer>
    </div>
  );
}
