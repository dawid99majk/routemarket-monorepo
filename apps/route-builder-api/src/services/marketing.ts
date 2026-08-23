/**
 * Generator materiałów promocyjnych platformy.
 *
 * Promocja RouteMarketu rozbija się o to samo, o co rozbija się każda mała
 * platforma: treść trzeba pisać ręcznie, a piszący ma przed oczami pustą stronę.
 * Materiał jest jednak już w bazie — opublikowane tablice to gotowe historie
 * z miastem, liczbą miejsc i nazwami, które da się wymienić z nazwy.
 *
 * Dlatego generator nie wymyśla tematu, tylko bierze konkretną publiczną tablicę
 * i opisuje ją na wybrany kanał. Wszystkie liczby i nazwy w wyniku pochodzą
 * z bazy i są wstrzykiwane do zapytania — model ma je ułożyć w zdania, a nie
 * dopowiadać. To nie jest ostrożność na wyrost: post chwalący się nieistniejącą
 * liczbą użytkowników albo cytujący zmyśloną opinię jest gorszy niż brak postu.
 *
 * Kanały różnią się nie stylem, tylko formatem, którego wymaga serwis: Instagram
 * czyta się w pionie i pierwsza linia decyduje o rozwinięciu, Facebook znosi
 * akapit, a opis pod wyszukiwarki ma twardy limit znaków, po którym Google ucina
 * zdanie w pół słowa.
 */
import { callGeminiTracked } from './ai-usage.js';
import { repo } from '../db/repository.js';

export type Kanal = 'instagram' | 'facebook' | 'seo';

export interface FaktyTablicy {
  id: string;
  nazwa: string;
  kierunek: string | null;
  dni: number | null;
  autor: string | null;
  ileMiejsc: number;
  przykladoweNazwy: string[];
  adres: string;
}

export interface Wariant {
  tytul: string;
  tekst: string;
  hashtagi: string[];
}

/** Fakty do zapytania bierzemy z bazy, żeby model nie miał czego zmyślać. */
export async function faktyTablicy(id: string): Promise<FaktyTablicy | null> {
  const b = await repo.publicBoardCard(id);
  if (!b) return null;
  return {
    id: b.id,
    nazwa: b.name,
    kierunek: b.destination ?? null,
    dni: b.days ?? null,
    autor: b.author_display ?? null,
    ileMiejsc: b.place_count ?? 0,
    przykladoweNazwy: b.sample_names ?? [],
    adres: `https://routemarket.io/tablica/${b.id}`,
  };
}

const WSPOLNE_ZASADY = `
ZASADY BEZWZGLĘDNE:
- Wolno Ci użyć wyłącznie faktów podanych poniżej. Nie dopisuj liczby użytkowników,
  ocen, opinii, nagród ani nazwisk, których nie ma w danych.
- Nie obiecuj funkcji, o których nie ma mowy w opisie platformy.
- Piszesz po polsku, bez emoji i bez wykrzykników na końcu zdań.
- Zdania krótkie, ton rzeczowy i ciepły, bez marketingowego patosu
  ("rewolucja", "przełom", "must-have" są zakazane).
- Nie zaczynaj od pytania retorycznego.

CZYM JEST PLATFORMA (do wykorzystania w treści):
RouteMarket to planner wyjazdów. Użytkownik wyszukuje atrakcje i wrzuca je na tablicę
wyjazdu w trzech kubełkach: "na pewno", "być może", "nie". Agent układa z tego plan na
każdy dzień, z godzinami i czasem dojazdu, i oddaje plik GPX do nawigacji. Tablice można
opublikować, żeby ktoś inny je skopiował i zmienił pod siebie.
`;

function prompt(kanal: Kanal, f: FaktyTablicy): string {
  const fakty = `
DANE TABLICY (jedyne dozwolone fakty):
- nazwa tablicy: ${f.nazwa}
- kierunek: ${f.kierunek ?? 'nie podano'}
- liczba dni: ${f.dni ?? 'nie podano'}
- liczba zebranych miejsc: ${f.ileMiejsc}
- przykładowe miejsca z tablicy: ${f.przykladoweNazwy.length ? f.przykladoweNazwy.join(', ') : 'nie podano'}
- odnośnik: ${f.adres}
`;

  if (kanal === 'instagram') {
    return `Napisz trzy warianty podpisu pod post na Instagramie promujący tę tablicę.
${WSPOLNE_ZASADY}${fakty}
FORMAT INSTAGRAMA:
- Pierwsza linia to zaczepienie: do 60 znaków, sama się broni, bo reszta jest zwinięta.
- Całość 300-600 znaków, złamana na krótkie akapity po jednej-dwóch liniach.
- Na końcu wezwanie do działania z odnośnikiem w bio (nie wklejaj adresu w tekst,
  na Instagramie odnośniki w podpisie nie działają).
- Do każdego wariantu od 8 do 12 hashtagów: mieszaj ogólne podróżnicze z nazwą miasta.
  Hashtagi zapisz bez znaku #, samo słowo.
- W polu "tytul" wpisz jednym zdaniem, czym ten wariant różni się od pozostałych.

Trzy warianty mają być naprawdę różne: jeden opowiedziany z perspektywy planującego
wyjazd, jeden skupiony na konkretnych miejscach z listy, jeden na tym, ile roboty
oszczędza gotowa tablica.`;
  }

  if (kanal === 'facebook') {
    return `Napisz trzy warianty posta na Facebooka promującego tę tablicę.
${WSPOLNE_ZASADY}${fakty}
FORMAT FACEBOOKA:
- 400-900 znaków, dopuszczalny jeden dłuższy akapit i lista wypunktowana.
- Odnośnik wklej w treść, bo na Facebooku działa: ${f.adres}
- Hashtagów najwyżej trzy, na końcu, bez znaku #.
- W polu "tytul" wpisz jednym zdaniem, czym ten wariant różni się od pozostałych.

Trzy warianty: jeden osobisty, jeden poradnikowy, jeden krótki i konkretny.`;
  }

  return `Przygotuj trzy warianty znaczników pod wyszukiwarki dla strony tej tablicy.
${WSPOLNE_ZASADY}${fakty}
FORMAT POD WYSZUKIWARKI:
- "tytul" to znacznik title: TWARDY limit 60 znaków ze spacjami.
- "tekst" to meta description: TWARDY limit 155 znaków ze spacjami, celuj w 140-150.
  Policz znaki, zanim oddasz odpowiedź, i skróć zdanie, jeśli wyszło dłuższe.
  Wyszukiwarka ucina dłuższy opis w pół słowa, więc przekroczenie limitu jest błędem,
  a nie drobiazgiem. Opis ma się kończyć zdaniem skończonym, nie wielokropkiem.
- "hashtagi" to frazy kluczowe, od 5 do 8, po polsku, tak jak wpisuje je człowiek
  w wyszukiwarkę (np. "co zobaczyć w Porto", "plan zwiedzania Porto na 3 dni").
- Nie upychaj fraz w opisie na siłę.`;
}

const SCHEMAT = {
  type: 'object',
  properties: {
    warianty: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          tytul: { type: 'string' },
          tekst: { type: 'string' },
          hashtagi: { type: 'array', items: { type: 'string' } },
        },
        required: ['tytul', 'tekst', 'hashtagi'],
      },
    },
  },
  required: ['warianty'],
};

/**
 * Model potrafi zgubić odstęp na styku zdań i oddać „…preferencji.Platforma…".
 * W gotowym poście wygląda to jak literówka autora, a nie jak usterka generatora,
 * więc sklejone zdania rozdzielamy tu, zanim treść w ogóle trafi na ekran.
 *
 * Wstawiamy spację, nie akapit: brak odstępu po kropce jest zawsze błędem, ale
 * to, czy autor chciał w tym miejscu nowy akapit, jest już domysłem.
 */
function sklejoneZdania(tekst: string): string {
  return tekst.replace(/([.!?])([A-ZĄĆĘŁŃÓŚŹŻ])/g, '$1 $2');
}

export async function wygenerujTresci(
  kanal: Kanal,
  f: FaktyTablicy,
  userId: string | null
): Promise<Wariant[]> {
  const klucz = process.env.GEMINI_API_KEY;
  if (!klucz) throw new Error('Brak GEMINI_API_KEY');

  const dane = await callGeminiTracked(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${klucz}`,
    {
      contents: [{ parts: [{ text: prompt(kanal, f) }] }],
      generationConfig: {
        responseMimeType: 'application/json',
        responseSchema: SCHEMAT,
        temperature: 0.9,
      },
    },
    { operation: `marketing-${kanal}`, model: 'gemini-2.5-flash', userId, projectId: f.id }
  );

  const tekst = dane?.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
  let wynik: any;
  try {
    wynik = JSON.parse(tekst);
  } catch {
    throw new Error(`Model oddał coś, co nie jest JSON-em (${tekst.length} zn.)`);
  }

  const warianty: Wariant[] = (wynik?.warianty ?? []).map((w: any) => ({
    tytul: String(w.tytul ?? '').trim(),
    tekst: sklejoneZdania(String(w.tekst ?? '').trim()),
    // Model bywa uparty i mimo instrukcji dokleja krzyżyk; obcinamy go tutaj,
    // żeby front nie musiał zgadywać, czy hashtag jest już poprzedzony znakiem.
    hashtagi: (w.hashtagi ?? [])
      .map((h: any) => String(h).trim().replace(/^#+/, ''))
      .filter(Boolean),
  })).filter((w: Wariant) => w.tekst);

  if (!warianty.length) throw new Error('Model nie oddał żadnego wariantu');
  return warianty;
}
