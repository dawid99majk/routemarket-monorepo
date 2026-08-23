/**
 * Pobieranie stron podanych przez użytkownika, bez otwierania furtki do sieci wewnętrznej.
 *
 * Endpoint wyciągający miejsca z artykułu ma z założenia przyjmować DOWOLNY adres —
 * na tym polega jego użyteczność, więc lista dozwolonych hostów (jak przy rozwijaniu
 * skrótów map) tutaj nie przejdzie. Zamiast pytać „czy ten host jest na liście",
 * pytamy więc „czy ten adres wskazuje na coś, co należy do nas".
 *
 * Sama kontrola tekstu adresu nic nie daje. `http://127.0.0.1` da się zablokować
 * dopasowaniem, ale nazwa własnej domeny może wskazywać na pętlę zwrotną, a wtedy
 * napis wygląda niewinnie. Dlatego rozwiązujemy nazwę w DNS i sprawdzamy ADRESY,
 * nie napis — i odrzucamy, gdy którykolwiek z nich leży w sieci prywatnej.
 *
 * Przekierowania rozwijamy sami. Zewnętrzny adres potrafi odpowiedzieć
 * przekierowaniem na `http://169.254.169.254/` (metadane maszyny w chmurze), więc
 * sprawdzanie wyłącznie pierwszego skoku byłoby sprawdzaniem nie tego, co trzeba.
 */
import { lookup } from 'node:dns/promises';

export class NiedozwolonyAdres extends Error {}

/** Czy adres IPv4 należy do puli, której serwer nie ma prawa odpytywać. */
function prywatnyIPv4(ip: string): boolean {
  const o = ip.split('.').map(Number);
  if (o.length !== 4 || o.some((n) => Number.isNaN(n) || n < 0 || n > 255)) return true;
  const [a, b] = o;
  return (
    a === 0 ||                          // "ten host"
    a === 10 ||                         // prywatna
    a === 127 ||                        // pętla zwrotna
    (a === 100 && b >= 64 && b <= 127) || // CGNAT
    (a === 169 && b === 254) ||         // link-local, w tym metadane chmury
    (a === 172 && b >= 16 && b <= 31) || // prywatna
    (a === 192 && b === 168) ||         // prywatna
    (a === 192 && b === 0) ||           // dokumentacja/IETF
    a >= 224                            // multicast i zarezerwowane
  );
}

function prywatnyIPv6(ip: string): boolean {
  const a = ip.toLowerCase().replace(/^\[|\]$/g, '');
  if (a === '::1' || a === '::') return true;
  // Adresy IPv4 opakowane w IPv6 obchodzą kontrolę v6, jeśli się ich nie rozpakuje.
  const zmapowany = a.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  if (zmapowany) return prywatnyIPv4(zmapowany[1]);
  const pierwsze = a.split(':')[0];
  if (/^f[cd]/.test(pierwsze)) return true;              // unikalne lokalne
  if (/^fe[89ab]/.test(pierwsze)) return true;           // link-local
  return false;
}

async function adresProwadziDoSieciWewnetrznej(host: string): Promise<boolean> {
  // Adres podany wprost jako IP nie przechodzi przez DNS, więc sprawdzamy go od razu.
  if (/^\d+\.\d+\.\d+\.\d+$/.test(host)) return prywatnyIPv4(host);
  if (host.includes(':')) return prywatnyIPv6(host);

  try {
    const wyniki = await lookup(host, { all: true });
    if (!wyniki.length) return true;
    // Wystarczy jeden adres w sieci prywatnej, żeby odmówić: przy wielu wpisach
    // A nie mamy wpływu na to, który wybierze warstwa sieciowa.
    return wyniki.some((w) => (w.family === 4 ? prywatnyIPv4(w.address) : prywatnyIPv6(w.address)));
  } catch {
    // Nazwa nie do rozwiązania — nie ma czego pobierać, a zgadywanie nie pomoże.
    return true;
  }
}

export interface OpcjePobrania {
  naglowki?: Record<string, string>;
  limitMs?: number;
  maksSkokow?: number;
  /** Górna granica czytanej treści; strony bez limitu potrafią lecieć bez końca. */
  maksBajtow?: number;
}

/**
 * Pobiera stronę, sprawdzając każdy skok przekierowania osobno.
 * Rzuca `NiedozwolonyAdres`, gdy adres wskazuje na sieć wewnętrzną albo na
 * protokół inny niż http/https.
 */
export async function pobierzZewnetrzna(
  wejscie: string,
  opcje: OpcjePobrania = {}
): Promise<{ tekst: string; adresKoncowy: string; status: number }> {
  const limitMs = opcje.limitMs ?? 12_000;
  const maksSkokow = opcje.maksSkokow ?? 4;
  const maksBajtow = opcje.maksBajtow ?? 2_000_000;

  let biezacy = wejscie;
  for (let skok = 0; skok <= maksSkokow; skok++) {
    let url: URL;
    try {
      url = new URL(biezacy);
    } catch {
      throw new NiedozwolonyAdres('To nie wygląda na poprawny adres.');
    }
    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
      throw new NiedozwolonyAdres('Obsługuję wyłącznie adresy http i https.');
    }
    if (await adresProwadziDoSieciWewnetrznej(url.hostname)) {
      throw new NiedozwolonyAdres('Tego adresu nie mogę pobrać.');
    }

    const res = await fetch(url.toString(), {
      headers: opcje.naglowki,
      redirect: 'manual',
      signal: AbortSignal.timeout(limitMs),
    });

    if (res.status >= 300 && res.status < 400) {
      const cel = res.headers.get('location');
      if (!cel) throw new NiedozwolonyAdres('Przekierowanie bez adresu docelowego.');
      // Adres względny rozwijamy względem bieżącego, żeby nie wypaść z pętli kontroli.
      biezacy = new URL(cel, url).toString();
      continue;
    }

    if (!res.ok) {
      return { tekst: '', adresKoncowy: url.toString(), status: res.status };
    }

    // Czytamy strumieniem i przerywamy po przekroczeniu limitu, zamiast wciągać
    // do pamięci cokolwiek, co serwer zechce wysłać.
    const czytnik = res.body?.getReader();
    if (!czytnik) return { tekst: await res.text(), adresKoncowy: url.toString(), status: res.status };
    const dekoder = new TextDecoder();
    let tekst = '';
    let bajtow = 0;
    while (true) {
      const { done, value } = await czytnik.read();
      if (done) break;
      bajtow += value.length;
      tekst += dekoder.decode(value, { stream: true });
      if (bajtow >= maksBajtow) { await czytnik.cancel(); break; }
    }
    return { tekst, adresKoncowy: url.toString(), status: res.status };
  }

  throw new NiedozwolonyAdres('Za dużo przekierowań.');
}
