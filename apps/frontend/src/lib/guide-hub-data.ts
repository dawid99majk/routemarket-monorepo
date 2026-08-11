export interface GuideChecklistItem {
  label: string;
  checked?: boolean;
}

export interface GuideFAQItem {
  question: string;
  answer: string;
}

export interface GuideStep {
  title: string;
  description: string;
}

export interface GuideArticle {
  slug: string;
  title: string;
  description: string;
  icon: string; // lucide icon name
  tag?: string;
  /** 'explorers' = planowanie wyjazdu, 'creators' = korzystanie z planu w terenie. */
  tab: 'explorers' | 'creators';
  readingTimeMinutes: number;
  lastUpdated: string;
  keywords: string[];
  tldr: string;
  steps: GuideStep[];
  commonMistakes: string[];
  faq: GuideFAQItem[];
  checklist: GuideChecklistItem[];
  ctaTitle: string;
  ctaDescription: string;
  ctaButtonLabel: string;
  ctaButtonHref: string;
  startHere?: boolean;
  relatedSlugs?: string[];
}

export const guideArticles: GuideArticle[] = [
  // ── Planowanie ──
  {
    slug: 'jak-zaczac-wyjazd',
    title: 'Jak zacząć wyjazd',
    description: 'Od nazwy miasta do pierwszych propozycji miejsc.',
    icon: 'MapPin',
    tag: 'Start',
    tab: 'explorers',
    startHere: true,
    relatedSlugs: ['tablica-i-kubelki', 'plan-dnia-i-realizm'],
    readingTimeMinutes: 3,
    lastUpdated: '2026-08-11',
    keywords: ['start', 'wyjazd', 'miasto', 'klimat', 'termin', 'nowy'],
    tldr: 'Wyjazd potrzebuje trzech rzeczy: miasta, terminu i klimatu — czyli tego, z kim jedziesz. Klimat ustawia nastawienie planera: z dziećmi znaczy krótsze dystanse i więcej przerw, delegacja znaczy gęściej i bliżej centrum. Miejsca dla wpisanego miasta pokazują się od razu, jeszcze zanim założysz wyjazd.',
    steps: [
      { title: 'Wpisz miasto', description: 'Na stronie Start, w panelu „Dokąd tym razem?". Po chwili pod spodem pojawią się miejsca z katalogu dla tej destynacji.' },
      { title: 'Podaj termin', description: 'Jedno pole, format dowolny: „12–14 września" albo „12.09-14.09". Jeśli nie znasz jeszcze dat, zostaw puste — wyjazd powstanie jako szkic i termin dodasz później.' },
      { title: 'Wybierz klimat', description: 'Z dziećmi, we dwoje, w delegację, ze znajomymi albo sam. To ustawia tempo, gęstość dnia i rodzaj miejsc, które planer będzie podsuwał.' },
      { title: 'Załóż wyjazd', description: 'Przycisk „Zacznij planować" tworzy wyjazd i przenosi Cię do odkrywania miejsc z gotowym kontekstem.' },
      { title: 'Ustaw długość dnia', description: 'Na tablicy, w polu godzin dziennie. Bez tego planer nie wie, ile realnie masz czasu, i nie ostrzeże Cię, gdy dzień przestanie się spinać.' },
    ],
    commonMistakes: [
      'Pominięcie liczby godzin dziennie — bez niej ostrzeżenia o przeładowanym dniu nie mają się do czego odnieść.',
      'Wpisanie regionu zamiast miasta — „Toskania" da słabsze wyniki niż „Florencja", bo miejsca zbieramy wokół konkretnego punktu.',
      'Zakładanie osobnego wyjazdu na każdy pomysł — łatwiej trzymać jeden i przesuwać miejsca między kubełkami.',
    ],
    faq: [
      { question: 'Czy muszę znać dokładne daty?', answer: 'Nie. Wyjazd bez terminu zapisuje się jako szkic i działa normalnie — daty dodasz, kiedy będą znane. Bez nich planer nie przypisze dni tygodnia do godzin otwarcia.' },
      { question: 'Skąd biorą się pierwsze miejsca?', answer: 'Z otwartych danych o atrakcjach (OpenStreetMap) uzupełnionych opisami i czasem zwiedzania. Jeśli dla danego miasta nie mamy jeszcze nic, możesz je zebrać jednym przyciskiem — trwa to kilkadziesiąt sekund.' },
      { question: 'Czy klimat da się zmienić po założeniu wyjazdu?', answer: 'Tak, na tablicy. Zmiana wpływa na kolejne propozycje, ale nie usuwa tego, co już zapisałeś.' },
    ],
    checklist: [
      { label: 'Wpisz miasto docelowe' },
      { label: 'Podaj termin albo zostaw szkic' },
      { label: 'Wybierz klimat wyjazdu' },
      { label: 'Ustaw liczbę godzin dziennie' },
      { label: 'Zapisz pierwsze miejsca na tablicę' },
    ],
    ctaTitle: 'Zacznij od miasta',
    ctaDescription: 'Wpisz destynację, a miejsca pokażą się od razu — konto masz już założone.',
    ctaButtonLabel: 'Przejdź do Startu',
    ctaButtonHref: '/start',
  },
  {
    slug: 'tablica-i-kubelki',
    title: 'Tablica i trzy kubełki',
    description: 'Na pewno, być może, nie — po co ten podział i dlaczego odrzucone zostają.',
    icon: 'Layers',
    tag: 'Podstawy',
    tab: 'explorers',
    relatedSlugs: ['jak-zaczac-wyjazd', 'plan-dnia-i-realizm'],
    readingTimeMinutes: 3,
    lastUpdated: '2026-08-11',
    keywords: ['tablica', 'kubełki', 'na pewno', 'być może', 'odrzucone', 'priorytet'],
    tldr: 'Tablica ma trzy kolumny. „Na pewno" to miejsca, bez których wyjazd nie ma sensu — planer wstawia je w pierwszej kolejności. „Być może" wypełnia luki, jeśli zostanie czas. „Nie" nic nie kasuje, tylko odkłada. Wagę zmienia się pigułką na kartce albo przeciągnięciem między kolumnami.',
    steps: [
      { title: 'Zapisuj z odkrywania', description: 'W feedzie każda karta ma trzy przyciski u dołu. Jedno kliknięcie odkłada miejsce do wybranego kubełka.' },
      { title: 'Rozstrzygaj „być może"', description: 'Miejsca w środkowej kolumnie blokują ułożenie ostatecznej trasy. Na stronie Start masz sekcję „Wymaga decyzji" z trzema najpilniejszymi.' },
      { title: 'Zmieniaj wagę w locie', description: 'Pigułki na kartce przestawiają miejsce między kubełkami. Ponowne kliknięcie tej samej pigułki zdejmuje oznaczenie.' },
      { title: 'Ustaw kolejność', description: 'Przeciągnij kartkę na inną w tej samej kolumnie, żeby zmienić ich kolejność. Planer bierze ją pod uwagę przy układaniu dni.' },
    ],
    commonMistakes: [
      'Trzymanie wszystkiego w „być może" — planer traktuje tę kolumnę jako zapas, więc nic z niej nie musi trafić do planu.',
      'Kasowanie zamiast odrzucania — kolumna „nie" istnieje po to, żeby dało się wrócić do decyzji bez szukania miejsca od nowa.',
      'Zapisywanie dziesięciu muzeów na trzy popołudnia — planer to przyjmie, ale potem powie wprost, że się nie mieści.',
    ],
    faq: [
      { question: 'Czy odrzucone miejsca gdzieś znikają?', answer: 'Nie. Zostają w trzeciej kolumnie i w każdej chwili możesz je przywrócić jednym kliknięciem. Usuwa je dopiero kosz na kartce.' },
      { question: 'Ile miejsc powinno być w „na pewno"?', answer: 'Praktycznie: dwa do trzech na jedno popołudnie. Przy dłuższych dniach więcej, ale wtedy warto ustawić realną liczbę godzin, żeby ostrzeżenia miały sens.' },
      { question: 'Czy tablicę można prowadzić we dwoje?', answer: 'Tak. „Udostępnij imiennie" wpuszcza konkretną osobę po adresie e-mail — widzi tę samą tablicę i może na niej pracować.' },
    ],
    checklist: [
      { label: 'Przejrzyj feed i zapisz to, co Cię interesuje' },
      { label: 'Przenieś pewniaki do „na pewno"' },
      { label: 'Rozstrzygnij zaległe „być może"' },
      { label: 'Ustaw kolejność w kolumnie' },
      { label: 'Sprawdź, czy liczba miejsc pasuje do liczby dni' },
    ],
    ctaTitle: 'Otwórz tablicę',
    ctaDescription: 'Zobacz, co masz zebrane i co czeka na decyzję.',
    ctaButtonLabel: 'Przejdź do tablicy',
    ctaButtonHref: '/plany',
  },
  {
    slug: 'plan-dnia-i-realizm',
    title: 'Plan dnia i ostrzeżenia o realizmie',
    description: 'Jak powstaje rozkład godzin i dlaczego planer bywa nieustępliwy.',
    icon: 'CalendarDays',
    tag: 'Planowanie',
    tab: 'explorers',
    relatedSlugs: ['tablica-i-kubelki', 'plik-gpx'],
    readingTimeMinutes: 4,
    lastUpdated: '2026-08-11',
    keywords: ['plan', 'dzień', 'godziny', 'realizm', 'ostrzeżenie', 'okno czasowe'],
    tldr: 'Planer układa dni z kubełka „na pewno", dobiera resztę z propozycji i pilnuje trzech rzeczy: godzin otwarcia, czasu przejścia między punktami i Twojego okna czasowego. Kiedy dzień przestaje być realny, pisze o tym wprost, zamiast upychać punkty na siłę.',
    steps: [
      { title: 'Ustaw okno czasowe', description: 'Od której do której chcesz zwiedzać. To najważniejsze ograniczenie — bez niego plan jest zgadywanką.' },
      { title: 'Ustaw proporcję czasu', description: 'Suwak „Ile czasu zaplanować" mówi, ile procent okna wypełnić atrakcjami. Domyślne 70% zostawia zapas na przerwy i włóczenie się.' },
      { title: 'Ułóż plan', description: 'Przycisk na tablicy albo w zakładce Plan. Powstaje rozkład na każdy dzień z godzinami i kolejnością.' },
      { title: 'Przeczytaj ostrzeżenia', description: 'Powyżej dziewięciu godzin na nogach razem z dojściami dzień dostaje ostrzeżenie o realizmie. Sekcja „Nie zmieściło się" mówi, co wypadło i dlaczego.' },
      { title: 'Przelicz dokładnie', description: 'Domyślnie dystanse są szacunkiem w linii prostej ze współczynnikiem. Przycisk przeliczenia liczy prawdziwy przebieg po chodnikach i rysuje go na mapie dnia.' },
    ],
    commonMistakes: [
      'Ignorowanie sekcji „nie zmieściło się" — to nie jest błąd planera, tylko informacja, że dzień jest już pełny.',
      'Ustawienie 100% wypełnienia — plan wygląda imponująco, a w praktyce nie zostaje minuta na kawę ani na kolejkę do kasy.',
      'Planowanie muzeów na poniedziałek — planer zna godziny otwarcia, ale tylko wtedy, gdy wyjazd ma ustawione daty.',
      'Traktowanie szacowanego dystansu jak pomiaru — dopóki nie klikniesz przeliczenia, kilometry są przybliżeniem.',
    ],
    faq: [
      { question: 'Dlaczego mój punkt wypadł z planu?', answer: 'Najczęstsze powody to godziny otwarcia poza Twoim oknem, zbyt długi dojazd albo brak miejsca w dniu. Powód jest wypisany przy każdej pozycji w sekcji „nie zmieściło się".' },
      { question: 'Czy mogę wymusić konkretną godzinę?', answer: 'Tak, przez punkty stałe — na przykład kolację o 20:00. Planer ułoży resztę dnia wokół nich.' },
      { question: 'Mapa dnia pokazuje mniej pinezek niż punktów. Dlaczego?', answer: 'Część pozycji nie ma ustalonych współrzędnych. Pasek pod mapą podaje, ile takich jest. Przeliczenie planu zwykle je uzupełnia.' },
      { question: 'Czy plan da się zmienić po ułożeniu?', answer: 'Tak. Zmień wagi na tablicy albo okno czasowe i przelicz plan ponownie. Poprzednie wersje zostają na liście zapisanych planów.' },
    ],
    checklist: [
      { label: 'Ustaw godziny od–do' },
      { label: 'Dobierz proporcję wypełnienia czasu' },
      { label: 'Ułóż plan i przeczytaj ostrzeżenia' },
      { label: 'Sprawdź sekcję „nie zmieściło się"' },
      { label: 'Przelicz dzień dokładnie przed wyjazdem' },
    ],
    ctaTitle: 'Ułóż plan dni',
    ctaDescription: 'Z tego, co masz na tablicy, powstanie rozkład z godzinami.',
    ctaButtonLabel: 'Przejdź do planu',
    ctaButtonHref: '/plany?widok=plan',
  },

  // ── W terenie ──
  {
    slug: 'plik-gpx',
    title: 'Plik GPX — co z nim zrobić',
    description: 'Jak wyeksportować trasę i wgrać ją do zegarka albo nawigacji.',
    icon: 'Download',
    tag: 'Eksport',
    tab: 'creators',
    startHere: true,
    relatedSlugs: ['aplikacje-nawigacyjne', 'plan-dnia-i-realizm'],
    readingTimeMinutes: 4,
    lastUpdated: '2026-08-11',
    keywords: ['gpx', 'eksport', 'garmin', 'zegarek', 'nawigacja', 'ślad'],
    tldr: 'GPX to uniwersalny format śladu GPS. Z gotowego planu robisz trasę, a z widoku trasy pobierasz plik z punktami i przebiegiem. Otwiera go każdy zegarek i każda aplikacja mapowa bez konwersji.',
    steps: [
      { title: 'Ułóż plan dni', description: 'GPX powstaje z konkretnej trasy, więc najpierw potrzebny jest plan z godzinami i kolejnością.' },
      { title: 'Zrób trasę', description: 'Z pojedynczego dnia albo z całego wyjazdu — oba przyciski są w widoku planu. Trasa liczy przebieg po drogach i chodnikach.' },
      { title: 'Pobierz plik', description: 'W widoku trasy znajdziesz przycisk pobierania GPX. Plik zapisze się na dysku albo w pobranych na telefonie.' },
      { title: 'Wgraj do urządzenia', description: 'Zegarek: przez aplikację producenta (Garmin Connect, Suunto, Coros). Telefon: otwórz plik i wybierz aplikację mapową.' },
      { title: 'Pobierz mapy offline', description: 'Ślad działa bez zasięgu, ale podkład mapowy już nie. Pobierz mapy okolicy w swojej aplikacji przed wyjazdem.' },
    ],
    commonMistakes: [
      'Poleganie na zasięgu w terenie — sam GPX działa offline, ale bez pobranych map zobaczysz linię na pustym tle.',
      'Pobranie pliku i niesprawdzenie go przed wyjazdem — import warto przetestować w domu, nie na parkingu.',
      'Zapominanie o powerbanku — nawigacja z włączonym ekranem zjada baterię szybciej, niż się wydaje.',
      'Traktowanie śladu jak nakazu — GPX to podpowiedź kolejności, a nie trasa, z której nie wolno zejść.',
    ],
    faq: [
      { question: 'Czy GPX zawiera godziny z planu?', answer: 'Tak, godziny i czas zwiedzania trafiają do opisów punktów. Zegarek pokaże je przy każdym przystanku.' },
      { question: 'Czy plik działa bez internetu?', answer: 'Tak. Po wgraniu do urządzenia ślad jest lokalny. Zasięg jest potrzebny tylko do pobrania map przed wyjazdem.' },
      { question: 'Moje urządzenie nie przyjmuje GPX. Co zrobić?', answer: 'Starsze zegarki Garmina potrzebują formatu FIT. Darmowe konwertery online zamieniają GPX na FIT w kilka sekund.' },
      { question: 'Czy mogę edytować trasę po pobraniu?', answer: 'Tak, większość aplikacji pozwala przyciąć ślad, odwrócić kierunek albo dodać własne punkty.' },
    ],
    checklist: [
      { label: 'Ułóż plan i zrób z niego trasę' },
      { label: 'Pobierz plik GPX' },
      { label: 'Zaimportuj go do aplikacji lub zegarka' },
      { label: 'Pobierz mapy offline dla okolicy' },
      { label: 'Sprawdź import przed wyjazdem' },
      { label: 'Naładuj urządzenie i weź powerbank' },
    ],
    ctaTitle: 'Zamień plan w trasę',
    ctaDescription: 'Z gotowego planu powstaje ślad, który weźmiesz w teren.',
    ctaButtonLabel: 'Otwórz plan',
    ctaButtonHref: '/plany?widok=plan',
  },
  {
    slug: 'aplikacje-nawigacyjne',
    title: 'Aplikacje nawigacyjne',
    description: 'Którą wybrać do miasta, którą w góry, a którą na rower.',
    icon: 'Compass',
    tag: 'W terenie',
    tab: 'creators',
    relatedSlugs: ['plik-gpx'],
    readingTimeMinutes: 4,
    lastUpdated: '2026-08-11',
    keywords: ['aplikacje', 'nawigacja', 'komoot', 'osmand', 'organic maps', 'locus', 'garmin'],
    tldr: 'Każda z popularnych aplikacji otworzy plik GPX bez konwersji. Różnią się tym, co robią dalej: prowadzeniem głosowym, jakością map offline i tym, jak radzą sobie w mieście kontra w terenie.',
    steps: [
      { title: 'W mieście: Organic Maps', description: 'Lekka, w pełni offline, oparta na OpenStreetMap. Dobrze pokazuje wejścia, przejścia i punkty użyteczne przy zwiedzaniu. Bez konta i bez reklam.' },
      { title: 'Piesze i rowerowe: Komoot', description: 'Mocne prowadzenie i profil przewyższeń. Mapy offline wymagają pobrania regionu; część funkcji jest płatna.' },
      { title: 'Teren i szlaki: OsmAnd lub Locus Map', description: 'Najwięcej ustawień i warstw, w tym szlaki turystyczne i ukształtowanie terenu. Próg wejścia wyższy niż w pozostałych.' },
      { title: 'Zegarek: aplikacja producenta', description: 'Garmin Connect, Suunto App, Coros App. Ślad synchronizuje się z zegarkiem, a ten prowadzi bez wyjmowania telefonu.' },
      { title: 'Sprawdź import w domu', description: 'Otwórz plik, obejrzyj ślad na mapie i przejdź kilka punktów w podglądzie. Problemy lepiej wyłapać przed wyjazdem.' },
    ],
    commonMistakes: [
      'Instalowanie aplikacji w dniu wyjazdu — na naukę obsługi nie ma wtedy ani czasu, ani cierpliwości.',
      'Pobranie map po przyjeździe, gdy roaming już się skończył albo hotelowe wi-fi ledwo działa.',
      'Wybór aplikacji do szlaków górskich na spacer po starówce — w mieście prostsze narzędzie sprawdza się lepiej.',
      'Poleganie wyłącznie na zegarku — mały ekran wystarczy do kierunku, ale nie do zorientowania się w gąszczu uliczek.',
    ],
    faq: [
      { question: 'Która aplikacja jest darmowa i wystarczy na start?', answer: 'Organic Maps. Cała działa offline, nie wymaga konta i w zupełności starczy do zwiedzania miasta z planem z Routemarket.' },
      { question: 'Czy Routemarket ma własną nawigację?', answer: 'Nie w tej wersji. Plan eksportujemy jako GPX i prowadzenie zostawiamy aplikacjom, które robią to od lat lepiej. Aplikacje mobilne są w przygotowaniu.' },
      { question: 'Czy jeden plik zadziała w kilku aplikacjach naraz?', answer: 'Tak, GPX to otwarty standard. Ten sam plik możesz mieć równolegle w telefonie i w zegarku.' },
    ],
    checklist: [
      { label: 'Wybierz aplikację pasującą do rodzaju wyjazdu' },
      { label: 'Zainstaluj ją kilka dni wcześniej' },
      { label: 'Pobierz mapy offline dla okolicy' },
      { label: 'Zaimportuj GPX i obejrzyj ślad' },
      { label: 'Przećwicz obsługę w znanym terenie' },
    ],
    ctaTitle: 'Masz już plik?',
    ctaDescription: 'Jeśli nie, zacznij od planu — GPX powstaje z gotowej trasy.',
    ctaButtonLabel: 'Otwórz plan',
    ctaButtonHref: '/plany?widok=plan',
  },
  {
    slug: 'wspoldzielenie-i-tablice-publiczne',
    title: 'Współdzielenie i tablice publiczne',
    description: 'Różnica między zaproszeniem jednej osoby a opublikowaniem tablicy dla wszystkich.',
    icon: 'Share2',
    tag: 'Współpraca',
    tab: 'creators',
    relatedSlugs: ['tablica-i-kubelki'],
    readingTimeMinutes: 3,
    lastUpdated: '2026-08-11',
    keywords: ['udostępnianie', 'publiczna', 'kopiowanie', 'współdzielenie', 'tablica'],
    tldr: 'To dwie różne decyzje. Udostępnienie imienne wpuszcza konkretną osobę po adresie e-mail — widzi tę samą tablicę i może na niej pracować. Publikacja pokazuje tablicę każdemu zalogowanemu i pozwala skopiować ją do własnych wyjazdów. Publikacja jest odwracalna.',
    steps: [
      { title: 'Współtworzenie we dwoje', description: 'Na tablicy, w polu „Udostępnij imiennie", podaj adres e-mail. Osoba zobaczy tę samą tablicę po zalogowaniu.' },
      { title: 'Publikacja dla wszystkich', description: 'Przycisk „Opublikuj" nad polem udostępniania. Od tej chwili tablica jest widoczna dla każdego zalogowanego i da się ją skopiować.' },
      { title: 'Kopiowanie cudzej tablicy', description: 'Na stronie Start, w sekcji „Tablice od podróżników". Przycisk „Skopiuj" tworzy Twój własny wyjazd z tymi samymi miejscami i wagami.' },
      { title: 'Dopasowanie kopii', description: 'Kopia jest niezależna. Wyrzuć z niej to, co do Ciebie nie pasuje — oryginał zostaje nietknięty.' },
      { title: 'Wycofanie publikacji', description: 'Ten sam przycisk cofa publikację. Tablica znika z listy publicznych, a kopie zrobione wcześniej zostają u swoich właścicieli.' },
    ],
    commonMistakes: [
      'Publikowanie tablicy z prywatnymi notatkami — opublikowaną widzi każdy zalogowany, więc warto ją najpierw przejrzeć.',
      'Mylenie udostępnienia z publikacją — pierwsze dotyczy jednej osoby, drugie wszystkich.',
      'Oczekiwanie, że zmiany w oryginale dotrą do kopii — kopia żyje własnym życiem od momentu skopiowania.',
    ],
    faq: [
      { question: 'Czy publikacja pokazuje mój adres e-mail?', answer: 'Nie. Przy tablicy widnieje imię i pierwsza litera nazwiska, zapisane w chwili publikacji. Adres e-mail nie opuszcza systemu logowania.' },
      { question: 'Czy mogę skopiować własną tablicę?', answer: 'Nie — do tego służy zwykłe założenie nowego wyjazdu. Kopiowanie jest przeznaczone dla cudzych tablic.' },
      { question: 'Co dzieje się z licznikiem kopii?', answer: 'Rośnie przy każdym skopiowaniu i jest widoczny przy tablicy. Cofnięcie publikacji go nie zeruje.' },
      { question: 'Czy osoba, której udostępniłem tablicę, może ją usunąć?', answer: 'Nie. Współtworzy miejsca, ale właścicielem wyjazdu pozostajesz Ty.' },
    ],
    checklist: [
      { label: 'Zdecyduj: jedna osoba czy wszyscy' },
      { label: 'Przejrzyj tablicę przed publikacją' },
      { label: 'Udostępnij imiennie albo opublikuj' },
      { label: 'Sprawdź, jak tablica wygląda z zewnątrz' },
    ],
    ctaTitle: 'Otwórz tablicę',
    ctaDescription: 'Udostępnianie i publikacja są na dole widoku tablicy.',
    ctaButtonLabel: 'Przejdź do tablicy',
    ctaButtonHref: '/plany',
  },
];

export function getArticlesByTab(tab: 'explorers' | 'creators'): GuideArticle[] {
  return guideArticles.filter((a) => a.tab === tab);
}

export function getArticleBySlug(slug: string): GuideArticle | undefined {
  return guideArticles.find((a) => a.slug === slug);
}

export function getAdjacentArticles(slug: string): { prev: GuideArticle | null; next: GuideArticle | null } {
  const article = getArticleBySlug(slug);
  if (!article) return { prev: null, next: null };
  const tabArticles = getArticlesByTab(article.tab);
  const idx = tabArticles.findIndex((a) => a.slug === slug);
  return {
    prev: idx > 0 ? tabArticles[idx - 1] : null,
    next: idx < tabArticles.length - 1 ? tabArticles[idx + 1] : null,
  };
}

export function searchArticles(query: string): GuideArticle[] {
  const q = query.toLowerCase().trim();
  if (!q) return guideArticles;
  return guideArticles.filter(
    (a) =>
      a.title.toLowerCase().includes(q) ||
      a.description.toLowerCase().includes(q) ||
      a.keywords.some((k) => k.includes(q))
  );
}

export function getRelatedArticles(slug: string): GuideArticle[] {
  const article = getArticleBySlug(slug);
  if (!article?.relatedSlugs) return [];
  return article.relatedSlugs
    .map((s) => guideArticles.find((a) => a.slug === s))
    .filter(Boolean) as GuideArticle[];
}
