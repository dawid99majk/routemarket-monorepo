/**
 * Miasta katalogu jako strony (/miasto/:slug) — slug, odmiana i „ile dni”.
 * (Nie mylić z services/miasta.ts: tamten mapuje nazwy miast pod wyszukiwanie w Commons.)
 *
 * KOPIA WE FRONCIE: apps/frontend/src/lib/miasta.ts. Strona dla ludzi i treść
 * dla robotów muszą zgadzać się co do adresu i liczb; zmiana w jednym = w obu.
 */

export function slugMiasta(miasto: string): string {
  return miasto.toLowerCase()
    .replace(/ł/g, 'l')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

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
const PRZYIMEK_WE = new Set(['Wrocław']);

export const wMiescie = (m: string): string | null =>
  PRZYPADKI[m] ? `${PRZYIMEK_WE.has(m) ? 'we' : 'w'} ${PRZYPADKI[m][0]}` : null;

export const tytulMiasta = (m: string): string =>
  wMiescie(m) ? `Co zobaczyć ${wMiescie(m)}` : `${m}: co zobaczyć`;

export const GODZIN_DZIENNIE = 6;
/** Ta sama lista co RODZAJE_POZA na stronie miasta we froncie. */
export const RODZAJE_POZA = '(cinema,parking,power_plant)';
export const ILE_MIEJSC = 12;

export function coSieZmiesci<T extends { visit_minutes: number | null }>(miejsca: T[], dni: number) {
  const budzet = dni * GODZIN_DZIENNIE * 60;
  const wybrane: T[] = [];
  let minuty = 0;
  for (const m of miejsca) {
    if (!m.visit_minutes || minuty + m.visit_minutes > budzet) continue;
    wybrane.push(m);
    minuty += m.visit_minutes;
  }
  return { miejsca: wybrane, minuty };
}

export const dniNaZwiedzanie = (minuty: number) => Math.max(1, Math.ceil(minuty / (GODZIN_DZIENNIE * 60)));
