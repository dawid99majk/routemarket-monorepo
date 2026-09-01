import { repo } from '../db/repository.js';

/**
 * Cennik. Zbieranie miejsc, tablice, ulubione i kolekcje są darmowe — to one
 * budują nawyk i nie kosztują praktycznie nic. Tokeny pobieramy za momenty, w
 * których użytkownik świadomie prosi o wynik i ten wynik widzi.
 *
 * Uczciwie: przy koszcie rzędu 0,0004 USD za wywołanie modelu to cennik wartości,
 * nie zwrot kosztów. Nie ma sensu wyliczać go z rachunku za Gemini.
 */
export const TOKEN_PRICES: Record<string, number> = {
  'plan-trip': 5,
  'live-route': 10,
  'chat-interview': 3
};

/**
 * Sprawdzenie salda przed rozpoczęciem pracy. Wolimy odmówić od razu, niż
 * policzyć całą trasę i dopiero potem powiedzieć, że nie ma za co.
 */
export async function ensureTokens(userId: string | null, operation: string): Promise<string | null> {
  const price = TOKEN_PRICES[operation];
  if (!price || !userId) return null;
  try {
    const balance = await repo.getTokenBalance(userId);
    if (balance < price) {
      return `Na tę operację potrzeba ${price} tokenów, a masz ${balance}. Doładuj konto, żeby kontynuować.`;
    }
  } catch (err: any) {
    console.warn('[tokens] Nie udało się sprawdzić salda, przepuszczam:', err.message);
  }
  return null;
}
