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
