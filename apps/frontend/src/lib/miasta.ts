/**
 * Miasta katalogu jako strony: adres, odmiana nazwy i wyliczenie „ile dni”.
 *
 * KOPIA W API: apps/route-builder-api/src/services/miasta.ts — ta sama funkcja
 * slugu i te same przypadki. Strona dla ludzi (tu) i treść dla robotów (tam)
 * muszą zgadzać się co do adresu i liczb; zmiana w jednym miejscu = zmiana w obu.
 */

/** „Nowy Jork” → „nowy-jork”, „Wrocław” → „wroclaw”, „Durrës” → „durres”. */
export function slugMiasta(miasto: string): string {
  return miasto.toLowerCase()
    .replace(/ł/g, 'l')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

/**
 * Miejscownik i dopełniacz. „Co zobaczyć w Rzymie” to fraza, którą ludzie
 * wpisują; „w Rzym” zdradza szablon. Miasto spoza listy (katalog dozbiera
 * nowe samo) dostaje zdania z dwukropkiem, które przypadku nie potrzebują.
 */
const PRZYPADKI: Record<string, [string, string]> = {
  Amsterdam: ['Amsterdamie', 'Amsterdamu'], Barcelona: ['Barcelonie', 'Barcelony'], Berat: ['Beracie', 'Beratu'],
  Berlin: ['Berlinie', 'Berlina'], Bruksela: ['Brukseli', 'Brukseli'], Budapeszt: ['Budapeszcie', 'Budapesztu'],
  Bukareszt: ['Bukareszcie', 'Bukaresztu'], 'Durrës': ['Durrës', 'Durrës'], Florencja: ['Florencji', 'Florencji'],
  'Gdańsk': ['Gdańsku', 'Gdańska'], Genua: ['Genui', 'Genui'], Haga: ['Hadze', 'Hagi'], 'Kołobrzeg': ['Kołobrzegu', 'Kołobrzegu'],
  'Kraków': ['Krakowie', 'Krakowa'], Lipsk: ['Lipsku', 'Lipska'], Lizbona: ['Lizbonie', 'Lizbony'], Londyn: ['Londynie', 'Londynu'],
  Lublin: ['Lublinie', 'Lublina'], Lyon: ['Lyonie', 'Lyonu'], 'Nowy Jork': ['Nowym Jorku', 'Nowego Jorku'],
  Palermo: ['Palermo', 'Palermo'], 'Paryż': ['Paryżu', 'Paryża'], Porto: ['Porto', 'Porto'], 'Poznań': ['Poznaniu', 'Poznania'],
  Praga: ['Pradze', 'Pragi'], Ryga: ['Rydze', 'Rygi'], Rzym: ['Rzymie', 'Rzymu'], 'Stambuł': ['Stambule', 'Stambułu'],
  Tallinn: ['Tallinnie', 'Tallinna'], 'Toruń': ['Toruniu', 'Torunia'], Warszawa: ['Warszawie', 'Warszawy'],
  'Wiedeń': ['Wiedniu', 'Wiednia'], 'Wrocław': ['Wrocławiu', 'Wrocławia'], 'Zamość': ['Zamościu', 'Zamościa'],
};
/** „we” tam, gdzie „w” nie da się wymówić przed zbitką spółgłosek. */
const PRZYIMEK_WE = new Set(['Wrocław']);

export const wMiescie = (m: string): string | null =>
  PRZYPADKI[m] ? `${PRZYIMEK_WE.has(m) ? 'we' : 'w'} ${PRZYPADKI[m][0]}` : null;
export const dopelniaczMiasta = (m: string): string | null => PRZYPADKI[m]?.[1] ?? null;

/** Nagłówek strony: „Co zobaczyć w Rzymie” albo „Lyon: co zobaczyć”. */
export const tytulMiasta = (m: string): string =>
  wMiescie(m) ? `Co zobaczyć ${wMiescie(m)}` : `${m}: co zobaczyć`;

export const GODZIN_DZIENNIE = 6;

export interface MiejsceDoLiczenia { name: string; visit_minutes: number | null }

/**
 * Co się zmieści w N dniach, jeśli brać miejsca od najbardziej znanych.
 * Liczymy samo zwiedzanie — bez dojść, kolejek i jedzenia — i mówimy to
 * wprost przy wyniku. To nie jest plan, tylko odpowiedź na pytanie „ile dni”;
 * plan z godzinami otwarcia i trasą układa agent.
 */
export function coSieZmiesci<T extends MiejsceDoLiczenia>(miejsca: T[], dni: number): { miejsca: T[]; minuty: number } {
  const budzet = dni * GODZIN_DZIENNIE * 60;
  const wybrane: T[] = [];
  let minuty = 0;
  for (const m of miejsca) {
    if (!m.visit_minutes) continue;
    if (minuty + m.visit_minutes > budzet) continue;
    wybrane.push(m);
    minuty += m.visit_minutes;
  }
  return { miejsca: wybrane, minuty };
}

export function sumaMinut(miejsca: MiejsceDoLiczenia[]): { minuty: number; bezCzasu: number } {
  let minuty = 0, bezCzasu = 0;
  for (const m of miejsca) {
    if (m.visit_minutes) minuty += m.visit_minutes; else bezCzasu += 1;
  }
  return { minuty, bezCzasu };
}

export const dniNaZwiedzanie = (minuty: number) => Math.max(1, Math.ceil(minuty / (GODZIN_DZIENNIE * 60)));

export function czasZwiedzania(min: number | null | undefined): string {
  if (!min) return '—';
  const g = Math.floor(min / 60), m = min % 60;
  if (g && m) return `${g} g ${m} min`;
  if (g) return `${g} g`;
  return `${m} min`;
}
