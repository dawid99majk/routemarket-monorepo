/**
 * Kolekcje miasta — motywy liczone z `vibe_tags`, nie osobna tabela.
 *
 * DLACZEGO NIE TABELA. W bazie są `collections` i `collection_places`, ale to
 * inna rzecz: kolekcje ZAKŁADANE PRZEZ UŻYTKOWNIKA, z właścicielem i flagą
 * publiczności. Tutaj chodzi o motywy, które istnieją same z siebie w każdym
 * mieście i mają być aktualne, gdy katalog urośnie. Wyliczenie z tagów nie
 * wymaga niczyjego utrzymania i nie może się rozjechać z katalogiem.
 *
 * DLACZEGO NIE MA „ARCHITEKTURY". Zmierzone: tag `architektura` siedzi na 804
 * z 1590 miejsc. Kolekcja obejmująca połowę katalogu to nie kuratorstwo, tylko
 * ta sama siatka pod inną nazwą. Z tego samego powodu nie ma „Z dziećmi” —
 * to już jest pigułka filtru nad siatką i dublowanie jej myliłoby, a nie pomagało.
 *
 * PRÓG PIĘCIU MIEJSC jest po to, żeby nie pokazywać kafelka prowadzącego do
 * dwóch pozycji. Motyw, którego w danym mieście nie ma, po prostu się nie
 * pojawia — dlatego „Nad wodą" widać w sześciu miastach, a „Klasyki" we wszystkich.
 */

export interface Kolekcja {
  id: string;
  nazwa: string;
  /** Zdanie pod nazwą — mówi, co jest w środku, nie zachwala. */
  podpis: string;
  tagi: string[];
  /** `any` — wystarczy jeden tag; `all` — muszą być wszystkie. */
  tryb: 'any' | 'all';
}

export const KOLEKCJE: Kolekcja[] = [
  { id: 'klasyki',      nazwa: 'Klasyki miasta',     podpis: 'To, po co ludzie tu przyjeżdżają', tagi: ['ikoniczne'], tryb: 'any' },
  { id: 'nieoczywiste', nazwa: 'Nieoczywiste',       podpis: 'Kameralne i nietypowe',            tagi: ['nietypowe', 'kameralne'], tryb: 'any' },
  { id: 'sztuka',       nazwa: 'Sztuka i muzea',     podpis: 'Zbiory, galerie, wystawy',          tagi: ['muzealne', 'sztuka'], tryb: 'any' },
  { id: 'zielono',      nazwa: 'Zielono i spacerem', podpis: 'Parki, ogrody, trasy na nogi',      tagi: ['zielone', 'spacerowe'], tryb: 'any' },
  { id: 'kuchnia',      nazwa: 'Lokalna kuchnia',    podpis: 'Jedzenie, po które chodzą miejscowi', tagi: ['kulinarne', 'lokalne'], tryb: 'all' },
  { id: 'swiatynie',    nazwa: 'Świątynie',          podpis: 'Kościoły, synagogi, meczety',       tagi: ['sakralne'], tryb: 'any' },
  { id: 'bezbiletu',    nazwa: 'Bez biletu',         podpis: 'Wstęp wolny',                       tagi: ['darmowe'], tryb: 'any' },
  { id: 'pozmroku',     nazwa: 'Po zmroku',          podpis: 'Miejsca na wieczór',                tagi: ['nocne'], tryb: 'any' },
  { id: 'gwarno',       nazwa: 'Gwarno i targowo',   podpis: 'Hale, targi, ruchliwe place',       tagi: ['targowe', 'gwarne'], tryb: 'any' },
  { id: 'widoki',       nazwa: 'Widoki',             podpis: 'Punkty, z których widać miasto',    tagi: ['widokowe'], tryb: 'any' },
  { id: 'nadwoda',      nazwa: 'Nad wodą',           podpis: 'Rzeka, kanały, nabrzeża',           tagi: ['nadwodne'], tryb: 'any' },
  { id: 'przemysl',     nazwa: 'Poprzemysłowe',      podpis: 'Dawne fabryki i hale',              tagi: ['industrialne'], tryb: 'any' },
];

export function pasujeDoKolekcji(tagi: string[] | null | undefined, k: Kolekcja): boolean {
  const ma = tagi ?? [];
  return k.tryb === 'all'
    ? k.tagi.every((t) => ma.includes(t))
    : k.tagi.some((t) => ma.includes(t));
}

/** Motywy, które w tym zestawie miejsc mają dość zawartości, żeby je pokazać. */
export function kolekcjeMiasta<T extends { vibe_tags?: string[] | null }>(
  miejsca: T[], min = 5
): { kolekcja: Kolekcja; miejsca: T[] }[] {
  return KOLEKCJE
    .map((kolekcja) => ({ kolekcja, miejsca: miejsca.filter((m) => pasujeDoKolekcji(m.vibe_tags, kolekcja)) }))
    .filter((x) => x.miejsca.length >= min);
}
