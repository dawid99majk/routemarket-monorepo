import { Context, Next } from 'hono';

/**
 * Limit tempa dla endpointów, które kosztują u dostawcy (Gemini, Google Maps,
 * GraphHopper). Autoryzacja odsiewa obcych, ale zalogowany użytkownik nadal
 * może — przez błąd w pętli albo celowo — zamówić setki generowań.
 *
 * Okno przesuwne trzymane w pamięci procesu. Świadomie bez Redisa: API chodzi
 * w jednej instancji, a limit ma chronić budżet, nie rozliczać się co do sztuki.
 * Przy skalowaniu na wiele instancji trzeba to przenieść do wspólnego magazynu.
 */

const windows = new Map<string, number[]>();

/** Sprzątanie porzuconych kluczy — bez tego mapa rośnie z każdym użytkownikiem. */
const SWEEP_INTERVAL_MS = 10 * 60 * 1000;
let lastSweep = Date.now();

function sweep(now: number, maxWindowMs: number) {
  if (now - lastSweep < SWEEP_INTERVAL_MS) return;
  lastSweep = now;
  for (const [key, hits] of windows) {
    const fresh = hits.filter((t) => now - t < maxWindowMs);
    if (fresh.length === 0) windows.delete(key);
    else windows.set(key, fresh);
  }
}

function clientIp(c: Context): string {
  const forwarded = c.req.header('x-forwarded-for');
  if (forwarded) return forwarded.split(',')[0].trim();
  return c.req.header('x-real-ip') || 'unknown';
}

export function rateLimit(opts: { name: string; windowMs: number; max: number }) {
  return async (c: Context, next: Next) => {
    const now = Date.now();
    sweep(now, opts.windowMs);

    // Po authMiddleware mamy userId; identyfikator IP zostaje jako zapasowy,
    // żeby limit działał także gdyby endpoint kiedyś stał się publiczny.
    const identity = c.get('userId') || `ip:${clientIp(c)}`;
    const key = `${opts.name}:${identity}`;

    const hits = (windows.get(key) ?? []).filter((t) => now - t < opts.windowMs);
    if (hits.length >= opts.max) {
      const retryAfterS = Math.max(1, Math.ceil((opts.windowMs - (now - hits[0])) / 1000));
      windows.set(key, hits);
      c.header('Retry-After', String(retryAfterS));
      console.warn(`[rate-limit] ${opts.name} wyczerpany dla ${identity} (${hits.length}/${opts.max})`);
      return c.json(
        {
          error: 'Za dużo zapytań w krótkim czasie. Odczekaj chwilę i spróbuj ponownie.',
          retry_after_s: retryAfterS
        },
        429
      );
    }

    hits.push(now);
    windows.set(key, hits);
    await next();
  };
}
