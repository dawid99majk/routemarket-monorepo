import { supabase } from '@/integrations/supabase/client';

/**
 * Jedyna droga do route-builder-api. Endpointy generujące trasy kosztują u
 * dostawcy przy każdym wywołaniu, więc wymagają zalogowania — surowy `fetch`
 * bez nagłówka dostanie teraz 401.
 *
 * Przy okazji dokłada limit czasu: wcześniej żadne z tych zapytań go nie miało
 * i wiszące połączenie zostawiało kreator w stanie „Agent myśli…" bez końca.
 */

const BASE = import.meta.env.VITE_API_URL || '/route-builder-api';

/** Wywiad potrafi liczyć ponad minutę, więc limit jest hojny — ma ratować z zawieszenia, nie ucinać poprawną pracę. */
const DEFAULT_TIMEOUT_MS = 180_000;

export class ApiError extends Error {
  status: number;
  retryAfterS?: number;

  constructor(message: string, status: number, retryAfterS?: number) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.retryAfterS = retryAfterS;
  }
}

function messageForStatus(status: number, payload: any): string {
  if (status === 401) return 'Sesja wygasła. Zaloguj się ponownie, żeby kontynuować.';
  // 402 to nie awaria: uzytkownik ma zadzialac, nie zglaszac usterki
  if (status === 402) return payload?.error || 'Za malo tokenow na te operacje. Doladuj konto, zeby kontynuowac.';
  if (status === 429) {
    const wait = payload?.retry_after_s;
    return wait
      ? `Za dużo zapytań w krótkim czasie. Spróbuj ponownie za ${wait} s.`
      : 'Za dużo zapytań w krótkim czasie. Odczekaj chwilę.';
  }
  if (status === 400) return payload?.error || 'Nieprawidłowe dane zapytania.';
  if (status >= 500) return payload?.error || 'Serwer nie zdołał obsłużyć zapytania. Spróbuj ponownie.';
  return payload?.error || `Błąd zapytania (${status}).`;
}

export async function apiPost<T = any>(
  path: string,
  body: unknown,
  opts: { timeoutMs?: number; signal?: AbortSignal } = {}
): Promise<T> {
  const { data: { session } } = await supabase.auth.getSession();
  const token = session?.access_token;
  if (!token) {
    throw new ApiError('Sesja wygasła. Zaloguj się ponownie, żeby kontynuować.', 401);
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), opts.timeoutMs ?? DEFAULT_TIMEOUT_MS);
  const forwardAbort = () => controller.abort();
  opts.signal?.addEventListener('abort', forwardAbort);

  try {
    const res = await fetch(`${BASE}${path}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify(body),
      signal: controller.signal
    });

    if (!res.ok) {
      const payload = await res.json().catch(() => null);
      throw new ApiError(messageForStatus(res.status, payload), res.status, payload?.retry_after_s);
    }

    return await res.json() as T;
  } catch (err: any) {
    if (err?.name === 'AbortError') {
      throw new ApiError('Przekroczono czas oczekiwania na odpowiedź. Spróbuj ponownie.', 408);
    }
    if (err instanceof ApiError) throw err;
    throw new ApiError('Brak połączenia z serwerem. Sprawdź sieć i spróbuj ponownie.', 0);
  } finally {
    clearTimeout(timer);
    opts.signal?.removeEventListener('abort', forwardAbort);
  }
}

/** Zdarzenie ze strumienia planera. Pole `typ` rozstrzyga, co niesie reszta. */
export interface ZdarzenieStrumienia {
  typ: 'etap' | 'dzien' | 'blad-dnia' | 'koniec' | 'blad';
  opis?: string;
  dni?: number;
  dzien?: any;
  numer?: number;
  blad?: string;
  warnings?: string[];
  not_scheduled?: { name: string; reason?: string }[];
  sekundy?: number;
}

/**
 * Odbiór odpowiedzi podawanej po kawałku (SSE).
 *
 * `EventSource` odpada, bo umie tylko GET, a planer dostaje na wejściu całą
 * tablicę miejsc — to musi być POST. Zamiast tego czytamy ciało odpowiedzi
 * strumieniem i sami rozcinamy je po pustej linii, zgodnie z formatem SSE.
 *
 * Bufor jest tu nie dla ozdoby: kawałek przychodzący z sieci prawie nigdy nie
 * kończy się równo na granicy zdarzenia, więc ostatni, niedomknięty fragment
 * musi doczekać następnej porcji danych, zamiast trafić do JSON.parse.
 *
 * Limitu czasu celowo nie ma takiego jak w apiPost: strumień z założenia trwa,
 * a jego sens polega na tym, że w międzyczasie coś już widać. Przerwanie zostaje
 * po stronie wywołującego, przez `signal`.
 */
export async function apiStream(
  path: string,
  body: unknown,
  naZdarzenie: (z: ZdarzenieStrumienia) => void,
  opts: { signal?: AbortSignal } = {}
): Promise<void> {
  const { data: { session } } = await supabase.auth.getSession();
  const token = session?.access_token;
  if (!token) {
    throw new ApiError('Sesja wygasła. Zaloguj się ponownie, żeby kontynuować.', 401);
  }

  let res: Response;
  try {
    res = await fetch(`${BASE}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify(body),
      signal: opts.signal,
    });
  } catch {
    throw new ApiError('Brak połączenia z serwerem. Sprawdź sieć i spróbuj ponownie.', 0);
  }

  if (!res.ok) {
    const payload = await res.json().catch(() => null);
    throw new ApiError(messageForStatus(res.status, payload), res.status, payload?.retry_after_s);
  }
  if (!res.body) throw new ApiError('Serwer nie odesłał strumienia.', 0);

  const czytnik = res.body.getReader();
  const dekoder = new TextDecoder();
  let bufor = '';

  while (true) {
    const { done, value } = await czytnik.read();
    if (done) break;
    bufor += dekoder.decode(value, { stream: true });

    let granica: number;
    while ((granica = bufor.indexOf('\n\n')) !== -1) {
      const ramka = bufor.slice(0, granica);
      bufor = bufor.slice(granica + 2);
      for (const linia of ramka.split('\n')) {
        if (!linia.startsWith('data:')) continue;
        const surowe = linia.slice(5).trim();
        if (!surowe) continue;
        try {
          naZdarzenie(JSON.parse(surowe) as ZdarzenieStrumienia);
        } catch {
          // Pojedyncze zdarzenie nie do odczytania nie może przerwać całego
          // planu — reszta dni przyjdzie osobnymi ramkami.
          console.warn('[apiStream] pominięto nieczytelne zdarzenie');
        }
      }
    }
  }
}
