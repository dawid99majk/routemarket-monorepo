import { Hono, type Context } from 'hono';
import { authMiddleware } from '../middleware/auth.js';
import {
  obsluzJsonRpc, uwierzytelnij, przekroczonyLimit,
  utworzPolaczenie, listaPolaczen, odlaczPolaczenie, ADRES_MCP, ADRES_SERWISU,
} from '../services/mcp.js';

/**
 * Endpoint MCP i zarządzanie połączeniami agentów.
 *
 * `/mcp` przyjmuje token w nagłówku `Authorization: Bearer …` (osobisty `rmc_…`
 * albo token Supabase/OAuth), a `/mcp/:token` — w ścieżce, dla okien „dodaj własny
 * konektor”, które nie pozwalają ustawić nagłówka. Ścieżkowy adres jest sekretem
 * (trafia do logów nginx), więc token jest osobisty, odwoływalny i pozwala
 * wyłącznie na narzędzia z services/mcp.ts — nic, co usuwa albo kosztuje tokeny.
 */
export const mcpRouter = new Hono<{ Variables: { user: any; userId: string } }>();

const zadanieMcp = async (c: Context, tokenZeSciezki?: string) => {
  // Przeglądarka z obcej strony nie ma czego tu szukać (ochrona przed DNS rebinding);
  // programy serwerowe Origin nie wysyłają.
  const origin = c.req.header('origin');
  if (origin && origin !== ADRES_SERWISU) return c.json({ error: 'Origin niedozwolony' }, 403);

  const naglowek = c.req.header('authorization') ?? '';
  const token = tokenZeSciezki ?? (naglowek.startsWith('Bearer ') ? naglowek.slice(7).trim() : '');
  const kto = await uwierzytelnij(token);
  if (!kto) {
    return c.json({ error: 'Brak dostępu — połącz agenta w RouteMarket (Połączenia).' }, 401,
      { 'WWW-Authenticate': 'Bearer realm="routemarket"' });
  }
  if (przekroczonyLimit(`mcp:${kto.userId}`)) return c.json({ error: 'Za dużo zapytań — spróbuj za minutę.' }, 429, { 'Retry-After': '60' });

  const cialo = await c.req.json().catch(() => null);
  if (cialo == null) return c.json({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Nieprawidłowy JSON' } }, 400);
  if (Array.isArray(cialo) && cialo.length > 20) return c.json({ jsonrpc: '2.0', id: null, error: { code: -32600, message: 'Za duża paczka' } }, 400);

  if (Array.isArray(cialo)) {
    const odpowiedzi = (await Promise.all(cialo.map((m) => obsluzJsonRpc(m, kto.userId)))).filter((r) => r !== null);
    return odpowiedzi.length ? c.json(odpowiedzi) : c.body(null, 202);
  }
  const odp = await obsluzJsonRpc(cialo, kto.userId);
  return odp === null ? c.body(null, 202) : c.json(odp);
};

const bezStrumienia = (c: Context) => c.json({ error: 'Ten serwer nie otwiera strumienia — używaj POST.' }, 405, { Allow: 'POST' });

mcpRouter.post('/mcp', (c) => zadanieMcp(c));
mcpRouter.post('/mcp/:token', (c) => zadanieMcp(c, c.req.param('token')));
mcpRouter.get('/mcp', bezStrumienia);
mcpRouter.get('/mcp/:token', bezStrumienia);
mcpRouter.delete('/mcp', bezStrumienia);

// ── Połączenia zarządzane z aplikacji (zalogowany użytkownik) ──────────────

mcpRouter.use('/polaczenia', authMiddleware);
mcpRouter.use('/polaczenia/*', authMiddleware);

mcpRouter.get('/polaczenia', async (c) =>
  c.json({ polaczenia: await listaPolaczen(c.get('userId')), adres_mcp: ADRES_MCP }));

mcpRouter.post('/polaczenia', async (c) => {
  const { agent, nazwa } = await c.req.json().catch(() => ({})) as { agent?: string; nazwa?: string };
  try {
    return c.json(await utworzPolaczenie(c.get('userId'), String(agent ?? 'inny'), String(nazwa ?? '')), 201);
  } catch (e: any) {
    return c.json({ error: e.message }, 400);
  }
});

mcpRouter.delete('/polaczenia/:id', async (c) => {
  const ok = await odlaczPolaczenie(c.get('userId'), c.req.param('id'));
  return ok ? c.json({ ok: true }) : c.json({ error: 'Nie znaleziono aktywnego połączenia' }, 404);
});
