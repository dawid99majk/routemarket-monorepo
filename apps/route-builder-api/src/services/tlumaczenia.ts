/**
 * Tłumaczenie opisów katalogu na pozostałe języki interfejsu.
 *
 * Opisy powstały po polsku i są współdzielone między wszystkimi użytkownikami,
 * więc nie da się ich przetłumaczyć "przy okazji" pojedynczego zapytania —
 * pierwszy Niemiec nadpisałby opis wszystkim pozostałym. Tłumaczymy je więc raz,
 * wsadowo, i zapisujemy pod kluczem języka.
 *
 * Wybór między tłumaczeniem wsadowym a leniwym (dogenerowaniem przy pierwszym
 * wyświetleniu) wypadł na rzecz wsadowego z jednego powodu: koszt jest znikomy,
 * a efekt natychmiastowy. Trzysta czterdzieści pięć krótkich opisów w paczkach
 * po piętnaście to około dwudziestu wywołań na język — grosze, jednorazowo.
 * Leniwe dogenerowanie kosztowałoby tyle samo, tylko rozłożone na miesiące
 * i okupione tym, że pierwszy użytkownik każdego języka czeka.
 */
import { callGeminiTracked } from './ai-usage.js';
import type { KodJezyka } from './jezyki.js';

const NAZWA_JEZYKA: Record<KodJezyka, string> = {
  pl: 'polski',
  en: 'English',
  de: 'Deutsch',
  fr: 'français',
  es: 'español',
  it: 'italiano',
};

export interface DoTlumaczenia {
  id: string;
  name: string;
  tekst: string;
}

const SCHEMAT = {
  type: 'object',
  properties: {
    tlumaczenia: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          tekst: { type: 'string' },
        },
        required: ['id', 'tekst'],
      },
    },
  },
  required: ['tlumaczenia'],
};

/**
 * Jedna paczka opisów na jeden język. Zwraca mapę id -> przetłumaczony tekst;
 * pozycje, których model nie odesłał, po prostu w niej nie ma — wołający
 * zapisuje tylko to, co dostał, zamiast nadpisywać czymkolwiek.
 */
export async function przetlumaczPaczke(
  pozycje: DoTlumaczenia[],
  jezyk: KodJezyka,
  userId: string | null
): Promise<Record<string, string>> {
  const klucz = process.env.GEMINI_API_KEY;
  if (!klucz) throw new Error('Brak GEMINI_API_KEY');
  if (!pozycje.length) return {};

  const wejscie = pozycje
    .map((p) => `{"id": "${p.id}", "nazwa": ${JSON.stringify(p.name)}, "opis": ${JSON.stringify(p.tekst)}}`)
    .join('\n');

  const prompt = `Przetłumacz opisy miejsc turystycznych z polskiego na ${NAZWA_JEZYKA[jezyk]}.

ZASADY:
- Tłumacz WYŁĄCZNIE treść pola "opis". Pole "nazwa" jest podane jako kontekst i NIE
  wchodzi do wyniku.
- NAZW WŁASNYCH NIE TŁUMACZ. "Hala Stulecia" zostaje "Halą Stulecia", "Ateneul Român"
  zostaje "Ateneul Român" — pod taką nazwą użytkownik znajdzie miejsce na mapie i na
  tabliczce przy wejściu. Odmieniaj je zgodnie z gramatyką języka docelowego, ale nie
  podmieniaj na tłumaczenie.
- Zachowaj długość i ton oryginału. To podpis pod kartą miejsca, nie artykuł.
- Nie dopisuj informacji, których nie ma w oryginale, i nie usuwaj tych, które są.
- W polu "id" przepisz dokładnie ten identyfikator, który dostałeś.

OPISY DO PRZETŁUMACZENIA (po jednym w wierszu, format JSON):
${wejscie}

Odpowiedz WYŁĄCZNIE obiektem JSON.`;

  const dane = await callGeminiTracked(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${klucz}`,
    {
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: {
        responseMimeType: 'application/json',
        responseSchema: SCHEMAT,
        temperature: 0.2,
        maxOutputTokens: 8192,
        thinkingConfig: { thinkingBudget: 0 },
      },
    },
    { operation: `tlumaczenie-${jezyk}`, model: 'gemini-2.5-flash', userId }
  );

  const tekst = dane?.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
  let wynik: any;
  try {
    wynik = JSON.parse(tekst);
  } catch {
    throw new Error(`Tłumacz oddał coś, co nie jest JSON-em (${tekst.length} zn.)`);
  }

  const mapa: Record<string, string> = {};
  const znane = new Set(pozycje.map((p) => p.id));
  for (const t of wynik?.tlumaczenia ?? []) {
    const id = String(t?.id ?? '');
    const tresc = String(t?.tekst ?? '').trim();
    // Model bywa twórczy z identyfikatorami; wpis, którego nie prosiliśmy,
    // trafiłby nie w to miejsce, więc odrzucamy nieznane.
    if (tresc && znane.has(id)) mapa[id] = tresc;
  }
  return mapa;
}
