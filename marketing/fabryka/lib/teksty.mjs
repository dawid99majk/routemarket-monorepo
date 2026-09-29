/**
 * Podpisy pod posty — składane z danych, bez modelu językowego.
 *
 * Każde zdanie z liczbą ma tę liczbę z bazy: suma minut zwiedzania, liczba
 * miejsc, godziny. Model byłby lepszym stylistą, ale gorszym księgowym, a głos
 * RouteMarketu stoi na tym, że liczby się zgadzają (skill routemarket-glos).
 * Warianty zaczepień rotują, żeby tydzień postów nie brzmiał jak jeden szablon.
 *
 * Zasady głosu pilnowane tutaj: bez emoji, bez wykrzykników, bez „niesamowity”,
 * ograniczenie mówione wprost, nazwy własne bez tłumaczenia.
 */
import { czas, ileMiejsc, ileDni, odmien, hashtag, wMiescie, miasta2 } from './formaty.mjs';

const GODZIN_DZIENNIE = 6;

/** Obserwacja agenta policzona z danych: ile to naprawdę dni zwiedzania. */
export function wniosekAgenta(miejsca, dniTablicy) {
  const zCzasem = miejsca.filter((m) => m.minuty);
  const suma = zCzasem.reduce((s, m) => s + m.minuty, 0);
  const brak = miejsca.length - zCzasem.length;
  const dni = Math.max(1, Math.ceil(suma / (GODZIN_DZIENNIE * 60)));
  const najdluzsze = [...zCzasem].sort((a, b) => b.minuty - a.minuty)[0];
  const fakt = `Samo zwiedzanie tych miejsc to ${czas(suma)}.`;
  // Orzeczenie zgadza się z liczebnikiem: „wychodzi 1 dzień”, „wychodzą 3 dni”, „wychodzi 5 dni”.
  const wychodzi = odmien(dni, 'wychodzi', 'wychodzą', 'wychodzi');
  let tekst = `Przy ${GODZIN_DZIENNIE} godzinach dziennie, bez dojść i jedzenia, ${wychodzi} ${ileDni(dni)}.`;
  if (dniTablicy && dniTablicy < dni) {
    tekst += ` Na ${ileDni(dniTablicy)} trzeba coś przesunąć do „być może”.`;
  } else if (najdluzsze && najdluzsze.minuty >= 150) {
    tekst += ` Najwięcej zabiera ${najdluzsze.nazwa} — ${czas(najdluzsze.minuty)}.`;
  }
  if (brak) tekst += ` Dla ${brak} ${odmien(brak, 'miejsca', 'miejsc', 'miejsc')} nie mam czasu zwiedzania.`;
  return { tekst: `${fakt} ${tekst}`, reszta: tekst, suma, dni };
}

const ZACZEPIENIA = [
  ({ miasto, n, suma }) => `${miasto}: ${ileMiejsc(n)} to ${czas(suma)} samego zwiedzania.`,
  ({ miasto, dni }) => `${miasto}: lista, która wygląda na weekend, a potrzebuje ${ileDni(dni)}.`,
  ({ miasto }) => wMiescie(miasto)
    ? `Co zobaczyć ${wMiescie(miasto)} — i ile czasu zajmuje każde miejsce.`
    : `${miasto}: co zobaczyć i ile czasu zajmuje każde miejsce.`,
];

function hashtagi(miasto, kraj, extra = []) {
  const miastoTag = hashtag(miasto);
  return [miastoTag, `${miastoTag}atrakcje`, '#zwiedzanie', '#citybreak', '#planpodróży', '#cozobaczyć',
    '#podróżemałeiduże', '#wyjazdnaweekend', kraj && hashtag(kraj), ...extra].filter(Boolean);
}

const krotkieZrodla = (zdjecia) => {
  const unik = [...new Map(zdjecia.map((z) => [z.tytul, z])).values()];
  return 'Zdjęcia: Wikimedia Commons — ' + unik
    .map((z) => `${z.autor || 'autor nieznany'} (${z.rodzaj === 'PD' ? 'domena publiczna' : z.licencja})`)
    .join(', ') + '.';
};

/**
 * @param temat  { rodzaj: 'tablica'|'miasto', tytul, miasto, kraj, dni, adres, miejsca[] }
 * @param zdjecia lista użytych zdjęć (z autorem i licencją)
 * @param nr     numer w paczce — wybiera wariant zaczepienia
 */
export function podpisy(temat, zdjecia, nr = 0) {
  const { miasto, miejsca, adres } = temat;
  const w = wniosekAgenta(miejsca, temat.dni);
  const wariant = nr % ZACZEPIENIA.length;
  const zaczepienie = ZACZEPIENIA[wariant]({ miasto, n: miejsca.length, suma: w.suma, dni: w.dni });
  const wniosek = wariant === 0 ? w.reszta : w.tekst;
  const lista = miejsca.slice(0, 8).map((m) => `${m.nazwa}${m.minuty ? ` — ${czas(m.minuty)}` : ''}`);
  const zrodlo = temat.rodzaj === 'tablica'
    ? `To publiczna tablica „${temat.tytul}”. Możesz ją skopiować do siebie i wyrzucić to, co do Ciebie nie pasuje.`
    : `Miejsca i czasy zwiedzania pochodzą z katalogu RouteMarket (OpenStreetMap i Wikipedia).`;
  const produkt = 'Zbierasz miejsca na tablicy: na pewno, być może, nie. Agent układa z nich dni — z godzinami otwarcia, kolejnością i plikiem GPX.';
  const zrodlaKrotkie = krotkieZrodla(zdjecia);

  const instagram = [
    zaczepienie,
    '',
    lista.join('\n'),
    '',
    wniosek,
    '',
    zrodlo,
    produkt,
    'Link w bio: routemarket.io',
    '',
    zrodlaKrotkie + ' Pełne źródła w pierwszym komentarzu i na ostatnim slajdzie.',
    '',
    hashtagi(miasto, temat.kraj).slice(0, 10).join(' '),
  ].join('\n');

  const tiktok = [
    zaczepienie,
    wniosek,
    'Plan dni z tych miejsc: routemarket.io (link w bio)',
    zrodlaKrotkie,
    [hashtag(miasto), '#zwiedzanie', '#citybreak', '#planpodróży', '#podróże'].join(' '),
  ].join('\n');

  const facebook = [
    zaczepienie,
    '',
    `Na liście: ${miejsca.slice(0, 6).map((m) => m.nazwa).join(', ')}${miejsca.length > 6 ? ` i ${miejsca.length - 6} kolejnych` : ''}.`,
    '',
    wniosek,
    '',
    zrodlo,
    produkt,
    adres,
    '',
    zrodlaKrotkie,
  ].join('\n');

  const pinterest = {
    tytul: (wMiescie(miasto) ? `Co zobaczyć ${wMiescie(miasto)} — czas zwiedzania każdego miejsca` : `${miasto} — co zobaczyć i ile czasu na każde miejsce`).slice(0, 100),
    opis: `${miasto}: ${ileMiejsc(miejsca.length)} z czasem zwiedzania: ${miejsca.slice(0, 5).map((m) => m.nazwa).join(', ')}. ${w.tekst.split('.')[0]}. ${miasta2(miasto) ? `Plan zwiedzania ${miasta2(miasto)}` : 'Plan zwiedzania'} dzień po dniu z godzinami otwarcia i plikiem GPX.`,
    link: adres,
  };

  // Autorzy zdjęć są podpisani na samym pinie; opis ma twardy limit 500 znaków,
  // więc skracamy listę miejsc, a nie urywamy zdania.
  while (pinterest.opis.length > 500) {
    pinterest.opis = pinterest.opis.replace(/, [^,:]+\. /, '. ');
  }
  return { instagram, tiktok, facebook, pinterest, wniosek: w };
}
