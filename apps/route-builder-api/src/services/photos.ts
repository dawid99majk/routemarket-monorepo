import { repo } from '../db/repository.js';
import { aliasyMiasta, obceNazwyGeograficzne } from './miasta.js';

/**
 * Zdjęcie i skrót z Wikipedii dla miejsca. Tag `wikipedia` w OSM ma postać
 * "pl:Sukiennice", więc mamy zarówno język, jak i tytuł — bez zgadywania.
 * Bez tego karta miejsca to sam tekst, a użytkownik chce zobaczyć, co wybiera.
 */
async function fetchWikiCard(wikipediaTag: string | undefined): Promise<{ image?: string; extract?: string }> {
  if (!wikipediaTag) return {};
  const m = wikipediaTag.match(/^([a-z-]{2,10}):(.+)$/i);
  const lang = m ? m[1] : 'pl';
  const title = m ? m[2] : wikipediaTag;
  try {
    const res = await fetch(
      `https://${lang}.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title.replace(/ /g, '_'))}`,
      { headers: { 'User-Agent': 'RouteMarketBuilderV3/1.0 (routemarket.io)' }, signal: AbortSignal.timeout(6000) }
    );
    if (!res.ok) return {};
    const data = await res.json() as any;
    return {
      image: data.thumbnail?.source || data.originalimage?.source,
      extract: data.extract
    };
  } catch {
    return {};
  }
}

export const COMMONS_UA = 'RouteMarket/1.0 (+https://routemarket.io)';

/** Pliki, które nigdy nie są zdjęciem miejsca: herby, flagi, mapy, schematy, pliki wideo, ryciny, zrzuty z TV, zniszczenia wojenne, czarno-białe pocztówki i archiwalia */
const PHOTO_JUNK = /(coat.of.arms|flag|logo|icon|\bmap\b|mapa|karte|plan\b|diagram|blazon|wikidata|locator|satellite|skizze|sketch|drawing|zeichnung|rysunek|szkic|kupferstich|litho|engraving|gravure|etching|blueprint|grundriss|reconstruction|render|simulation|screenshot|zdf|ard|arte|bbc|fernsehen|broadcast|television|\bwebm\b|\bogv\b|\bogg\b|\bmp4\b|bau_des|construction_of|ruine?|zerstört|destroyed|bombard|fire\b|brand\b|\b(18\d\d|19[0-7]\d)\b|black_and_white|schwarzweiss|czarno_biale|historic|historisch|vintage|postcard|ansichtskarte|postkarte|pocztowka)/i;

/**
 * Nazwy prosto z aparatu ("DSC_0431", "IMG 2207", "P1010823"). Taki plik nie mówi
 * o miejscu nic — to czyjaś pamiątka z wakacji, równie dobrze zbliżenie twarzy.
 * Przy zdjęciu wiodącym miejsca nie chcemy zgadywać, co jest na kadrze.
 */
const CAMERA_DUMP = /\b(dsc[_\s-]?\d|dscn\d|img[_\s-]?\d|imgp\d|p\d{7}|photo[_\s-]?\d|cimg\d|_mg_\d)/i;

/**
 * Kadry pokazujące fragment, nie obiekt: żyrandol, sufit, tablica, klamka.
 * Takiego pliku nie odrzucamy — przy małym muzeum bywa jedynym, jaki istnieje —
 * ale nie może trafić na kartę jako zdjęcie główne, gdy jest czym go zastąpić.
 */
const PHOTO_DETAL = /(interior|interno|interieur|wnetrz|detail|detal|ceiling|sufit|decke|plafon|soffitto|chandelier|zyrandol|żyrandol|plaque|tablica|inscription|inskrypcj|door|drzwi|window|okno|staircase|schody|fresco|fresk|mosaic|mozaik|column|kolumn|ornament|handle|klamka|sign\b|altaar|altar|oltarz|ołtarz|pulpit|ambona|organ[iy]|orgel|krypta|crypt)/i;

/**
 * Tytul w formie "X w Y" mowi wprost, ze tematem jest X, a obiektem tylko Y.
 * Dokladanie kolejnych slow do listy detali bylo goniem za wlasnym ogonem:
 * odsialem oltarz, wskoczyla chrzcielnica; odsialbym chrzcielnicę, wskoczylaby
 * ambona. Przyimek laczy je wszystkie — i przy okazji lapie "Borstbeeld
 * Thorbecke IN DE 2e Kamer", czyli popiersie posla podane jako zdjecie klubu.
 *
 * To kara w rankingu, nie odrzucenie: gdy nie ma nic innego, wnetrze jest
 * lepsze niz pusta karta.
 */
const COS_W_SRODKU = /\b(in de|in het|in der|in the|inside|we wnetrzu|wewnatrz)\b/i;

const stripDiacritics = (t: string) =>
  t.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

let miastaCache: { at: number; lista: string[] } | null = null;

/**
 * Inne miasta z naszego katalogu niż `miasto` — do odsiewania zdjęć bez
 * geotagu, których tytuł wprost wymienia inną miejscowość. Sam token nazwy
 * miejsca nie wystarcza, bo identycznie nazwane obiekty (wezwania kościołów,
 * hale targowe) powtarzają się między miastami.
 */
async function inneMiastaNiz(miasto: string | undefined): Promise<string[]> {
  if (!miasto) return [];
  if (!miastaCache || Date.now() - miastaCache.at > 6 * 60 * 60_000) {
    const lista = await repo.listCities().catch(() => [] as string[]);
    miastaCache = { at: Date.now(), lista };
  }
  const cel = stripDiacritics(miasto);
  return miastaCache.lista
    .map((m) => stripDiacritics(m))
    .filter((m) => m.length >= 4 && m !== cel);
}

/**
 * Rodzaje obiektów rozpoznawane po tytule artykułu. W gęstej starówce artykuł
 * o ulicy leży kilkadziesiąt metrów od kościoła i wygrywał samą odległością —
 * "Kościół Garnizonowy" dostawał zdjęcie ulicy św. Elżbiety. Jeśli tytuł mówi
 * o innym rodzaju obiektu niż nazwa miejsca, to nie jest ten sam obiekt.
 */
const WIKI_KIND = ['ulica', 'plac', 'parafia', 'kamienica', 'pomnik', 'most', 'dworzec',
  'park', 'cmentarz', 'hotel', 'teatr', 'synagoga', 'street', 'square', 'monument'];

/**
 * Słowa, które same z siebie nie identyfikują miejsca. Nazwa złożona wyłącznie
 * z nich ("Sandy beach", "Stary rynek") pasuje w Commons do czegokolwiek na
 * świecie, więc takiego trafienia nie wolno przyjąć bez potwierdzenia położeniem.
 */
const GENERIC_PLACE_WORD = /^(sandy|beach|plaza|rynek|market|square|castle|church|museum|garden|view|old|new|town|city|centre|center|street|bridge|lake|river|hill|park|porto|grill|restaurant|cafe|hotel|zamek|kościół|kosciol|muzeum|stare|stary|nowe|nowy|miasto|ulica|most|jezioro|rzeka|plaża|plaza)$/i;

function distinctiveTokens(name: string): string[] {
  return (name || '')
    .split(/[^\p{L}\p{N}]+/u)
    .filter((t) => t.length >= 5 && !GENERIC_PLACE_WORD.test(t));
}

function kmApart(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const dLat = (a.lat - b.lat) * 111;
  const dLng = (a.lng - b.lng) * 111 * Math.cos((a.lat * Math.PI) / 180);
  return Math.sqrt(dLat * dLat + dLng * dLng);
}

/**
 * Licznik zapytan do Commons, ktore sie nie udaly (limit, timeout, 5xx).
 *
 * Nieudane zapytanie zwraca pusta liste, czyli wyglada dokladnie jak "nie ma
 * takiego zdjecia". Przy sprawdzaniu jakosci zdjec dla calego miasta dalo to
 * wynik "36 z 42 miejsc stracilo zdjecie" — a prawda byla taka, ze Wikimedia
 * przestala odpowiadac w terminie. Bez tego licznika nie da sie odroznic pustki
 * od odciecia, a to dwie zupelnie rozne diagnozy.
 */
let commonsNieudane = 0;
export const odczytajNieudaneCommons = () => commonsNieudane;
export const wyzerujNieudaneCommons = () => { commonsNieudane = 0; };

async function commonsQuery(params: Record<string, string>): Promise<any[]> {
  const url = 'https://commons.wikimedia.org/w/api.php?' + new URLSearchParams({ format: 'json', ...params });
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': COMMONS_UA },
      signal: AbortSignal.timeout(9000)
    });
    if (!res.ok) { commonsNieudane += 1; return []; }
    const data = await res.json() as any;
    return Object.values(data?.query?.pages || {});
  } catch {
    commonsNieudane += 1;
    return [];
  }
}

function usablePhotos(pages: any[], origin: { lat: number; lng: number } | null,
                      nameTokens: string[] | null, inneMiasta: string[] | null = null): string[] {
  return pages
    .sort((a, b) => (a.index ?? 99) - (b.index ?? 99))
    // Skan zeskanowanej książki albo dokumentu bierzemy TYLKO po tytule oryginału
    // ("...pdf", "...djvu"), nie po adresie miniatury: MediaWiki renderuje stronę
    // PDF-u jako "page1-960px-Cokolwiek.pdf.jpg" -- kończy się na .jpg, więc test
    // rozszerzenia niżej i tak by to przepuścił. Kawiarnia "Vienna" w Hadze nie
    // miała zdjęcia z geotagiem i dopasowanie spadło na sam tytuł pliku -- trafiło
    // w zeskanowaną stronę XVII-wiecznego dziennika podróży, bo w tytule było
    // "...to Vienna...". "Vienna" jest zbyt pospolitym słowem, żeby to złapać
    // regułą dopasowania; ten filtr łapie to niezależnie od słowa.
    .filter((p) => !/\.(pdf|djvu|webm|ogv|ogg|mp4|mov|svg|gif)$/i.test(String(p.title || '').trim()))
    // Slowa z nazwy miejsca wycinamy PRZED testem na smieci. PHOTO_JUNK lapie
    // m.in. "historic|historisch", zeby odsiewac archiwalia — i wycinal przez to
    // "Haags Historisch Museum.jpg", czyli wlasciwe zdjecie muzeum, ktore ma to
    // slowo we wlasnej nazwie. Miejsce nie moze przegrywac z filtrem o samo
    // siebie; prawdziwe archiwalium i tak zlapie sie na rok w tytule albo na
    // "postcard", bo tych slow w nazwie miejsca nie ma.
    .filter((p) => {
      const tytul = String(p.title || '');
      const bezSlowNazwy = (nameTokens ?? []).reduce(
        (tekst, slowo) => tekst.split(slowo.toLowerCase()).join(' '),
        tytul.toLowerCase());
      return !PHOTO_JUNK.test(bezSlowNazwy) && !CAMERA_DUMP.test(bezSlowNazwy);
    })
    .filter((p) => {
      const c = p.coordinates?.[0];
      const title = String(p.title || '').toLowerCase();

      // ODLEGŁOŚĆ TO WARUNEK, NIE DOWÓD.
      //
      // Wcześniej geotag zwalniał plik ze sprawdzania nazwy: "jeśli ma
      // współrzędne bliżej niż 2 km, bierzemy". W gęstym centrum 2 km to całe
      // śródmieście, a przy wyszukiwaniu po okolicy `origin` bywa null, więc
      // przechodziło DOWOLNE zdjęcie z promienia zapytania. Tak klub
      // "Full Moon City" w Hadze dostał popiersie posła stojące w parlamencie
      // dwieście metrów dalej — zdjęcie trafne co do miejsca na mapie i
      // pokazujące zupełnie co innego.
      //
      // Blisko + nazwa się zgadza = to jest ten obiekt. Samo "blisko" nie
      // odróżnia baru od pomnika obok niego.
      if (c && origin && kmApart(origin, { lat: c.lat, lng: c.lon }) >= 2) return false;

      // Brak wyróżniającego słowa w nazwie miejsca ("City", "2000", "The Wall")
      // znaczy, że nie mamy czym potwierdzić żadnego kandydata. Puste pole jest
      // wtedy uczciwsze niż losowy sąsiad — zdjęcie wiodące z artykułu i zdjęcia
      // użyte w artykule idą osobną drogą i tego ograniczenia nie dotyczą.
      if (!nameTokens || nameTokens.length === 0) return false;
      if (!nameTokens.some((t) => title.includes(t.toLowerCase()))) return false;
      // Dopasowanie po tokenie nie rozróżnia identycznie nazwanych obiektów w
      // różnych miastach ("Kościół Świętego Wojciecha" ma to samo wezwanie we
      // Wrocławiu, Krakowie i Sieradzu). Jeśli tytuł bez geotagu wymienia wprost
      // inne nasze miasto, to prawie na pewno pokazuje tamten odpowiednik.
      if (inneMiasta?.length) {
        const bezOgonkow = stripDiacritics(title);
        if (inneMiasta.some((m) => bezOgonkow.includes(m))) return false;
      }
      return true;
    })
    // Detale na koniec, reszta w oryginalnej kolejnosci trafnosci. Sortowanie
    // jest stabilne, wiec wewnatrz obu grup ranking z Commons zostaje nietkniety.
    .sort((a, b) => Number(PHOTO_DETAL.test(a.title || '')) - Number(PHOTO_DETAL.test(b.title || '')))
    .map((p) => p.imageinfo?.[0]?.thumburl)
    .filter((u: string | undefined): u is string => !!u && /\.(jpg|jpeg|png)$/i.test(u.split('?')[0]));
}

/**
 * Zdjęcie wiodące z artykułu Wikipedii o tym miejscu. Artykuł ma jedno zdjęcie
 * wybrane przez ludzi i to prawie zawsze reprezentacyjne ujęcie obiektu. Szukamy
 * przez geosearch po współrzędnych, bo nazwa bywa nijaka: "Rynek" trafi w setkę
 * rynków w Polsce, ale artykuł z geotagiem czterdzieści metrów stąd to na pewno
 * ten właściwy.
 */
async function wikiLeadPhotos(name: string, origin: { lat: number; lng: number }): Promise<string[]> {
  const tokens = stripDiacritics(name).split(/[^a-z0-9]+/).filter((t) => t.length >= 4);
  const nameKinds = WIKI_KIND.filter((k) => stripDiacritics(name).includes(k));
  for (const lang of ['pl', 'en']) {
    try {
      const url = `https://${lang}.wikipedia.org/w/api.php?` + new URLSearchParams({
        format: 'json', action: 'query', generator: 'geosearch',
        ggscoord: `${origin.lat}|${origin.lng}`, ggsradius: '600', ggslimit: '20',
        prop: 'pageimages|coordinates', piprop: 'original'
      });
      const res = await fetch(url, { headers: { 'User-Agent': COMMONS_UA }, signal: AbortSignal.timeout(9000) });
      if (!res.ok) continue;
      const pages: any[] = Object.values(((await res.json()) as any)?.query?.pages || {});

      const scored = pages
        .filter((pg) => pg.original?.source)
        .map((pg) => {
          const title = stripDiacritics(pg.title || '');
          // Slowa tytulu, nie surowy napis. Dopasowanie podciagiem dawalo trafienia
          // miedzy roznymi miejscami: token "roman" z "Ateneul Roman" siedzi w
          // "Piata Romana", wiec plac wygrywal z filharmonia, gdy ta akurat nie
          // miala zdjecia wiodacego.
          const slowaTytulu = new Set(title.split(/[^a-z0-9]+/).filter(Boolean));
          const c = pg.coordinates?.[0];
          const km = c ? kmApart(origin, { lat: c.lat, lng: c.lon }) : 9;
          const hits = tokens.filter((t) => slowaTytulu.has(t)).length;
          const clash = WIKI_KIND.some((k) => slowaTytulu.has(k) && !nameKinds.includes(k));
          return { pg, hits, km, clash };
        })
        // Artykuł musi pasować nazwą. Samo "leży blisko" nie wystarcza — w
        // starówce w promieniu stu metrów jest kilkanaście obiektów z własnym
        // artykułem i każdy z nich byłby wtedy równie dobrym kandydatem.
        // Jedno wspolne slowo to za malo, gdy nazwa ma ich kilka: "Muzeum
        // Narodowe" i "Muzeum Techniki" dziela polowe nazwy i sa czym innym.
        // Zadamy polowy tokenow — przy nazwie jednoslownej to dalej jeden token.
        .filter((r) => r.hits > 0 && !r.clash && r.hits >= Math.ceil(tokens.length / 2))
        .sort((a, b) => b.hits - a.hits || a.km - b.km);

      const best = scored[0]?.pg?.original?.source as string | undefined;
      if (best && !PHOTO_JUNK.test(best) && /\.(jpg|jpeg|png)$/i.test(best.split('?')[0])) {
        return [best];
      }
    } catch { /* brak artykułu w tym języku — próbujemy następnego */ }
  }
  return [];
}

/**
 * Zdjęcia UŻYTE W ARTYKULE o tym miejscu, ułożone od najlepszego.
 *
 * To drugi po zdjęciu wiodącym zbiór wybrany przez ludzi: skoro redaktor wstawił
 * fotografię do tekstu, to opisuje ona ten obiekt. Wyszukiwanie po okolicy tego
 * nie gwarantuje — w promieniu 250 m stoi zwykle kilka innych rzeczy.
 *
 * Trafność to jednak nie wszystko. Przy placu Uniwersyteckim w Bukareszcie
 * zdjęcie przejścia podziemnego jest w artykule i jest trafne, tylko brzydkie.
 * Stąd ranking: zgodność nazwy pliku z nazwą miejsca waży najwięcej, potem kadr
 * poziomy i rozdzielczość, a wnętrza i detale lądują na końcu.
 */
async function wikiArticlePhotos(wikipediaTag: string | undefined, name: string,
                                 limit = 6): Promise<string[]> {
  if (!wikipediaTag) return [];
  const m = wikipediaTag.match(/^([a-z-]{2,10}):(.+)$/i);
  const lang = m ? m[1] : 'pl';
  const title = m ? m[2] : wikipediaTag;
  try {
    const url = `https://${lang}.wikipedia.org/w/api.php?` + new URLSearchParams({
      format: 'json', action: 'query', generator: 'images',
      titles: title, gimlimit: '30',
      prop: 'imageinfo', iiprop: 'url|size|extmetadata',
      iiextmetadatafilter: 'Categories', iiurlwidth: '960',
    });
    const res = await fetch(url, { headers: { 'User-Agent': COMMONS_UA },
                                   signal: AbortSignal.timeout(9000) });
    if (!res.ok) return [];
    const strony: any[] = Object.values(((await res.json()) as any)?.query?.pages || {});
    const tokeny = distinctiveTokens(name).map((t) => stripDiacritics(t).toLowerCase());

    const ocenione = strony.map((p) => {
      const plik = String(p.title || '').split(':').slice(1).join(':');
      const ii = p.imageinfo?.[0];
      if (!ii) return null;
      const adres: string = ii.thumburl || ii.url || '';
      if (!adres || !/\.(jpg|jpeg|png)$/i.test(adres.split('?')[0])) return null;
      if (/\.(webm|ogv|ogg|mp4|mov|svg|gif|pdf|djvu)(\.jpg|\.png)?$/i.test(adres.split('?')[0])) return null;
      if (/\.(webm|ogv|ogg|mp4|mov|svg|gif|pdf|djvu)$/i.test(plik)) return null;
      if (PHOTO_JUNK.test(plik) || CAMERA_DUMP.test(plik)) return null;

      const plikBezOgonkow = stripDiacritics(plik).toLowerCase();
      const kategorie = String(ii.extmetadata?.Categories?.value || '');
      let punkty = 0;
      // Nazwa pliku niosąca nazwę miejsca to najmocniejszy sygnał trafności.
      if (tokeny.some((t) => plikBezOgonkow.includes(t))) punkty += 4;
      // Ocena wystawiona przez ludzi na Commons, nie nasz domysł.
      if (/Featured pictures/i.test(kategorie)) punkty += 3;
      else if (/Quality images/i.test(kategorie)) punkty += 2;
      // Kadr poziomy lepiej wypełnia zdjęcie na karcie niż pionowy.
      if (ii.width && ii.height && ii.width > ii.height) punkty += 1;
      if ((ii.width || 0) >= 1600) punkty += 1;
      // Wnętrza i detale opisują fragment, nie miejsce — na koniec.
      if (PHOTO_DETAL.test(plik)) punkty -= 3;
      return { adres, punkty };
    }).filter(Boolean) as { adres: string; punkty: number }[];

    ocenione.sort((a, b) => b.punkty - a.punkty);
    return ocenione.map((o) => o.adres).slice(0, limit);
  } catch {
    return [];
  }
}

/**
 * Zdjęcia miejsca. Kolejność źródeł jest tu najważniejsza, bo pierwsze zdjęcie
 * ląduje jako duże na karcie miejsca:
 *   1. zdjęcie wiodące z Wikipedii — wybrane przez człowieka,
 *   2. wyszukiwanie po nazwie w Commons,
 *   3. dopiero na końcu to, co leży obok.
 * Punkt trzeci dostał twardy warunek: tytuł pliku musi zawierać słowo z nazwy
 * miejsca albo nazwę miasta. Wcześniej brał cokolwiek w promieniu 250 m, przez co
 * Rynek we Wrocławiu miał jako zdjęcie główne zbliżenie twarzy przypadkowego
 * turysty — plik miał geotag z płyty rynku i to wystarczało.
 */
/**
 * Zdjęcia z Google Places API. Najwyższej jakości, współczesne, kolorowe, robione przez gości
 * i profesjonalnych fotografów. Zwraca bezpośrednie linki do CDN Google.
 */
export async function fetchGooglePlacesPhotos(
  name: string,
  lat?: number,
  lng?: number,
  city?: string,
  limit = 5
): Promise<string[]> {
  const apiKey = process.env.GOOGLE_MAPS_API_KEY;
  if (!apiKey) return [];

  try {
    const query = city ? `${name} ${city}` : name;
    let url = `https://maps.googleapis.com/maps/api/place/findplacefromtext/json?input=${encodeURIComponent(query)}&inputtype=textquery&fields=place_id,name,photos,rating&key=${apiKey}`;
    if (lat != null && lng != null) {
      url += `&locationbias=point:${lat},${lng}`;
    }

    const res = await fetch(url, { signal: AbortSignal.timeout(6000) });
    if (!res.ok) return [];
    const data = (await res.json()) as any;
    const candidate = data.candidates?.[0];
    if (!candidate?.photos || candidate.photos.length === 0) return [];

    const photosToFetch = candidate.photos.slice(0, limit);
    const photoUrls = await Promise.all(
      photosToFetch.map(async (ph: any) => {
        const photoUrl = `https://maps.googleapis.com/maps/api/place/photo?maxwidth=1600&photo_reference=${ph.photo_reference}&key=${apiKey}`;
        try {
          const r = await fetch(photoUrl, { method: 'HEAD', redirect: 'manual', signal: AbortSignal.timeout(4000) });
          const loc = r.headers.get('location');
          /* TYLKO rozwiązany adres CDN. Wcześniej przy braku przekierowania
             zwracaliśmy `photoUrl`, a ten niesie `&key=...` — trafiłby do bazy,
             a stamtąd do przeglądarki KAŻDEGO odwiedzającego. Do tego każde
             wyświetlenie takiego adresu byłoby płatnym wywołaniem Place Photo,
             czyli odwrotnością tego, po co w ogóle rozwiązujemy przekierowanie.
             Lepiej stracić jedno zdjęcie i sięgnąć po zapas z Wikimediów. */
          return loc && loc.startsWith('http') ? loc : '';
        } catch {
          return '';
        }
      })
    );

    // Puste wpisy to zdjęcia, których nie udało się rozwiązać do adresu CDN.
    return photoUrls.filter((u) => !!u);
  } catch (err) {
    console.warn(`[photos] Google Places failed for "${name}":`, err);
    return [];
  }
}

/**
 * Zdjęcia miejsca.
 * 1. Zawsze w pierwszej kolejności sprawdzamy Google Places API (żywe, nowoczesne, pełne światła zdjęcia).
 * 2. Jeśli brak lub za mało — dopełniamy reprezentacyjnym ujęciem z Wikipedii i Commons.
 */
export async function fetchNearbyPhotos(
  name: string, lat?: number, lng?: number, limit = 4, city?: string, wikipediaTag?: string,
  country?: string | null
): Promise<string[]> {
  // Google Places WYCOFANE jako źródło zdjęć. Adres `googleusercontent` zwrócony
  // przez Place Photo nie jest zwolniony z zakazu przechowywania treści Places
  // API — jedynym wyjątkiem, który wolno trzymać bezterminowo, jest `place_id`.
  // `fetchGooglePlacesPhotos` zostaje w kodzie na wypadek powrotu do tematu
  // w modelu zgodnym z regulaminem (place_id + zapytanie na żądanie).

  const origin = lat != null && lng != null ? { lat, lng } : null;

  // Jeśli OSM podaje artykuł wprost, to jest odpowiedź pewna i nie ma po co
  // dobierać artykułu po nazwie i odległości.
  let tagged: string[] = [];
  if (wikipediaTag) {
    const card = await fetchWikiCard(wikipediaTag).catch(() => ({} as any));
    if (card.image && !PHOTO_JUNK.test(card.image)) tagged = [card.image];
  }
  let tokens = distinctiveTokens(name);
  if (tokens.length === 0 && city) tokens = distinctiveTokens(city);

  // Dwa zapytania zamiast jednego. Sama nazwa daje najlepsza trafnosc
  // ("Haags Historisch Museum" -> wlasciwy plik na pierwszym miejscu), a nazwa
  // z LOKALNA nazwa miasta ratuje przypadki, gdy sama nazwa jest pospolita.
  // Polska nazwa miasta w zapytaniu psula wynik: "…haga" zwracalo mapy z XVI w.,
  // a "De Haagsche Kluis haga" nie zwracalo nic.
  const aliasy = aliasyMiasta(city);
  const frazy = [name, ...(aliasy.length ? [`${name} ${aliasy[0]}`] : [])];

  const zArtykulu = await wikiArticlePhotos(wikipediaTag, name).catch(() => [] as string[]);
  // Do listy miast z katalogu (nazwy polskie) dokladamy nazwy uzywane przez
  // Commons — bez nich "Hemingway Bar in Como (Italy)" przechodzil, bo ani
  // "Como", ani "Italy" nie wystepuja w polskim spisie miast.
  const inneMiasta = [...await inneMiastaNiz(city), ...obceNazwyGeograficzne(city, country)];

  const [byWiki, byName, byGeo] = await Promise.all([
    origin ? wikiLeadPhotos(name, origin).catch(() => []) : Promise.resolve([]),
    Promise.all(frazy.map((fraza) => commonsQuery({
      action: 'query', generator: 'search', gsrsearch: fraza, gsrnamespace: '6',
      gsrlimit: String(limit + 4), prop: 'imageinfo|coordinates',
      iiprop: 'url', iiurlwidth: '800'
    }).then((p) => usablePhotos(p, origin, tokens, inneMiasta)).catch(() => [] as string[])))
      .then((zestawy) => zestawy.flat()),
    origin
      ? commonsQuery({
          action: 'query', generator: 'geosearch', ggscoord: `${lat}|${lng}`,
          ggsradius: '250', ggslimit: String(limit + 6), ggsnamespace: '6',
          prop: 'imageinfo', iiprop: 'url', iiurlwidth: '800'
        }).then((p) => usablePhotos(p, origin, tokens, inneMiasta)).catch(() => [])
      : Promise.resolve([])
  ]);

  // Ten sam wyjatek co przy filtrowaniu wynikow wyszukiwania: slowa z nazwy
  // miejsca wypadaja przed testem na smieci. Bez tego "historisch" z PHOTO_JUNK
  // wycinalo plik "960px-Haags_Historisch_Museum.jpg" na samym koncu drogi —
  // po tym, jak wczesniejszy filtr juz go slusznie przepuscil.
  const bezSlowNazwyPliku = (plik: string) => tokens.reduce(
    (tekst, slowo) => tekst.split(stripDiacritics(slowo).toLowerCase()).join(' '), plik);

  const kandydaci = [...new Set([...tagged, ...zArtykulu, ...byWiki, ...byName, ...byGeo])]
    .filter((adres) => {
      const plik = stripDiacritics(decodeURIComponent(adres.split('?')[0].split('/').pop() || '')).toLowerCase();
      if (/\.(webm|ogv|ogg|mp4|mov|svg|gif|pdf|djvu)(\.jpg|\.png)?$/i.test(adres.split('?')[0])) return false;
      const doOceny = bezSlowNazwyPliku(plik);
      if (PHOTO_JUNK.test(doOceny) || CAMERA_DUMP.test(doOceny)) return false;
      return true;
    });

  const tokenyNazwy = distinctiveTokens(name).map((t) => stripDiacritics(t).toLowerCase());
  // Nazwa miasta w tytule pliku to najtansze dostepne potwierdzenie, ze chodzi
  // o TEN egzemplarz obiektu. Pomnik Johana de Witta stoi i w Hadze, i w
  // Rotterdamie; oba pliki maja w tytule jego nazwisko, tylko jeden ma miasto.
  // Odsiewac tego nie mozna — Rotterdamu nie ma w naszym katalogu, wiec nie da
  // sie go rozpoznac jako obcego. Wystarczy jednak, ze plik z wlasciwym miastem
  // wygra ranking.
  const aliasyDoRankingu = aliasyMiasta(city).map((a) => a.replace(/\s+/g, ''));
  const punktyZaMiasto = (plik: string) =>
    aliasyDoRankingu.some((a) => plik.replace(/[^a-z0-9]/g, '').includes(a)) ? 3 : 0;

  const punktyZa = (adres: string) => {
    let p = 0;
    // Google Places ma najwyższy priorytet
    if (adres.includes('googleusercontent.com') || adres.includes('maps.googleapis.com')) return 10;
    const plik = stripDiacritics(decodeURIComponent(adres.split('?')[0].split('/').pop() || '')).toLowerCase();
    if (tokenyNazwy.some((t) => plik.includes(t))) p += 4;
    p += punktyZaMiasto(plik);
    if (PHOTO_DETAL.test(plik)) p -= 3;
    if (COS_W_SRODKU.test(plik.replace(/[_-]/g, ' '))) p -= 3;
    if (tagged.includes(adres)) p += 2;
    return p;
  };

  return kandydaci
    .map((adres, i) => ({ adres, p: punktyZa(adres), i }))
    .sort((a, b) => b.p - a.p || a.i - b.i)
    .map((x) => x.adres)
    .slice(0, limit);
}

export { fetchWikiCard };
