import { createClient } from '@supabase/supabase-js';
import { createHash, randomBytes } from 'node:crypto';
import { repo } from '../db/repository.js';

/**
 * Serwer MCP (Model Context Protocol): agent AI użytkownika — Claude, ChatGPT,
 * Gemini — rozmawia z RouteMarket tymi samymi danymi co aplikacja. Agent robi to
 * w imieniu zalogowanego użytkownika, więc każde narzędzie sprawdza własność
 * tablicy samo: klient bazy ma uprawnienia service role i RLS go nie chroni.
 *
 * Zasady pierwszej wersji:
 *  - tylko własne tablice użytkownika, nigdy cudze publiczne;
 *  - zapis ogranicza się do dokładania i zmiany decyzji — bez usuwania tablic
 *    i miejsc (agent pomylony w rozmowie nie może zniszczyć planu);
 *  - nic, co kosztuje tokeny: układanie planu zostaje w aplikacji, bo użytkownik
 *    ma świadomie zapłacić i zobaczyć wynik;
 *  - odpowiedzi to dane i linki do aplikacji — teksty miejsc pochodzą z bazy,
 *    nie są poleceniami dla agenta.
 */

const SUPABASE_URL = process.env.SUPABASE_URL || 'http://localhost:54321';
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || 'dummy_key';
const db = createClient(SUPABASE_URL, SUPABASE_KEY, { auth: { autoRefreshToken: false, persistSession: false } });

export const ADRES_SERWISU = process.env.PUBLIC_APP_URL || 'https://routemarket.io';
export const ADRES_MCP = `${ADRES_SERWISU}/route-builder-api/mcp`;

const sha256 = (s: string) => createHash('sha256').update(s).digest('hex');

// ── Połączenia (osobiste tokeny) ───────────────────────────────────────────

export type AgentId = 'claude' | 'chatgpt' | 'gemini' | 'inny';
const AGENCI: AgentId[] = ['claude', 'chatgpt', 'gemini', 'inny'];

export async function utworzPolaczenie(userId: string, agent: string, nazwa: string) {
  const a: AgentId = AGENCI.includes(agent as AgentId) ? (agent as AgentId) : 'inny';
  const czysta = String(nazwa || '').trim().slice(0, 60) || a;
  const { count } = await db.from('polaczenia_agentow').select('id', { count: 'exact', head: true })
    .eq('user_id', userId).is('uniewaznione', null);
  if ((count ?? 0) >= 10) throw new Error('Masz już 10 aktywnych połączeń — odłącz któreś, żeby dodać nowe.');
  const token = 'rmc_' + randomBytes(32).toString('base64url');
  const { data, error } = await db.from('polaczenia_agentow')
    .insert({ user_id: userId, agent: a, nazwa: czysta, token_hash: sha256(token) })
    .select('id, agent, nazwa, utworzone').single();
  if (error) throw new Error(error.message);
  // Token wraca tylko tutaj, raz. Adres z tokenem w ścieżce jest dla programów,
  // które nie pozwalają ustawić nagłówka (okna „dodaj własny konektor”).
  return { ...data, token, url: `${ADRES_MCP}/${token}` };
}

export async function listaPolaczen(userId: string) {
  const { data } = await db.from('polaczenia_agentow')
    .select('id, agent, nazwa, utworzone, ostatnio_uzyte, uniewaznione')
    .eq('user_id', userId).order('utworzone', { ascending: false }).limit(50);
  return data ?? [];
}

export async function odlaczPolaczenie(userId: string, id: string): Promise<boolean> {
  const { data } = await db.from('polaczenia_agentow')
    .update({ uniewaznione: new Date().toISOString() })
    .eq('id', id).eq('user_id', userId).is('uniewaznione', null).select('id');
  return (data?.length ?? 0) > 0;
}

const ostatniZapis = new Map<string, number>();

/** Token → użytkownik. Osobisty (`rmc_…`) albo token sesji/OAuth z Supabase (JWT). */
export async function uwierzytelnij(token: string): Promise<{ userId: string; polaczenieId?: string } | null> {
  if (!token) return null;
  if (token.startsWith('rmc_')) {
    const { data } = await db.from('polaczenia_agentow')
      .select('id, user_id, uniewaznione').eq('token_hash', sha256(token)).maybeSingle();
    if (!data || data.uniewaznione) return null;
    // Zapytania supabase-js są leniwe: bez await albo then nie wychodzą wcale, więc
    // „ostatnio użyte” zostawało puste. Zapis najwyżej raz na minutę na połączenie.
    const teraz = Date.now();
    if (teraz - (ostatniZapis.get(data.id) ?? 0) > 60_000) {
      ostatniZapis.set(data.id, teraz);
      db.from('polaczenia_agentow').update({ ostatnio_uzyte: new Date(teraz).toISOString() }).eq('id', data.id)
        .then(() => undefined, () => undefined);
    }
    return { userId: data.user_id, polaczenieId: data.id };
  }
  const u = await repo.getAuthenticatedUser(token);
  return u ? { userId: u.id } : null;
}

// ── Limit tempa: agent w pętli nie może zalać bazy ─────────────────────────

const okno = new Map<string, number[]>();
export function przekroczonyLimit(klucz: string, max = 90, msOkna = 60_000): boolean {
  const teraz = Date.now();
  const trafienia = (okno.get(klucz) ?? []).filter((t) => teraz - t < msOkna);
  trafienia.push(teraz);
  okno.set(klucz, trafienia);
  if (okno.size > 5000) for (const [k, v] of okno) if (!v.some((t) => teraz - t < msOkna)) okno.delete(k);
  return trafienia.length > max;
}

// ── Narzędzia ──────────────────────────────────────────────────────────────

const DECYZJE = { na_pewno: 'must', byc_moze: 'nice', odrzucone: 'rejected' } as const;
const DECYZJA_OPIS: Record<string, string> = { must: 'na pewno', nice: 'być może', rejected: 'odrzucone' };
const CHARAKTERY = ['business', 'family', 'couple', 'friends', 'solo', 'active'];
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DATA = /^\d{4}-\d{2}-\d{2}$/;

const bezOgonkow = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/ł/gi, 'l').toLowerCase().trim();

interface Narzedzie {
  name: string; title: string; description: string;
  inputSchema: Record<string, unknown>;
  annotations: { title: string; readOnlyHint: boolean; destructiveHint: boolean; idempotentHint: boolean; openWorldHint: boolean };
  wykonaj: (a: Record<string, any>, userId: string) => Promise<unknown>;
}

class BladNarzedzia extends Error {}

async function miastoZKatalogu(wpisane: string): Promise<string | null> {
  const { data } = await db.rpc('catalog_cities');
  const miasta: string[] = (data ?? []).map((r: any) => r.city ?? r);
  const klucz = bezOgonkow(wpisane);
  return miasta.find((m) => bezOgonkow(m) === klucz) ?? miasta.find((m) => bezOgonkow(m).startsWith(klucz) && klucz.length >= 3) ?? null;
}

async function mojaTablica(id: unknown, userId: string) {
  if (typeof id !== 'string' || !UUID.test(id)) throw new BladNarzedzia('tablica_id musi być identyfikatorem z narzędzia moje_tablice.');
  const { data } = await db.from('trip_projects').select('*').eq('id', id).eq('user_id', userId).maybeSingle();
  if (!data) throw new BladNarzedzia('Nie znalazłem takiej tablicy na Twoim koncie. Użyj moje_tablice, żeby zobaczyć dostępne.');
  return data;
}

const linkTablicy = (id: string) => `${ADRES_SERWISU}/plany/${id}`;
const skroc = (t: unknown, n: number) => { const s = String(t ?? '').replace(/\s+/g, ' ').trim(); return s.length > n ? s.slice(0, n - 1) + '…' : s; };

const NARZEDZIA: Narzedzie[] = [
  {
    name: 'szukaj_miejsc',
    title: 'Szukaj miejsc w mieście',
    description: 'Szuka miejsc w katalogu RouteMarket dla miasta (zabytki, muzea, jedzenie, wieczory, noclegi), od najbardziej rozpoznawalnych. Zwraca id miejsca, którego użyjesz w dodaj_miejsce. Miasto może być bez polskich znaków.',
    inputSchema: {
      type: 'object', additionalProperties: false, required: ['miasto'],
      properties: {
        miasto: { type: 'string', description: 'Nazwa miasta, np. „Kraków” albo „Kopenhaga”.' },
        zapytanie: { type: 'string', description: 'Opcjonalnie: fraza w nazwie lub opisie, np. „muzeum”, „zamek”.' },
        kategoria: { type: 'string', enum: ['attraction', 'food', 'nightlife', 'hotel'], description: 'Opcjonalnie: attraction = do zwiedzania, food = jedzenie, nightlife = wieczory, hotel = noclegi.' },
        limit: { type: 'integer', minimum: 1, maximum: 25, description: 'Ile wyników (domyślnie 10).' },
      },
    },
    annotations: { title: 'Szukaj miejsc w mieście', readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    async wykonaj(a) {
      const miasto = await miastoZKatalogu(String(a.miasto ?? ''));
      if (!miasto) {
        const { data } = await db.rpc('catalog_cities');
        return { wyniki: [], uwaga: `Nie mam miasta „${skroc(a.miasto, 40)}” w katalogu. Dostępne: ${(data ?? []).map((r: any) => r.city ?? r).join(', ')}. Nowe miasto zbiera się po założeniu tablicy (utworz_tablice).` };
      }
      let q = db.from('place_catalog')
        .select('id, slug, name, nazwa_lokalna, category, kind, description, description_i18n, waznosc, opening_hours, visit_minutes')
        .eq('city', miasto);
      if (['attraction', 'food', 'nightlife', 'hotel'].includes(a.kategoria)) q = q.eq('category', a.kategoria);
      const fraza = String(a.zapytanie ?? '').replace(/[%,()*\\]/g, ' ').trim().slice(0, 60);
      if (fraza) q = q.or(`name.ilike.%${fraza}%,description.ilike.%${fraza}%`);
      const limit = Math.min(25, Math.max(1, Number(a.limit) || 10));
      const { data, error } = await q.order('waznosc', { ascending: false, nullsFirst: false }).limit(limit);
      if (error) throw new Error(error.message);
      return {
        miasto,
        wyniki: (data ?? []).map((m: any) => ({
          id: m.id, nazwa: m.name, nazwa_lokalna: m.nazwa_lokalna ?? undefined,
          kategoria: m.category, rodzaj: m.kind, waznosc: m.waznosc,
          godziny_otwarcia: m.opening_hours ?? undefined, czas_zwiedzania_min: m.visit_minutes ?? undefined,
          opis: skroc(m.description_i18n?.pl ?? m.description, 220),
          link: `${ADRES_SERWISU}/miejsce/${m.slug}`,
        })),
      };
    },
  },
  {
    name: 'moje_tablice',
    title: 'Moje tablice wyjazdów',
    description: 'Lista tablic (wyjazdów) użytkownika z liczbą miejsc na pewno / być może. Zwraca tablica_id do pozostałych narzędzi.',
    inputSchema: { type: 'object', additionalProperties: false, properties: {} },
    annotations: { title: 'Moje tablice wyjazdów', readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    async wykonaj(_a, userId) {
      const { data: tablice } = await db.from('trip_projects')
        .select('id, name, destination, days, start_date, end_date, updated_at')
        .eq('user_id', userId).order('updated_at', { ascending: false }).limit(30);
      const ids = (tablice ?? []).map((t: any) => t.id);
      const licz: Record<string, { na_pewno: number; byc_moze: number }> = {};
      if (ids.length) {
        const { data: miejsca } = await db.from('trip_project_places').select('project_id, priority').in('project_id', ids);
        for (const m of miejsca ?? []) {
          const l = (licz[m.project_id] ??= { na_pewno: 0, byc_moze: 0 });
          if (m.priority === 'must') l.na_pewno++; else if (m.priority === 'nice') l.byc_moze++;
        }
      }
      return {
        tablice: (tablice ?? []).map((t: any) => ({
          tablica_id: t.id, nazwa: t.name, miasto: t.destination, dni: t.days,
          od: t.start_date ?? undefined, do: t.end_date ?? undefined,
          miejsca: licz[t.id] ?? { na_pewno: 0, byc_moze: 0 }, link: linkTablicy(t.id),
        })),
      };
    },
  },
  {
    name: 'pokaz_tablice',
    title: 'Pokaż tablicę',
    description: 'Pokazuje miejsca na tablicy pogrupowane według decyzji (na pewno / być może / odrzucone), z terminem i punktem startowym.',
    inputSchema: { type: 'object', additionalProperties: false, required: ['tablica_id'], properties: { tablica_id: { type: 'string', description: 'Identyfikator z moje_tablice.' } } },
    annotations: { title: 'Pokaż tablicę', readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    async wykonaj(a, userId) {
      const t = await mojaTablica(a.tablica_id, userId);
      const { data } = await db.from('trip_project_places')
        .select('name, category, priority, visit_minutes, opening_hours, catalog_id').eq('project_id', t.id).order('sort_order').limit(300);
      const grupy: Record<string, unknown[]> = { na_pewno: [], byc_moze: [], odrzucone: [] };
      for (const m of data ?? []) {
        const k = m.priority === 'must' ? 'na_pewno' : m.priority === 'rejected' ? 'odrzucone' : 'byc_moze';
        grupy[k].push({ nazwa: m.name, kategoria: m.category, czas_min: m.visit_minutes ?? undefined, godziny: m.opening_hours ?? undefined });
      }
      return {
        tablica_id: t.id, nazwa: t.name, miasto: t.destination, dni: t.days,
        od: t.start_date ?? undefined, do: t.end_date ?? undefined, start: t.start_name ?? undefined,
        ...grupy, link: linkTablicy(t.id),
        plan: 'Plan dni układa się w aplikacji (5 tokenów): otwórz link i wybierz „Ułóż plan”.',
      };
    },
  },
  {
    name: 'utworz_tablice',
    title: 'Utwórz tablicę wyjazdu',
    description: 'Zakłada nową tablicę wyjazdu do miasta. Jeśli miasta nie ma jeszcze w katalogu, uruchamia jego zbieranie w tle — miejsca pojawią się po ok. minucie. Nowa tablica jest widoczna według ustawień aplikacji (domyślnie publiczna); nie wstawiaj do niej danych prywatnych.',
    inputSchema: {
      type: 'object', additionalProperties: false, required: ['miasto'],
      properties: {
        miasto: { type: 'string', description: 'Dokąd jedziesz.' },
        nazwa: { type: 'string', description: 'Opcjonalnie: nazwa tablicy (domyślnie „<miasto> — wyjazd”).' },
        dni: { type: 'integer', minimum: 1, maximum: 14, description: 'Ile dni (domyślnie 2).' },
        data_od: { type: 'string', description: 'Opcjonalnie: pierwszy dzień, RRRR-MM-DD.' },
        data_do: { type: 'string', description: 'Opcjonalnie: ostatni dzień, RRRR-MM-DD.' },
        charakter: { type: 'string', enum: CHARAKTERY, description: 'Opcjonalnie: business, family, couple, friends, solo, active.' },
      },
    },
    annotations: { title: 'Utwórz tablicę wyjazdu', readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
    async wykonaj(a, userId) {
      const wpisane = skroc(a.miasto, 60);
      if (!wpisane || !/\p{L}/u.test(wpisane)) throw new BladNarzedzia('Podaj nazwę miasta.');
      const { count } = await db.from('trip_projects').select('id', { count: 'exact', head: true })
        .eq('user_id', userId).gte('created_at', new Date(Date.now() - 3600_000).toISOString());
      if ((count ?? 0) >= 10) throw new BladNarzedzia('Założono już 10 tablic w ostatniej godzinie — spróbuj później.');
      let dni = Math.min(14, Math.max(1, Number(a.dni) || 2));
      let od: string | null = null, do_: string | null = null;
      if (a.data_od) {
        if (!DATA.test(a.data_od)) throw new BladNarzedzia('data_od ma mieć format RRRR-MM-DD.');
        od = a.data_od; do_ = DATA.test(a.data_do ?? '') ? a.data_do : od;
        const roznica = Math.round((Date.parse(do_ as string) - Date.parse(a.data_od)) / 86400000) + 1;
        if (!(roznica >= 1 && roznica <= 14)) throw new BladNarzedzia('Zakres dat to od 1 do 14 dni.');
        dni = roznica;
      }
      const kanoniczne = await miastoZKatalogu(wpisane);
      const miasto = kanoniczne ?? wpisane;
      const { data, error } = await db.from('trip_projects').insert({
        user_id: userId, name: skroc(a.nazwa, 80) || `${miasto} — wyjazd`, destination: miasto, days: dni,
        start_date: od, end_date: do_, trip_type: CHARAKTERY.includes(a.charakter) ? a.charakter : null,
      }).select('id, name, destination, days').single();
      if (error) throw new Error(error.message);
      let uwaga = 'Miasto jest w katalogu — możesz od razu szukać miejsc (szukaj_miejsc).';
      if (!kanoniczne) {
        if (przekroczonyLimit(`seed:${userId}`, 2, 3600_000)) {
          uwaga = 'Miasta nie ma w katalogu, a limit zbierania nowych miast (2 na godzinę) jest wyczerpany. Otwórz tablicę w aplikacji — zbierze miasto po wejściu w Odkrywaj.';
        } else {
          const { zbierzMiasto, dokonczMiasto } = await import('../routes/catalog.js');
          void zbierzMiasto(miasto).then(() => dokonczMiasto(miasto)).catch((e: any) => console.warn('[mcp] zbieranie miasta:', e.message));
          uwaga = 'Miasta nie było w katalogu — zbieram je w tle. Poczekaj ok. minutę i użyj szukaj_miejsc.';
        }
      }
      return { tablica_id: data.id, nazwa: data.name, miasto: data.destination, dni: data.days, link: linkTablicy(data.id), uwaga };
    },
  },
  {
    name: 'dodaj_miejsce',
    title: 'Dodaj miejsce do tablicy',
    description: 'Dodaje miejsce z katalogu na tablicę z decyzją albo zmienia decyzję o miejscu, które już tam jest. Nie usuwa niczego; miejsce „odrzucone” zostaje na tablicy, ale nie wchodzi do planu.',
    inputSchema: {
      type: 'object', additionalProperties: false, required: ['tablica_id', 'miejsce_id'],
      properties: {
        tablica_id: { type: 'string', description: 'Identyfikator z moje_tablice lub utworz_tablice.' },
        miejsce_id: { type: 'string', description: 'Identyfikator miejsca z szukaj_miejsc.' },
        decyzja: { type: 'string', enum: Object.keys(DECYZJE), description: 'na_pewno (domyślnie), byc_moze albo odrzucone.' },
      },
    },
    annotations: { title: 'Dodaj miejsce do tablicy', readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    async wykonaj(a, userId) {
      const t = await mojaTablica(a.tablica_id, userId);
      if (typeof a.miejsce_id !== 'string' || !UUID.test(a.miejsce_id)) throw new BladNarzedzia('miejsce_id musi być identyfikatorem z szukaj_miejsc.');
      const priorytet = DECYZJE[(a.decyzja ?? 'na_pewno') as keyof typeof DECYZJE];
      if (!priorytet) throw new BladNarzedzia('decyzja: na_pewno, byc_moze albo odrzucone.');
      const { data: m } = await db.from('place_catalog').select('*').eq('id', a.miejsce_id).maybeSingle();
      if (!m) throw new BladNarzedzia('Nie znalazłem takiego miejsca w katalogu. Użyj szukaj_miejsc.');
      const { data: istnieje } = await db.from('trip_project_places').select('id, priority')
        .eq('project_id', t.id).eq('catalog_id', m.id).maybeSingle();
      if (istnieje) {
        if (istnieje.priority !== priorytet) {
          const { error } = await db.from('trip_project_places').update({ priority: priorytet }).eq('id', istnieje.id);
          if (error) throw new Error(error.message);
        }
      } else {
        const { error } = await db.from('trip_project_places').insert({
          project_id: t.id, catalog_id: m.id, name: m.name, category: m.category, priority: priorytet,
          lat: m.lat, lng: m.lng, description: m.description, opening_hours: m.opening_hours,
          visit_minutes: m.visit_minutes, image_url: Array.isArray(m.photos) ? m.photos[0] ?? null : null, source: 'catalog',
        });
        if (error) throw new Error(error.message);
      }
      await db.from('trip_projects').update({ updated_at: new Date().toISOString() }).eq('id', t.id);
      return {
        ok: true, tablica: t.name, miejsce: m.name, decyzja: DECYZJA_OPIS[priorytet],
        zmiana: istnieje ? (istnieje.priority === priorytet ? 'bez zmian' : 'zmieniona decyzja') : 'dodane', link: linkTablicy(t.id),
      };
    },
  },
  {
    name: 'ustaw_termin',
    title: 'Ustaw termin wyjazdu',
    description: 'Ustawia daty wyjazdu na tablicy (od tego zależą godziny otwarcia w planie).',
    inputSchema: {
      type: 'object', additionalProperties: false, required: ['tablica_id', 'data_od'],
      properties: {
        tablica_id: { type: 'string' },
        data_od: { type: 'string', description: 'Pierwszy dzień, RRRR-MM-DD.' },
        data_do: { type: 'string', description: 'Ostatni dzień, RRRR-MM-DD (domyślnie jeden dzień).' },
      },
    },
    annotations: { title: 'Ustaw termin wyjazdu', readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    async wykonaj(a, userId) {
      const t = await mojaTablica(a.tablica_id, userId);
      if (!DATA.test(a.data_od ?? '')) throw new BladNarzedzia('data_od ma mieć format RRRR-MM-DD.');
      const do_ = DATA.test(a.data_do ?? '') ? a.data_do : a.data_od;
      const dni = Math.round((Date.parse(do_) - Date.parse(a.data_od)) / 86400000) + 1;
      if (!(dni >= 1 && dni <= 14)) throw new BladNarzedzia('Zakres dat to od 1 do 14 dni.');
      const { error } = await db.from('trip_projects').update({ start_date: a.data_od, end_date: do_, days: dni, updated_at: new Date().toISOString() }).eq('id', t.id);
      if (error) throw new Error(error.message);
      return { ok: true, tablica: t.name, od: a.data_od, do: do_, dni, link: linkTablicy(t.id) };
    },
  },
  {
    name: 'saldo_tokenow',
    title: 'Saldo tokenów',
    description: 'Ile tokenów ma użytkownik. Ułożenie planu dni kosztuje 5 tokenów i odbywa się w aplikacji.',
    inputSchema: { type: 'object', additionalProperties: false, properties: {} },
    annotations: { title: 'Saldo tokenów', readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    async wykonaj(_a, userId) {
      return { tokeny: await repo.getTokenBalance(userId), plan_dni_kosztuje: 5 };
    },
  },
];

// ── Wspólne wykonywanie narzędzi (MCP i agent w aplikacji) ─────────────────

export const opisyNarzedzi = () => NARZEDZIA.map((n) => ({
  name: n.name, title: n.title, description: n.description, inputSchema: n.inputSchema, annotations: n.annotations,
}));

export const czyZapisuje = (nazwa: string) => NARZEDZIA.find((n) => n.name === nazwa)?.annotations.readOnlyHint === false;

/**
 * Jedno wejście do narzędzi dla wszystkich klientów. Błąd narzędzia to wynik,
 * nie wyjątek — agent ma go przeczytać i się poprawić. Nieznane błędy (bazy,
 * sieci) nie wychodzą na zewnątrz ze szczegółami.
 */
export async function wykonajNarzedzie(nazwa: string, argumenty: Record<string, any>, userId: string):
  Promise<{ ok: boolean; tekst: string; dane?: any } | null> {
  const n = NARZEDZIA.find((x) => x.name === nazwa);
  if (!n) return null;
  try {
    const dane = await n.wykonaj(argumenty ?? {}, userId);
    console.log(`[mcp] ${n.name} ok (${userId.slice(0, 8)})`);
    return { ok: true, tekst: JSON.stringify(dane, null, 2), dane };
  } catch (e: any) {
    const znany = e instanceof BladNarzedzia;
    if (!znany) console.warn(`[mcp] ${n.name}: ${e.message}`);
    return { ok: false, tekst: znany ? e.message : 'Nie udało się wykonać operacji — spróbuj za chwilę.' };
  }
}

// ── Protokół JSON-RPC 2.0 (Streamable HTTP, bez strumienia SSE) ────────────

const WERSJE = ['2025-06-18', '2025-03-26', '2024-11-05'];

const INSTRUKCJE = 'RouteMarket to planer wyjazdów. Ułóż tablicę razem z użytkownikiem: znajdź miejsca (szukaj_miejsc), '
  + 'dodaj je z decyzją „na pewno” albo „być może” (dodaj_miejsce) i ustaw termin. Plan dni układa się w aplikacji — '
  + 'daj użytkownikowi link do tablicy. Nie usuwasz niczego, a decyzję o miejscu można zmienić w każdej chwili.';

export async function obsluzJsonRpc(msg: any, userId: string): Promise<any | null> {
  const id = msg?.id;
  const odp = (result: unknown) => ({ jsonrpc: '2.0', id, result });
  const blad = (code: number, message: string) => ({ jsonrpc: '2.0', id: id ?? null, error: { code, message } });
  if (!msg || msg.jsonrpc !== '2.0' || typeof msg.method !== 'string') return blad(-32600, 'Nieprawidłowe żądanie');
  if (id === undefined) return null; // powiadomienie — bez odpowiedzi
  switch (msg.method) {
    case 'initialize': {
      const zadana = msg.params?.protocolVersion;
      return odp({
        protocolVersion: WERSJE.includes(zadana) ? zadana : WERSJE[0],
        capabilities: { tools: { listChanged: false } },
        serverInfo: { name: 'routemarket', title: 'RouteMarket', version: '1.0.0' },
        instructions: INSTRUKCJE,
      });
    }
    case 'ping': return odp({});
    case 'tools/list':
      return odp({ tools: opisyNarzedzi() });
    case 'resources/list': return odp({ resources: [] });
    case 'prompts/list': return odp({ prompts: [] });
    case 'tools/call': {
      const w = await wykonajNarzedzie(msg.params?.name, msg.params?.arguments ?? {}, userId);
      if (!w) return blad(-32602, `Nieznane narzędzie: ${String(msg.params?.name).slice(0, 60)}`);
      return odp({ content: [{ type: 'text', text: w.tekst }], isError: !w.ok });
    }
    default: return blad(-32601, `Nieobsługiwana metoda: ${msg.method.slice(0, 60)}`);
  }
}
