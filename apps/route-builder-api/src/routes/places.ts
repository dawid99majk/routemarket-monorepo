import { Hono } from 'hono';
import { repo } from '../db/repository.js';
import { geocodingService } from '../services/geocoding.js';
import { poiService } from '../services/poi.js';
import { callGeminiTracked } from '../services/ai-usage.js';
import { pobierzZewnetrzna, NiedozwolonyAdres } from '../services/bezpieczne-pobieranie.js';
import { COMMONS_UA } from '../services/photos.js';
import { kategoriaZRodzaju } from '../services/katalog-helpers.js';

export const placesRouter = new Hono<{ Variables: { user: any, userId: string } }>();

/**
 * Rozpoznanie miejsca z wklejonego odnośnika. Ludzie zbierają miejsca tam, gdzie
 * je znajdą — w mapach Google, w wiadomości od znajomego, w artykule — i przepisywanie
 * nazwy ręcznie gubi po drodze położenie.
 *
 * Adresy pobieramy wyłącznie z krótkiej listy znanych serwisów map i tylko po to,
 * żeby rozwinąć skrót. Serwer nie ma prawa chodzić pod dowolny adres podany przez
 * użytkownika: to prosta droga do wyciągania nim rzeczy z sieci wewnętrznej.
 */
const DOZWOLONE_HOSTY = new Set([
  'maps.google.com', 'www.google.com', 'google.com', 'maps.app.goo.gl', 'goo.gl',
  'www.openstreetmap.org', 'openstreetmap.org', 'osm.org', 'www.osm.org',
  'maps.apple.com',
]);

function hostDozwolony(u: string): boolean {
  try {
    const url = new URL(u);
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return false;
    return DOZWOLONE_HOSTY.has(url.hostname.toLowerCase());
  } catch {
    return false;
  }
}

/** Współrzędne z typowych postaci adresów map. */
function wspolrzedneZAdresu(u: string): { lat: number; lng: number } | null {
  const wzory = [
    /!3d(-?\d+\.\d+)!4d(-?\d+\.\d+)/,        // Google, pełny odnośnik miejsca
    /@(-?\d+\.\d+),(-?\d+\.\d+)/,             // Google, widok mapy
    /[?&]q=(-?\d+\.\d+),\s*(-?\d+\.\d+)/,     // ?q=lat,lng
    /[?&]ll=(-?\d+\.\d+),\s*(-?\d+\.\d+)/,    // Apple Maps
    /#map=\d+\/(-?\d+\.\d+)\/(-?\d+\.\d+)/,  // OpenStreetMap
    /[?&]mlat=(-?\d+\.\d+)&mlon=(-?\d+\.\d+)/, // OpenStreetMap, pinezka
  ];
  for (const w of wzory) {
    const m = u.match(w);
    if (m) {
      const lat = Number(m[1]), lng = Number(m[2]);
      if (Math.abs(lat) <= 90 && Math.abs(lng) <= 180) return { lat, lng };
    }
  }
  return null;
}

/**
 * Odnośnik wyszukiwania: /maps/search/<fraza>/@lat,lng,zoom. To nie jest jedno
 * miejsce, tylko obszar z zapytaniem — potraktowany jak punkt zwraca cokolwiek
 * leży pod środkiem mapy. Przy odnośniku "Atrakcje" wokół Beratu wychodziło
 * z tego osiedle mieszkaniowe.
 */
function zapytanieZAdresu(u: string): string | null {
  const m = u.match(/\/maps\/search\/([^/@?]+)/);
  if (!m) return null;
  const fraza = decodeURIComponent(m[1].replace(/\+/g, ' ')).trim();
  return fraza && !/^-?\d+\.\d+,/.test(fraza) ? fraza : null;
}

/** Nazwa z segmentu /place/<nazwa>/ albo z parametru q. */
function nazwaZAdresu(u: string): string | null {
  const m = u.match(/\/place\/([^/@?]+)/);
  if (m) {
    const nazwa = decodeURIComponent(m[1].replace(/\+/g, ' ')).trim();
    if (nazwa && !/^-?\d+\.\d+,/.test(nazwa)) return nazwa;
  }
  try {
    const q = new URL(u).searchParams.get('q');
    if (q && !/^-?\d+\.\d+,/.test(q)) return decodeURIComponent(q.replace(/\+/g, ' ')).trim();
  } catch { /* nieparsowalny adres pomijamy */ }
  return null;
}

/**
 * Rozwinięcie skróconego odnośnika krok po kroku. Ustawienie redirect: 'follow'
 * daje tylko adres końcowy, a przy Mapach Google po drodze bywa strona zgody:
 * końcówka nie mówi wtedy nic, mimo że właściwy adres siedzi w jej parametrze
 * "continue". Sprawdzamy każdy przystanek i zatrzymujemy się na pierwszym,
 * z którego da się cokolwiek odczytać.
 */
async function rozwinSkrot(start: string): Promise<string> {
  let biezacy = start;
  for (let krok = 0; krok < 5; krok++) {
    if (!hostDozwolony(biezacy) && !biezacy.includes('consent.google.com')) break;
    let res: Response;
    try {
      res = await fetch(biezacy, { redirect: 'manual', signal: AbortSignal.timeout(8000) });
    } catch {
      break;
    }

    const nastepny = res.headers.get('location');
    if (!nastepny) {
      // Bez kolejnego przystanku: adres końcowy to wszystko, co mamy.
      if (res.url && (wspolrzedneZAdresu(res.url) || nazwaZAdresu(res.url))) return res.url;
      break;
    }

    const pelny = new URL(nastepny, biezacy).toString();
    // Strona zgody chowa właściwy adres w parametrze.
    if (pelny.includes('consent.google.com')) {
      try {
        const dalej = new URL(pelny).searchParams.get('continue');
        if (dalej) { biezacy = dalej; continue; }
      } catch { /* nieparsowalny adres pomijamy */ }
    }

    if (wspolrzedneZAdresu(pelny) || nazwaZAdresu(pelny)) return pelny;
    biezacy = pelny;
  }
  return biezacy;
}

placesRouter.post('/from-link', async (c) => {
  try {
    const { link, city } = await c.req.json() as { link: string; city?: string };
    const wejscie = (link || '').trim();
    if (!wejscie) return c.json({ error: 'Podaj odnośnik albo nazwę' }, 400);

    let adres = wejscie;
    let zrodlo = 'tekst';

    if (/^https?:\/\//i.test(wejscie)) {
      if (!hostDozwolony(wejscie)) {
        return c.json({
          error: 'Ten serwis nie jest obsługiwany. Obsługujemy odnośniki z Map Google, OpenStreetMap i Apple Maps.',
        }, 400);
      }
      zrodlo = 'odnośnik';
      // Skrót rozwijamy tylko wtedy, gdy sam adres nic nie mówi. Przekierowanie
      // potrafi zgubić parametry — Apple Maps przenosi na stronę bez współrzędnych,
      // przez które wklejony odnośnik był czytelny.
      if (!wspolrzedneZAdresu(wejscie) && !nazwaZAdresu(wejscie)) {
        adres = await rozwinSkrot(wejscie);
      }
    }

    const wsp = wspolrzedneZAdresu(adres) ?? wspolrzedneZAdresu(wejscie);
    const nazwaZLinku = nazwaZAdresu(adres) ?? nazwaZAdresu(wejscie);
    const fraza = zapytanieZAdresu(adres) ?? zapytanieZAdresu(wejscie);

    // Wyszukiwanie po obszarze zwraca listę, nie jeden punkt. Bierzemy prawdziwe
    // obiekty z OpenStreetMap wokół środka mapy zamiast zgadywać, co użytkownik
    // miał na myśli pod tymi współrzędnymi.
    if (fraza && wsp) {
      const kandydaci = await poiService
        .fetchCandidates({ lat: wsp.lat, lng: wsp.lng }, 'city_walk', { radiusKm: 6, limit: 40 })
        .catch(() => [] as any[]);

      const norm = (t: string) => t.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
      const slowa = norm(fraza).split(/[^a-z0-9]+/).filter((w) => w.length >= 4);
      // Frazy ogólne ("atrakcje", "co zobaczyć") nie zawężają — chodzi o wszystko,
      // co w tej okolicy warto zobaczyć.
      const OGOLNE = ['atrakcje', 'attractions', 'zwiedzanie', 'zabytki', 'things', 'miejsca'];
      const ogolne = slowa.length === 0 || slowa.some((w) => OGOLNE.includes(w));

      const dopasowane = ogolne
        ? kandydaci
        : kandydaci.filter((k: any) => {
            const t = norm(`${k.name} ${k.kind ?? ''}`);
            return slowa.some((w) => t.includes(w));
          });

      const lista = (dopasowane.length ? dopasowane : kandydaci).slice(0, 20).map((k: any) => ({
        name: k.name, lat: k.lat, lng: k.lng, kind: k.kind ?? null,
        opening_hours: k.openingHours ?? null, website: k.website ?? null,
        category: kategoriaZRodzaju(k.kind),
      }));

      console.log(`[places/from-link] obszar "${fraza}": ${lista.length} miejsc`);
      return c.json({ places: lista, query: fraza, mode: 'obszar', source: zrodlo });
    }

    // Ze współrzędnych bierzemy prawdziwą nazwę i adres z OpenStreetMap — nazwa
    // z odnośnika bywa skrócona albo w innym języku.
    if (wsp) {
      try {
        const url = 'https://nominatim.openstreetmap.org/reverse?' + new URLSearchParams({
          lat: String(wsp.lat), lon: String(wsp.lng), format: 'jsonv2', addressdetails: '1', zoom: '18',
        });
        const res = await fetch(url, { headers: { 'User-Agent': COMMONS_UA }, signal: AbortSignal.timeout(8000) });
        const d = res.ok ? await res.json() as any : null;
        const adr = d?.address ?? {};
        // Odwrotne geokodowanie zwraca to, co akurat stoi pod tymi współrzędnymi:
        // dla widoku mapy bywa to przypadkowy lokal albo sam numer domu. Nazwa
        // z odnośnika jest wiarygodniejsza, a gdy jej nie ma, uczciwiej podać
        // ulicę niż podsunąć cudzą wizytówkę jako nazwę miejsca.
        const zAdresu = [adr.road, adr.house_number].filter(Boolean).join(' ');
        const nazwaZOdwrotnego = d?.name && String(d.name).length > 2 && !/^\d+$/.test(String(d.name))
          ? d.name : null;
        return c.json({
          place: {
            name: nazwaZLinku || nazwaZOdwrotnego || zAdresu || d?.display_name?.split(',')[0] || 'Wskazane miejsce',
            lat: wsp.lat, lng: wsp.lng,
            city: adr.city || adr.town || adr.village || adr.municipality || city?.trim() || null,
            country: adr.country_code ? String(adr.country_code).toUpperCase() : null,
            kind: d?.type ?? null,
            category: 'attraction',
          },
          source: zrodlo,
        });
      } catch {
        return c.json({
          place: {
            name: nazwaZLinku || 'Miejsce bez nazwy', lat: wsp.lat, lng: wsp.lng,
            city: city?.trim() || null, country: null, kind: null, category: 'attraction',
          },
          source: zrodlo,
        });
      }
    }

    // Bez współrzędnych zostaje nazwa — szukamy jej tak samo jak w podpowiedziach.
    const szukane = nazwaZLinku || (zrodlo === 'tekst' ? wejscie : null);
    if (!szukane) {
      return c.json({
        error: zrodlo === 'odnośnik'
          ? 'Z tego odnośnika nie da się odczytać miejsca. Otwórz go i wklej pełny adres z paska przeglądarki albo samą nazwę miejsca.'
          : 'Nie znalazłem w tym odnośniku ani nazwy, ani współrzędnych.',
      }, 422);
    }

    const g = await geocodingService.geocodeSinglePoint(
      city?.trim() ? `${szukane}, ${city.trim()}` : szukane
    );
    if (!g?.lat) return c.json({ error: `Nie udało się ustalić położenia dla: ${szukane}` }, 422);

    return c.json({
      place: {
        name: szukane, lat: g.lat, lng: g.lng,
        city: city?.trim() || null, country: null, kind: null, category: 'attraction',
      },
      source: zrodlo,
    });
  } catch (e: any) {
    console.error('[places/from-link]', e);
    return c.json({ error: e.message }, 500);
  }
});

/**
 * Wyłuskanie miejsc z wklejonego tekstu albo z artykułu.
 *
 * Świadomie nie pobieramy niczego z Instagrama, Facebooka ani Pinteresta. Treści
 * tam są za logowaniem, ich regulaminy zabraniają zbierania danych, a obejście
 * tego oznaczałoby albo łamanie warunków, albo proszenie użytkownika o hasło —
 * i jedno, i drugie odpada. Zamiast tego przyjmujemy tekst, który użytkownik sam
 * skopiował: opis posta, listę z bloga, wiadomość od znajomego. Działa wszędzie,
 * bo nie zależy od żadnego serwisu, i nie narusza niczyich warunków.
 *
 * Publiczne artykuły pobieramy, bo to zwykłe strony WWW, ale zwracamy z nich
 * wyłącznie nazwy i położenia — czyli fakty — a nie cudzy tekst.
 */
placesRouter.post('/extract', async (c) => {
  try {
    const { text, url, city, limit = 12 } = await c.req.json() as
      { text?: string; url?: string; city?: string; limit?: number };
    const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
    if (!GEMINI_API_KEY) throw new Error('Missing GEMINI_API_KEY');

    let tresc = (text || '').trim();
    let zrodlo = 'tekst';

    if (!tresc && url?.trim()) {
      const adres = url.trim();
      let host = '';
      try { host = new URL(adres).hostname.toLowerCase(); } catch { /* sprawdzimy niżej */ }
      if (!host) return c.json({ error: 'To nie wygląda na poprawny adres.' }, 400);

      const ZABLOKOWANE = ['instagram.com', 'facebook.com', 'fb.com', 'pinterest.', 'tiktok.com', 'x.com', 'twitter.com'];
      if (ZABLOKOWANE.some((z) => host.includes(z))) {
        return c.json({
          error: 'Tego serwisu nie pobieram — treści są tam za logowaniem, a jego regulamin zabrania zbierania danych. Skopiuj opis posta i wklej go jako tekst; zadziała tak samo.',
        }, 400);
      }

      try {
        // Adres sprawdzany po ROZWIĄZANIU nazwy w DNS, nie po samym napisie, i na
        // każdym skoku przekierowania osobno — inaczej wystarczyłaby własna domena
        // wskazująca na pętlę zwrotną albo przekierowanie na metadane maszyny.
        const pobrane = await pobierzZewnetrzna(adres, {
          naglowki: { 'User-Agent': COMMONS_UA },
          limitMs: 12_000,
        });
        if (pobrane.status >= 400) {
          return c.json({ error: `Strona odpowiedziała błędem ${pobrane.status}.` }, 422);
        }
        const html = pobrane.tekst;
        // Sam tekst: znaczniki, skrypty i style tylko zaśmiecają wejście modelu.
        tresc = html
          .replace(/<script[\s\S]*?<\/script>/gi, ' ')
          .replace(/<style[\s\S]*?<\/style>/gi, ' ')
          .replace(/<[^>]+>/g, ' ')
          .replace(/&nbsp;/g, ' ')
          .replace(/\s+/g, ' ')
          .trim()
          .slice(0, 12_000);
        zrodlo = 'artykuł';
      } catch (err) {
        // Odmowa z powodu adresu to nie awaria pobierania — użytkownik ma dostać
        // inny komunikat i inny kod niż przy stronie, która po prostu nie odpowiada.
        if (err instanceof NiedozwolonyAdres) return c.json({ error: err.message }, 400);
        return c.json({ error: 'Nie udało się pobrać tej strony.' }, 422);
      }
    }

    if (tresc.length < 20) return c.json({ error: 'Za mało treści, żeby cokolwiek z niej wyłuskać.' }, 400);

    const prompt = `Z poniższego tekstu wypisz konkretne miejsca do odwiedzenia${
      city?.trim() ? ` w mieście ${city.trim()} i okolicy` : ''
    }.

Zasady:
- tylko miejsca, które w tekście naprawdę występują; nie dopisuj własnych propozycji,
- nazwa dokładnie tak, jak w tekście, bez tłumaczenia i bez upiększania,
- pomiń hotele sieciowe, sklepy sieciowe i rzeczy, których nie da się odwiedzić,
- jeśli tekst nie wymienia żadnego miejsca, zwróć pustą listę.

Dla każdego miejsca podaj:
- "name": nazwa
- "kind": rodzaj jednym słowem (muzeum, park, restauracja, punkt widokowy…)
- "note": maksymalnie jedno zdanie, dlaczego tekst je wymienia

TEKST:
${tresc.slice(0, 12_000)}

Odpowiedz WYŁĄCZNIE obiektem JSON: {"places": [...]}`;

    const data = await callGeminiTracked(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`,
      {
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          responseMimeType: 'application/json',
          responseSchema: {
            type: 'object',
            properties: {
              places: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    name: { type: 'string' }, kind: { type: 'string' }, note: { type: 'string' },
                  },
                  required: ['name'],
                },
              },
            },
            required: ['places'],
          },
          maxOutputTokens: 4096,
        },
      },
      { operation: 'places-extract', model: 'gemini-2.5-flash', userId: c.get('userId') || null }
    );

    const odp = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
    let znalezione: any[] = [];
    try {
      const czyste = odp.replace(/```json/gi, '').replace(/```/g, '').trim();
      const a = czyste.indexOf('{'), b = czyste.lastIndexOf('}');
      if (a >= 0 && b > a) znalezione = JSON.parse(czyste.slice(a, b + 1)).places || [];
    } catch {
      console.warn('[places/extract] nie udało się sparsować odpowiedzi');
    }

    // Współrzędne ustalamy sami — model ich nie zgaduje. Wynik sprawdzamy odległością
    // od miasta, bo nazwy z tekstu bywają odmienione ("Alfamę" zamiast "Alfama")
    // i geokoder potrafi wtedy trafić w zupełnie inne miejsce na świecie: przy
    // pierwszym teście dzielnica Lizbony wylądowała pod Oulu w Finlandii. Punkt
    // bez położenia jest uczciwszy niż punkt trzy tysiące kilometrów od celu.
    let centrum: { lat: number; lng: number } | null = null;
    if (city?.trim()) {
      try { centrum = await geocodingService.geocodeSettlement(city.trim()); } catch { /* bez kontroli */ }
    }
    const kmOdCentrum = (lat: number, lng: number) => {
      if (!centrum) return 0;
      const dLat = (lat - centrum.lat) * 111;
      const dLng = (lng - centrum.lng) * 111 * Math.cos((centrum.lat * Math.PI) / 180);
      return Math.sqrt(dLat * dLat + dLng * dLng);
    };

    let odrzucone = 0;
    const wynik = await Promise.all(
      znalezione.slice(0, limit).map(async (m: any) => {
        const podstawa = { name: m.name, kind: m.kind ?? null, note: m.note ?? null };
        try {
          const g = await geocodingService.geocodeSinglePoint(
            city?.trim() ? `${m.name}, ${city.trim()}` : m.name
          );
          if (!g?.lat) return { ...podstawa, lat: null, lng: null };
          if (kmOdCentrum(g.lat, g.lng) > 60) {
            odrzucone++;
            return { ...podstawa, lat: null, lng: null, poza_zasiegiem: true };
          }
          return { ...podstawa, lat: g.lat, lng: g.lng };
        } catch {
          return { ...podstawa, lat: null, lng: null };
        }
      })
    );
    if (odrzucone > 0) console.log(`[places/extract] odrzucono ${odrzucone} położeń poza zasięgiem miasta`);

    console.log(`[places/extract] ${zrodlo}: znaleziono ${wynik.length}, z położeniem ${wynik.filter((w) => w.lat != null).length}`);
    return c.json({ places: wynik, source: zrodlo });
  } catch (e: any) {
    console.error('[places/extract]', e);
    return c.json({ error: e.message }, 500);
  }
});

/**
 * Podpowiedzi nazw miejsc. Osobno od /discover-places, bo tamten punkt pyta model
 * i odpowiada po kilkunastu, czasem dwudziestu kilku sekundach — co jest w porządku
 * dla pytania "gdzie zjeść z dzieckiem", a absurdalne dla kogoś, kto wpisuje
 * "Eiffel" i wie, czego szuka. Tutaj nie ma modelu: najpierw własny katalog,
 * potem nazwy z OpenStreetMap w okolicy miasta.
 */
placesRouter.post('/suggest', async (c) => {
  try {
    const { query, city, limit = 6 } = await c.req.json() as
      { query: string; city?: string; limit?: number };
    const q = (query || '').trim();
    if (q.length < 2) return c.json({ suggestions: [] });

    const norm = (t: string) => t.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
    const wynik: any[] = [];
    const widziane = new Set<string>();

    const dodaj = (m: any) => {
      const k = norm(m.name || '');
      if (!k || widziane.has(k)) return;
      widziane.add(k);
      wynik.push(m);
    };

    // 1. Katalog — natychmiast, bo to nasza baza i mamy w niej zdjęcia i opisy.
    try {
      const zKatalogu = await repo.searchCatalogByName(q, city?.trim() || null, limit);
      for (const m of zKatalogu) dodaj({ ...m, source: 'catalog' });
    } catch (err) {
      console.warn('[places/suggest] katalog:', err);
    }

    // 2. OpenStreetMap — dla nazw, których jeszcze nie mamy u siebie. Wynik
    //    ograniczamy do okolicy miasta, żeby "Rynek" nie przyniósł rynku
    //    z drugiego końca Europy.
    if (wynik.length < limit && city?.trim()) {
      try {
        const centrum = await geocodingService.geocodeSettlement(city.trim());
        const url = 'https://nominatim.openstreetmap.org/search?' + new URLSearchParams({
          q, format: 'jsonv2', limit: String(limit * 2), addressdetails: '1',
          viewbox: [centrum.lng - 0.35, centrum.lat + 0.25, centrum.lng + 0.35, centrum.lat - 0.25].join(','),
          bounded: '1',
        });
        const res = await fetch(url, {
          headers: { 'User-Agent': COMMONS_UA },
          signal: AbortSignal.timeout(6000),
        });
        if (res.ok) {
          const dane = await res.json() as any[];
          for (const d of dane) {
            if (wynik.length >= limit) break;
            const nazwa = String(d.name || d.display_name || '').split(',')[0].trim();
            if (!nazwa) continue;
            dodaj({
              id: null, slug: null, name: nazwa, city: city.trim(),
              country: centrum.countryCode ?? null,
              lat: Number(d.lat), lng: Number(d.lon),
              // Rodzaj zamiast wpisanej na sztywno atrakcji: przy szukaniu bazy
              // podpowiedź "Hotel Mercure" opisana jako atrakcja wygląda na pomyłkę.
              category: kategoriaZRodzaju(d.type || d.class || null),
              kind: d.type || d.category || null,
              photos: [], visit_minutes: null, opening_hours: null,
              description: null, source: 'osm',
            });
          }
        }
      } catch (err) {
        console.warn('[places/suggest] OSM:', err);
      }
    }

    return c.json({ suggestions: wynik.slice(0, limit) });
  } catch (e: any) {
    console.error('[places/suggest]', e);
    return c.json({ error: e.message }, 500);
  }
});
