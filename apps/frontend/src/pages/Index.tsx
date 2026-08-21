import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowRight, ArrowUpRight, Heart } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { utworzWyjazd } from '@/lib/newTrip';
import PlannerHeader from '@/components/PlannerHeader';
import TablicaKafelek from '@/components/TablicaKafelek';
import { toast } from 'sonner';

/** Klimaty w brzmieniu z landingu; identyfikatory te same, co w presetach planera. */
const KLIMATY = [
  { id: 'family', label: 'z dziećmi' },
  { id: 'couple', label: 'we dwoje' },
  { id: 'business', label: 'w delegację' },
  { id: 'friends', label: 'ze znajomymi' },
  { id: 'solo', label: 'sam' },
];

const KROKI = [
  ['01', 'Powiedz, dokąd i z kim',
    'Miasto, termin i klimat wyjazdu. Agent od razu podsuwa pierwsze miejsca, także takie, których nie miałeś na liście.'],
  ['02', 'Zapisuj, co Cię interesuje',
    'Feed atrakcji ze zdjęciem, czasem zwiedzania i godzinami otwarcia. Jedno kliknięcie odkłada miejsce na tablicę.'],
  ['03', 'Rozstrzygnij wątpliwości',
    'Tablica ma trzy kubełki: na pewno, być może, nie. Odrzucone nie znikają — zawsze możesz je przywrócić.'],
  ['04', 'Odbierz gotową trasę',
    'Plan na każdy dzień z godzinami, kolejnością i czasem dojazdu. Na końcu plik GPX do zegarka albo nawigacji.'],
];

const PLAN_DEMO = [
  ['14:20', 'Amfiteatr w Durrës', '1 g 30 min · cień po 15:00'],
  ['16:05', 'Forum bizantyjskie', '25 min · 7 min pieszo'],
  ['16:45', 'Wieża Wenecka', '40 min · taras nad portem'],
  ['17:35', 'Promenada Durrës', '30 min · powrót pod hotel'],
];

const DNI = [
  {
    tytul: 'Dzień 1 — stare miasto', meta: '3 g 25 min · 3,8 km pieszo',
    przystanki: ['Amfiteatr', 'Forum bizantyjskie', 'Wieża Wenecka', 'Promenada'],
    realizm: 'Trzy punkty na 3,5 godziny. Zmieściłby się czwarty, ale amfiteatr i mury to dużo schodów jak na jedno popołudnie.',
  },
  {
    tytul: 'Dzień 2 — woda i piasek', meta: '3 g 50 min · 2 przejazdy autem',
    przystanki: ['Plaża Golem', 'Park zabaw Adriatik', 'Bazar rybny'],
    realizm: 'Dzień z dwoma przejazdami autem. Golem i park dzieli 6 minut, więc kolejność ma znaczenie.',
  },
  {
    tytul: 'Dzień 3 — ostatnie popołudnie', meta: '3 g 10 min · 2,6 km pieszo',
    przystanki: ['Muzeum Archeologiczne', 'Mury Kalaja', 'Plaża Currila'],
    realizm: 'Muzeum zamyka o 16:00 — to jedyny punkt dnia z twardym limitem. Reszta jest elastyczna.',
  },
];

const GPX_PRZYKLAD = `<gpx version="1.1" creator="Routemarket">
  <metadata><name>Durrës · dzień 1</name></metadata>
  <wpt lat="41.31278" lon="19.44139">
    <name>Amfiteatr w Durrës</name>
    <desc>14:20 · 1 g 30 min</desc>
  </wpt>
  <trk><name>Trasa pieszo · 3,8 km</name></trk>
</gpx>`;

const KANALY = [
  ['Zegarek i licznik', 'Garmin, Suunto, Coros, Wahoo — standardowy GPX z punktami trasy i śladem.'],
  ['Twoja aplikacja mapowa', 'Organic Maps, Komoot, Gaia, Locus. Plik otwiera się bez konwersji.'],
  ['Nawigacja Routemarket', 'Wbudowane prowadzenie od punktu do punktu, z godzinami z planu. Mapa pobiera się przed wyjazdem i działa bez zasięgu.'],
];

const FAQ = [
  ['Skąd biorą się miejsca?',
    'Z otwartych baz danych o atrakcjach, opinii podróżników i tablic publikowanych przez użytkowników. Godziny otwarcia i czas zwiedzania są weryfikowane przed pokazaniem w feedzie.'],
  ['Czy agent nie wciśnie mi za dużo na jeden dzień?',
    'Odwrotnie — kiedy plan przestaje być realny, pisze o tym wprost i proponuje, co przenieść. Możesz zadać własne ograniczenie, na przykład maksymalnie cztery godziny dziennie.'],
  ['Czy działa poza Europą?',
    'Tak. Planer jest globalny, interfejs dostępny w kilku językach, a odległości i czasy liczone lokalnym transportem.'],
  ['Co z aplikacją na telefon?',
    'Wersja przeglądarkowa działa na telefonie już teraz. Aplikacje iOS i Android, z pobieraniem map do trybu offline, są w przygotowaniu.'],
];

const NAWIGACJA = [
  ['Jak to działa', '#jak-to-dziala'],
  ['Przykładowy plan', '#przyklad'],
  ['Nawigacja i GPX', '#gpx'],
  ['Tablice', '#tablice'],
];

interface Tablica {
  id: string; name: string; destination: string | null; author_display: string | null;
  copy_count: number; like_count: number | null; place_count: number; photos?: string[];
}

export default function Index() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [cel, setCel] = useState('');
  const [klimat, setKlimat] = useState('family');
  const [tablice, setTablice] = useState<Tablica[]>([]);
  const [zakladam, setZakladam] = useState(false);

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

  const poleDestynacji = (
    <div className="flex gap-2 rounded-md bg-card border border-border shadow-token-sm p-2 max-w-[560px]">
      <input value={cel} onChange={(e) => setCel(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && zacznij()}
        placeholder="Dokąd jedziesz?"
        className="flex-1 min-w-0 bg-transparent px-3 h-11 text-[16px] outline-none placeholder:text-muted-foreground" />
      <Button onClick={zacznij} disabled={zakladam}
        className="bg-primary hover:bg-primary/90 shrink-0 h-11 px-5">
        {zakladam ? 'Zakładam…' : 'Zacznij planować'}
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
      <header className="sticky top-0 z-30 h-[68px] border-b border-border bg-background/85 backdrop-blur-[8px]">
        <div className="max-w-[1280px] mx-auto h-full px-10 flex items-center gap-8">
          <a href="#gora" className="font-display text-[20px] font-medium shrink-0">Routemarket</a>
          <nav className="hidden lg:flex items-center gap-6">
            {NAWIGACJA.map(([label, href]) => (
              <a key={href} href={href}
                className="text-sm text-muted-foreground hover:text-foreground transition-colors">{label}</a>
            ))}
          </nav>
          <div className="ml-auto flex items-center gap-2">
            <Button size="sm" variant="ghost" onClick={() => navigate('/auth')}>Zaloguj się</Button>
            <Button size="sm" onClick={() => navigate('/auth')} className="bg-primary hover:bg-primary/90">
              Zaplanuj wyjazd
            </Button>
          </div>
        </div>
      </header>
      )}

      <main id="gora" className="max-w-[1280px] mx-auto px-10">
        {/* 1. Hero */}
        <section className="pt-[88px] pb-[72px] grid gap-10 [grid-template-columns:repeat(auto-fit,minmax(min(100%,430px),1fr))] items-start">
          <div>
            <p className="font-narrow uppercase tracking-[0.32em] text-[11px] text-primary">Planner wyjazdów</p>
            <h1 className="font-display font-light mt-4 text-balance leading-[1.04] tracking-[-0.03em]
                           text-[clamp(38px,4.4vw,62px)]">
              Zbierz miejsca. Resztę ułoży agent.
            </h1>
            <p className="text-[18px] leading-relaxed text-foreground/80 mt-6 max-w-[52ch] text-pretty">
              Wyszukujesz atrakcje i wrzucasz je na tablicę wyjazdu — „na pewno", „być może", „nie".
              Agent układa z nich plan na każdy dzień, z realnymi godzinami i czasem dojazdu,
              i oddaje gotowy plik GPX do zegarka albo nawigacji.
            </p>

            <div className="mt-8">{poleDestynacji}</div>

            <div className="flex flex-wrap items-center gap-2 mt-5">
              <span className="text-sm text-muted-foreground mr-1">Jadę</span>
              {KLIMATY.map((k) => (
                <button key={k.id} onClick={() => setKlimat(k.id)}
                  className={`rounded-full px-3.5 py-1.5 text-[13px] border transition-colors ${
                    klimat === k.id
                      ? 'bg-primary border-primary text-primary-foreground'
                      : 'border-border hover:bg-muted'
                  }`}>
                  {k.label}
                </button>
              ))}
            </div>

            <p className="font-mono text-[12px] text-muted-foreground mt-6">
              Bez karty · plan gotowy w kilka minut · działa też offline w terenie
            </p>
          </div>

          {/* Podgląd planu — to jest cały argument produktu, nie ozdoba */}
          <div className="w-full max-w-[520px] justify-self-end rounded-md bg-card border border-border shadow-token-lg overflow-hidden">
            <div className="px-6 pt-5 pb-4 flex items-start justify-between gap-4">
              <div>
                <p className="font-narrow uppercase tracking-[0.32em] text-[10px] text-muted-foreground">
                  Plan wygenerowany
                </p>
                <h2 className="font-display text-[20px] mt-1.5">Durrës · dzień 1</h2>
              </div>
              <span className="font-mono text-[12px] tabular-nums text-muted-foreground mt-1">3 g 25 min</span>
            </div>
            <div className="px-6 pb-5 space-y-3.5">
              {PLAN_DEMO.map(([godz, nazwa, meta], i) => (
                <div key={nazwa} className="grid grid-cols-[62px_1fr] gap-3 items-start">
                  <span className="font-mono text-[12px] tabular-nums text-muted-foreground pt-1">{godz}</span>
                  <div className="flex items-start gap-3">
                    <span className="w-[22px] h-[22px] rounded-full bg-primary text-primary-foreground shrink-0
                                     flex items-center justify-center text-[11px] font-medium mt-0.5">{i + 1}</span>
                    <div className="min-w-0">
                      <div className="font-display text-[15px] leading-snug">{nazwa}</div>
                      <div className="font-mono text-[11px] tabular-nums text-muted-foreground mt-0.5">{meta}</div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
            <div className="bg-muted px-6 py-3.5 flex items-center justify-between gap-3 border-t border-border">
              <span className="font-mono text-[12px] tabular-nums text-muted-foreground">3,8 km pieszo · +46 m</span>
              <span className="font-mono text-[11px] rounded-full bg-primary text-primary-foreground px-3 py-1">
                durres-dzien-1.gpx
              </span>
            </div>
          </div>
        </section>
      </main>

      {/* 2. Jak to działa */}
      <section id="jak-to-dziala" className="bg-card border-y border-border">
        <div className="max-w-[1280px] mx-auto px-10 py-20">
          <p className="font-narrow uppercase tracking-[0.32em] text-[11px] text-muted-foreground">Jak to działa</p>
          <h2 className="font-display font-light mt-3 text-[clamp(30px,3.1vw,40px)] leading-tight text-balance">
            Cztery kroki od pomysłu do trasy w zegarku
          </h2>
          <div className="mt-12 border-t border-border grid [grid-template-columns:repeat(auto-fit,minmax(min(100%,230px),1fr))]">
            {KROKI.map(([nr, tytul, opis], i) => (
              <div key={nr} className={`pt-6 pb-2 px-6 ${i > 0 ? 'md:border-l border-border' : 'md:pl-0'}`}>
                <span className="font-mono text-[13px] tabular-nums text-primary">{nr}</span>
                <h3 className="font-display text-[20px] mt-3 leading-snug">{tytul}</h3>
                <p className="text-[14px] leading-relaxed text-muted-foreground mt-2.5 text-pretty">{opis}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* 3. Prawdziwy przykład */}
      <section id="przyklad" className="max-w-[1280px] mx-auto px-10 py-[88px]
                                        grid gap-12 [grid-template-columns:repeat(auto-fit,minmax(min(100%,380px),1fr))] items-start">
        <div className="lg:sticky lg:top-[100px] max-w-[460px]">
          <p className="font-narrow uppercase tracking-[0.32em] text-[11px] text-muted-foreground">Prawdziwy przykład</p>
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
            <div key={d.tytul} className="rounded-md bg-card border border-border p-6">
              <h3 className="font-display text-[20px] leading-snug">{d.tytul}</h3>
              <p className="font-mono text-[12px] tabular-nums text-muted-foreground mt-1.5">{d.meta}</p>
              <div className="flex flex-wrap gap-1.5 mt-4">
                {d.przystanki.map((p) => (
                  <span key={p} className="rounded-full bg-muted px-3 py-1 text-[12px] text-foreground/75">{p}</span>
                ))}
              </div>
              <div className="mt-5 rounded-md bg-warning/15 border border-warning/30 px-4 py-3.5 flex items-start gap-3">
                <span className="font-narrow uppercase tracking-[0.18em] text-[10px] text-warning-foreground
                                 border border-warning/45 rounded-full px-2.5 py-1 shrink-0">Realizm</span>
                <p className="text-[13px] leading-relaxed text-warning-foreground text-pretty">{d.realizm}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* 4. Nawigacja i GPX */}
      <section id="gpx" className="bg-foreground text-background">
        <div className="max-w-[1280px] mx-auto px-10 py-[88px]
                        grid gap-12 [grid-template-columns:repeat(auto-fit,minmax(min(100%,380px),1fr))] items-start">
          <div>
            <p className="font-narrow uppercase tracking-[0.32em] text-[11px] text-primary-light">Nawigacja i GPX</p>
            <h2 className="font-display font-light mt-3 text-[clamp(30px,3.1vw,40px)] leading-tight text-balance">
              Plan kończy się plikiem, nie zakładką w przeglądarce
            </h2>
            <p className="text-[16px] leading-relaxed text-primary-foreground/75 mt-5 max-w-[46ch] text-pretty">
              Trasa wychodzi z Routemarket w formacie, który rozumie sprzęt — nie tylko nasza strona.
            </p>
            <div className="mt-8">
              {KANALY.map(([tytul, opis], i) => (
                <div key={tytul} className={`py-5 ${i > 0 ? 'border-t border-primary-foreground/15' : ''}`}>
                  <h3 className="font-display text-[17px]">{tytul}</h3>
                  <p className="text-[14px] leading-relaxed text-primary-foreground/70 mt-1.5 text-pretty">{opis}</p>
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
        <section id="tablice" className="max-w-[1280px] mx-auto px-10 py-[88px]">
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
            <Button variant="outline" onClick={() => navigate('/tablice')}>
              Przeglądaj wszystkie
            </Button>
          </div>

          <div className="mt-10 -mx-10 px-10 overflow-x-auto
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
        </section>
      )}

      {/* 6. Częste pytania */}
      <section className="bg-card border-y border-border">
        <div className="max-w-[1280px] mx-auto px-10 py-20
                        grid gap-12 [grid-template-columns:repeat(auto-fit,minmax(min(100%,360px),1fr))] items-start">
          <div>
            <p className="font-narrow uppercase tracking-[0.32em] text-[11px] text-muted-foreground">Częste pytania</p>
            <h2 className="font-display font-light mt-3 text-[clamp(30px,3.1vw,40px)] leading-tight">Zanim zaczniesz</h2>
          </div>
          <div>
            {FAQ.map(([q, a], i) => (
              <div key={q} className={`py-6 ${i > 0 ? 'border-t border-border' : 'pt-0'}`}>
                <h3 className="font-display text-[18px] leading-snug">{q}</h3>
                <p className="text-[15px] leading-relaxed text-muted-foreground mt-2.5 text-pretty">{a}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* 7. Końcowe CTA */}
      <section className="max-w-[1280px] mx-auto px-10 py-24 text-center">
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
        <div className="max-w-[1280px] mx-auto px-10 py-11 flex flex-wrap items-center gap-6">
          <span className="font-display text-[18px] font-medium">Routemarket</span>
          <nav className="flex flex-wrap items-center gap-5">
            <a href="#jak-to-dziala" className="text-sm text-muted-foreground hover:text-foreground transition-colors">Jak to działa</a>
            <a href="#gpx" className="text-sm text-muted-foreground hover:text-foreground transition-colors">GPX</a>
            <a href="#tablice" className="text-sm text-muted-foreground hover:text-foreground transition-colors">Tablice</a>
            <button onClick={() => navigate('/legal/privacy')} className="text-sm text-muted-foreground hover:text-foreground transition-colors">Prywatność</button>
            <button onClick={() => navigate('/contact')} className="text-sm text-muted-foreground hover:text-foreground transition-colors">Kontakt</button>
          </nav>
          <span className="ml-auto font-mono text-[12px] text-muted-foreground">
            Aplikacje iOS i Android — wkrótce
          </span>
        </div>
      </footer>
    </div>
  );
}
