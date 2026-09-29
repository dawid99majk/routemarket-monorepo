/**
 * Formaty danych na slajdach: czas, godziny otwarcia, odmiana.
 * Te same zasady co w produkcie — „1 g 30 min”, przecinek dziesiętny,
 * nazwy własne bez tłumaczenia.
 */

export function odmien(ile, jeden, dwa, piec) {
  const n = Math.abs(Math.trunc(ile));
  if (n === 1) return jeden;
  const r10 = n % 10, r100 = n % 100;
  if (r10 >= 2 && r10 <= 4 && !(r100 >= 12 && r100 <= 14)) return dwa;
  return piec;
}

export const ileMiejsc = (n) => `${n} ${odmien(n, 'miejsce', 'miejsca', 'miejsc')}`;
export const ileDni = (n) => `${n} ${odmien(n, 'dzień', 'dni', 'dni')}`;

export function czas(minuty) {
  if (!minuty) return null;
  const g = Math.floor(minuty / 60), m = minuty % 60;
  if (!g) return `${m} min`;
  return m ? `${g} g ${m} min` : `${g} g`;
}

const DNI = { Mo: 'pn', Tu: 'wt', We: 'śr', Th: 'czw', Fr: 'pt', Sa: 'sob', Su: 'nd', PH: 'święta' };

/**
 * Godziny z OpenStreetMap po polsku — tylko gdy da się je podać uczciwie
 * w jednej linii. Godziny sezonowe (z nazwami miesięcy) skracamy do
 * informacji, że się zmieniają; lepsze to niż pół reguły na slajdzie.
 */
export function godziny(osm) {
  if (!osm) return null;
  const s = osm.trim();
  if (s === '24/7') return 'całą dobę';
  if (/Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec|week|easter|sunrise|sunset/i.test(s)) return 'godziny zmieniają się w sezonie';
  const m = s.match(/^Mo-Su (\d\d:\d\d)-(\d\d:\d\d)$/);
  if (m) return `codziennie ${m[1]}–${m[2]}`;
  const czesci = s.split(/;\s*/).slice(0, 2).map((c) => c
    .replace(/\b(Mo|Tu|We|Th|Fr|Sa|Su|PH)\b/g, (d) => DNI[d])
    .replace(/(\d\d:\d\d)-(\d\d:\d\d)/g, '$1–$2')
    .replace(/\boff\b|\bclosed\b/g, 'nieczynne'));
  const wynik = czesci.join(' · ');
  if (wynik.length > 44 || /[A-Za-z]{3,}/.test(wynik.replace(/nieczynne|święta|czw|sob/g, ''))) return null;
  return wynik;
}

/** Pierwsze pełne zdanie (lub dwa), nie dłuższe niż limit — bez ucinania w pół słowa. */
export function zdanie(tekst, limit = 170) {
  if (!tekst) return null;
  const zdania = tekst.replace(/\s+/g, ' ').trim().match(/[^.!?]+[.!?]+/g) ?? [tekst];
  let wynik = '';
  for (const z of zdania) {
    if ((wynik + z).length > limit) break;
    wynik += z;
  }
  return (wynik || zdania[0]).trim();
}

export const slug = (s) => s.toLowerCase()
  .normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/ł/g, 'l')
  .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60);

export const hashtag = (s) => '#' + s.toLowerCase().replace(/[\s\-’'.]+/g, '');

/**
 * Miejscownik i dopełniacz miast z katalogu — „co zobaczyć w Rzymie” to fraza,
 * którą ludzie wpisują, a „w Rzym” zdradza szablon. Miasta spoza listy dostają
 * zdania z dwukropkiem, które przypadku nie potrzebują.
 */
const PRZYPADKI = {
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
// „we” przed zbitką spółgłosek, której „w” nie da się wymówić: we Wrocławiu.
const PRZYIMEK_WE = new Set(['Wrocław']);
export const wMiescie = (m) => (PRZYPADKI[m] ? `${PRZYIMEK_WE.has(m) ? 'we' : 'w'} ${PRZYPADKI[m][0]}` : null);
export const miasta2 = (m) => PRZYPADKI[m]?.[1] ?? null;
