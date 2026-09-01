import { repo } from '../db/repository.js';

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

/** Pliki, które nigdy nie są zdjęciem miejsca: herby, flagi, mapy, schematy. */
const PHOTO_JUNK = /(coat.of.arms|flag|logo|icon|\bmap\b|mapa|karte|plan\b|diagram|blazon|wikidata|locator|satellite)/i;

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
const PHOTO_DETAL = /(interior|interno|interieur|wnetrz|detail|detal|ceiling|sufit|plafon|soffitto|chandelier|zyrandol|żyrandol|plaque|tablica|inscription|inskrypcj|door|drzwi|window|okno|staircase|schody|fresco|fresk|mosaic|mozaik|column|kolumn|ornament|handle|klamka|sign\b)/i;

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

async function commonsQuery(params: Record<string, string>): Promise<any[]> {
  const url = 'https://commons.wikimedia.org/w/api.php?' + new URLSearchParams({ format: 'json', ...params });
  const res = await fetch(url, {
    headers: { 'User-Agent': COMMONS_UA },
    signal: AbortSignal.timeout(9000)
  });
  if (!res.ok) return [];
  const data = await res.json() as any;
  return Object.values(data?.query?.pages || {});
}

function usablePhotos(pages: any[], origin: { lat: number; lng: number } | null,
                      nameTokens: string[] | null, inneMiasta: string[] | null = null): string[] {
  return pages
    .sort((a, b) => (a.index ?? 99) - (b.index ?? 99))
    .filter((p) => !PHOTO_JUNK.test(p.title || '') && !CAMERA_DUMP.test(p.title || ''))
    .filter((p) => {
      const c = p.coordinates?.[0];
      // 25 km wpuszczało cały ośrodek miasta: wyszukiwanie "Arc de Triomphe"
      // dawało też geotagowane zdjęcia Łuku Karuzelowego, bo ten stoi 3 km dalej
      // i tylko odległość decydowała -- tytuł pliku nikt nie sprawdzał. 2 km
      // to margines na niedokładność GPS aparatu, nie na sąsiedni zabytek.
      if (c) return !origin || kmApart(origin, { lat: c.lat, lng: c.lon }) < 2;
      // Plik bez geotagu przyjmujemy tylko wtedy, gdy w tytule siedzi wyróżniające
      // słowo z nazwy miejsca — inaczej "Sandy beach" zwracało pirogę na Karaibach,
      // a dobre zdjęcia zamku w Durrës geotagu po prostu nie mają.
      if (!nameTokens) return true;
      const title = String(p.title || '').toLowerCase();
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
export async function fetchNearbyPhotos(
  name: string, lat?: number, lng?: number, limit = 4, city?: string, wikipediaTag?: string
): Promise<string[]> {
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

  // Miasto zawsze w zapytaniu do Commons. Wcześniej znikało z frazy, gdy nazwa
  // miała choć jeden wyróżniający token — czyli prawie zawsze — więc "Hala
  // Targowa" czy "Kościół Świętego Wojciecha" szukane samo trafiało identycznie
  // nazwane obiekty z całej Polski na równi z właściwym.
  const searchPhrase = city ? `${name} ${city}` : name;

  const zArtykulu = await wikiArticlePhotos(wikipediaTag, name).catch(() => [] as string[]);
  const inneMiasta = await inneMiastaNiz(city);

  const [byWiki, byName, byGeo] = await Promise.all([
    origin ? wikiLeadPhotos(name, origin).catch(() => []) : Promise.resolve([]),
    searchPhrase
      ? commonsQuery({
          action: 'query', generator: 'search', gsrsearch: searchPhrase, gsrnamespace: '6',
          gsrlimit: String(limit + 4), prop: 'imageinfo|coordinates',
          iiprop: 'url', iiurlwidth: '800'
        }).then((p) => usablePhotos(p, origin, tokens, inneMiasta)).catch(() => [])
      : Promise.resolve([]),
    origin
      ? commonsQuery({
          action: 'query', generator: 'geosearch', ggscoord: `${lat}|${lng}`,
          ggsradius: '250', ggslimit: String(limit + 6), ggsnamespace: '6',
          prop: 'imageinfo', iiprop: 'url', iiurlwidth: '800'
        }).then((p) => usablePhotos(p, null, tokens.length > 0 ? tokens : null, inneMiasta)).catch(() => [])
      : Promise.resolve([])
  ]);

  // Kolejność źródeł jest punktem wyjścia, nie wyrokiem: wiodące, artykuł,
  // nazwa, okolica. Artykuł NIE wygrywa automatycznie — bywa ubogi albo pokazuje
  // obiekt pokrewny (artykuł o Pałacu Parlamentu ma zdjęcie Zamku Peleș).
  const kandydaci = [...new Set([...tagged, ...zArtykulu, ...byWiki, ...byName, ...byGeo])];

  // Jedyna informacja, którą mamy o KAŻDYM kandydacie niezależnie od źródła, to
  // nazwa pliku. Ona rozstrzyga, gdy źródła się nie zgadzają.
  const tokenyNazwy = distinctiveTokens(name).map((t) => stripDiacritics(t).toLowerCase());
  const punktyZa = (adres: string) => {
    const plik = stripDiacritics(decodeURIComponent(adres.split('?')[0].split('/').pop() || '')).toLowerCase();
    let p = 0;
    if (tokenyNazwy.some((t) => plik.includes(t))) p += 4;
    if (PHOTO_DETAL.test(plik)) p -= 3;
    if (tagged.includes(adres)) p += 2;
    return p;
  };

  // Sortowanie stabilne: przy równych punktach kolejność źródeł zostaje.
  return kandydaci
    .map((adres, i) => ({ adres, p: punktyZa(adres), i }))
    .sort((a, b) => b.p - a.p || a.i - b.i)
    .map((x) => x.adres)
    .slice(0, limit);
}

export { fetchWikiCard };
