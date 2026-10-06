import { Hono } from 'hono';
import type { MiddlewareHandler } from 'hono';
import { randomUUID } from 'node:crypto';
import { repo } from '../db/repository.js';
import { authMiddleware } from '../middleware/auth.js';
import { rateLimit } from '../middleware/rate-limit.js';
import { geocodingService } from '../services/geocoding.js';
import { placeSlug } from '../services/katalog-helpers.js';
import {
  KOSZYK, adresPliku, bazaWkladu as db, nazwyAutorow, ocenMiejsce, ocenZdjecie, oczyscJpeg, podobneNazwy,
} from '../services/wklad.js';

export const wkladRouter = new Hono<{ Variables: { user: any; userId: string } }>();

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const KATEGORIE = ['attraction', 'food', 'hotel', 'nightlife'];
const MAKS_ZDJEC_NA_MIEJSCE = 6;
const MAKS_ZDJEC_NA_DOBE = 20;
const MAKS_MIEJSC_NA_DOBE = 10;

const doby = () => new Date(Date.now() - 24 * 3600_000).toISOString();

const tylkoAdministrator: MiddlewareHandler = async (c, next) => {
  if (!(c.get('user') as { roles?: string[] } | undefined)?.roles?.includes('admin')) {
    return c.json({ error: 'Operacja dostępna tylko dla administratora' }, 403);
  }
  await next();
};

/** Użytkownik, jeśli podał token — odczyty są publiczne, ale „moje" zdjęcia widzi tylko ich autor. */
async function opcjonalnyUzytkownik(authHeader: string | undefined): Promise<{ id: string; roles?: string[] } | null> {
  if (!authHeader?.startsWith('Bearer ')) return null;
  try { return await repo.getAuthenticatedUser(authHeader.split(' ')[1]); } catch { return null; }
}

// ── Nowe miejsce ─────────────────────────────────────────────────────────────

/**
 * Miejsce zgłoszone przez użytkownika. OSM nie zna wszystkiego — knajpy bez szyldu,
 * punktu widokowego znanego lokalsom czy świeżo otwartej galerii tam po prostu nie ma.
 * Warunek twardy: miejsce musi mieć położenie (punkt na mapie albo adres, który da się
 * zamienić na współrzędne) i leżeć blisko miasta, do którego je dodano — bez położenia
 * jest bezużyteczne w planowaniu i psuje wszystko dalej.
 *
 * Wpis od razu istnieje i autor może go użyć na tablicy. Pokazujemy go wszystkim
 * ('published') dopiero po automatycznej kontroli treści; kontrola, która się nie udała
 * albo coś zakwestionowała, zostawia go jako 'pending' do przeglądu.
 */
wkladRouter.post('/catalog/submit', authMiddleware, rateLimit({ name: 'catalog-submit', windowMs: 60 * 60_000, max: 10 }), async (c) => {
  try {
    const userId = c.get('userId');
    const body = await c.req.json() as {
      name?: string; city?: string; address?: string; category?: string; description?: string;
      website?: string; visit_minutes?: number; lat?: number; lng?: number;
    };
    const name = String(body?.name ?? '').trim().replace(/\s+/g, ' ');
    const city = String(body?.city ?? '').trim().replace(/\s+/g, ' ');
    const description = String(body?.description ?? '').trim().slice(0, 600);
    if (name.length < 2 || name.length > 120) return c.json({ error: 'Nazwa miejsca ma mieć od 2 do 120 znaków.' }, 400);
    if (city.length < 2 || city.length > 80) return c.json({ error: 'Podaj miasto.' }, 400);
    const category = KATEGORIE.includes(String(body.category)) ? String(body.category) : 'attraction';
    let website: string | null = null;
    if (body.website) {
      try {
        const u = new URL(String(body.website).trim());
        if (u.protocol === 'http:' || u.protocol === 'https:') website = u.toString().slice(0, 200);
      } catch { return c.json({ error: 'Adres strony jest niepoprawny.' }, 400); }
    }
    const minuty = Number.isFinite(body.visit_minutes) ? Math.round(Number(body.visit_minutes)) : null;
    const visit_minutes = minuty && minuty >= 5 && minuty <= 480 ? minuty : null;

    const { count: dzis } = await db.from('place_catalog').select('id', { count: 'exact', head: true })
      .eq('created_by', userId).eq('source', 'user').gte('created_at', doby());
    if ((dzis ?? 0) >= MAKS_MIEJSC_NA_DOBE) return c.json({ error: 'Dodałeś dziś już dużo miejsc. Wróć jutro.' }, 429);

    // Środek miasta służy do sprawdzenia, że punkt nie wylądował na innym kontynencie.
    let srodek: { lat: number; lng: number } | null = null;
    try { const s = await geocodingService.geocodeSettlement(city); srodek = { lat: s.lat, lng: s.lng }; } catch { /* niżej */ }
    const odleglosc = (lat: number, lng: number) => srodek
      ? Math.hypot((lat - srodek.lat) * 111, (lng - srodek.lng) * 111 * Math.cos((srodek.lat * Math.PI) / 180))
      : null;

    let lat = Number.isFinite(body.lat) ? Number(body.lat) : null;
    let lng = Number.isFinite(body.lng) ? Number(body.lng) : null;
    if (lat != null && lng != null && (Math.abs(lat) > 90 || Math.abs(lng) > 180)) { lat = null; lng = null; }
    let niezweryfikowanePolozenie = false;

    if (lat == null || lng == null) {
      if (!srodek) return c.json({ error: 'Nie znam tego miasta. Sprawdź nazwę albo wskaż punkt na mapie.' }, 422);
      try {
        const geo = await geocodingService.geocodeSinglePoint([body.address, name].filter(Boolean).join(', '), srodek, 40);
        if ((odleglosc(geo.lat, geo.lng) ?? 0) <= 40) { lat = geo.lat; lng = geo.lng; }
      } catch { /* obsłużone niżej */ }
    } else {
      const d = odleglosc(lat, lng);
      if (d == null) niezweryfikowanePolozenie = true;
      else if (d > 60) return c.json({ error: 'Ten punkt jest daleko od miasta. Wskaż punkt w mieście albo zmień miasto.' }, 422);
    }
    if (lat == null || lng == null) {
      return c.json({ error: 'Nie udało się ustalić położenia. Podaj dokładniejszy adres albo wskaż punkt na mapie.' }, 422);
    }

    const slug = placeSlug(name, city, lat, lng);
    const taki = await repo.findCatalogPlace(null, slug);
    if (taki) return c.json({ id: taki.id, slug: taki.slug, created: false, duplicate: true });

    // To samo miejsce pod prawie tą samą nazwą w promieniu ok. 150 m jest duplikatem, nie nowością.
    const dLat = 0.00135, dLng = 0.00135 / Math.max(0.2, Math.cos((lat * Math.PI) / 180));
    const { data: blisko } = await db.from('place_catalog').select('id, slug, name, status, created_by')
      .gte('lat', lat - dLat).lte('lat', lat + dLat).gte('lng', lng - dLng).lte('lng', lng + dLng).limit(40);
    const dubel = (blisko ?? []).find((p: any) => (p.status === 'published' || p.created_by === userId) && podobneNazwy(p.name, name));
    if (dubel) return c.json({ id: dubel.id, slug: dubel.slug, created: false, duplicate: true });

    const ocena = await ocenMiejsce({ name, city, description, website }, userId);
    const opublikowane = ocena.ok && !niezweryfikowanePolozenie;
    const utworzone = await repo.insertCatalogPlace({
      slug, name, city, lat, lng, category, description, website, visit_minutes, photos: [],
      source: 'user', created_by: userId, status: opublikowane ? 'published' : 'pending',
      updated_at: new Date().toISOString(),
    });
    console.log(`[wklad] miejsce "${name}" (${city}) od ${userId.slice(0, 8)} → ${opublikowane ? 'published' : 'pending'} (${ocena.powod})`);
    return c.json({ id: utworzone.id, slug: utworzone.slug, created: true, status: utworzone.status });
  } catch (err: any) {
    console.error('[catalog/submit] Error:', err);
    return c.json({ error: 'Nie udało się dodać miejsca. Spróbuj ponownie.' }, 500);
  }
});

// ── Zdjęcia od podróżnych ────────────────────────────────────────────────────

wkladRouter.get('/catalog/:id/photos', async (c) => {
  const placeId = c.req.param('id') ?? '';
  if (!UUID.test(placeId)) return c.json({ error: 'Niepoprawny identyfikator' }, 400);
  const uzytkownik = await opcjonalnyUzytkownik(c.req.header('Authorization'));
  const { data, error } = await db.from('place_photos')
    .select('id, user_id, path, thumb_path, width, height, caption, status, created_at')
    .eq('place_id', placeId).in('status', ['published', 'pending'])
    .order('created_at', { ascending: false }).limit(60);
  if (error) return c.json({ error: 'Nie udało się wczytać zdjęć.' }, 500);
  // Oczekujące widzi tylko ich autor.
  const widoczne = (data ?? []).filter((p: any) => p.status === 'published' || p.user_id === uzytkownik?.id);
  const autorzy = await nazwyAutorow(widoczne.map((p: any) => p.user_id));
  return c.json({
    photos: widoczne.map((p: any) => ({
      id: p.id, url: adresPliku(p.path), thumb_url: adresPliku(p.thumb_path), width: p.width, height: p.height,
      caption: p.caption, author: autorzy.get(p.user_id) ?? null, mine: p.user_id === uzytkownik?.id,
      pending: p.status === 'pending', created_at: p.created_at,
    })),
  });
});

wkladRouter.post('/catalog/:id/photos', authMiddleware, rateLimit({ name: 'zdjecie-upload', windowMs: 60 * 60_000, max: 20 }), async (c) => {
  const userId = c.get('userId');
  const placeId = c.req.param('id') ?? '';
  if (!UUID.test(placeId)) return c.json({ error: 'Niepoprawny identyfikator' }, 400);
  const wgrane: string[] = [];
  try {
    const form = await c.req.parseBody();
    const foto = form['foto'], mini = form['miniatura'];
    if (!(foto instanceof File) || !(mini instanceof File)) return c.json({ error: 'Brakuje zdjęcia.' }, 400);
    if (form['zgoda'] !== 'tak') return c.json({ error: 'Potwierdź, że masz prawo do tego zdjęcia.' }, 400);
    const podpis = String(form['podpis'] ?? '').trim().replace(/\s+/g, ' ').slice(0, 140) || null;
    if (podpis && /https?:\/\/|www\.|\S+@\S+\.\S+/i.test(podpis)) return c.json({ error: 'W podpisie nie umieszczamy linków ani adresów.' }, 400);

    const { data: miejsce } = await db.from('place_catalog').select('id, name, city, status, created_by').eq('id', placeId).maybeSingle();
    if (!miejsce || (miejsce.status !== 'published' && miejsce.created_by !== userId)) return c.json({ error: 'Nie ma takiego miejsca.' }, 404);

    const { count: naMiejscu } = await db.from('place_photos').select('id', { count: 'exact', head: true })
      .eq('place_id', placeId).eq('user_id', userId).neq('status', 'removed');
    if ((naMiejscu ?? 0) >= MAKS_ZDJEC_NA_MIEJSCE) return c.json({ error: `Do jednego miejsca możesz dodać do ${MAKS_ZDJEC_NA_MIEJSCE} zdjęć.` }, 409);
    const { count: dzis } = await db.from('place_photos').select('id', { count: 'exact', head: true })
      .eq('user_id', userId).gte('created_at', doby());
    if ((dzis ?? 0) >= MAKS_ZDJEC_NA_DOBE) return c.json({ error: 'Dodałeś dziś już dużo zdjęć. Wróć jutro.' }, 429);

    let pelne, miniatura;
    try {
      pelne = oczyscJpeg(Buffer.from(await foto.arrayBuffer()), { bok: 2400, bajty: 2.5 * 1024 * 1024 });
      miniatura = oczyscJpeg(Buffer.from(await mini.arrayBuffer()), { bok: 900, bajty: 300 * 1024 });
    } catch (e: any) { return c.json({ error: e.message }, 400); }

    const ocena = await ocenZdjecie(miniatura.buf, { name: miejsce.name, city: miejsce.city }, userId);
    const id = randomUUID();
    const sciezka = `${placeId}/${id}.jpg`, sciezkaMini = `${placeId}/${id}-m.jpg`;
    for (const [s, b] of [[sciezka, pelne.buf], [sciezkaMini, miniatura.buf]] as const) {
      const { error } = await db.storage.from(KOSZYK).upload(s, b, { contentType: 'image/jpeg', cacheControl: '31536000', upsert: false });
      if (error) throw new Error(`zapis pliku: ${error.message}`);
      wgrane.push(s);
    }
    const { error: blad } = await db.from('place_photos').insert({
      id, place_id: placeId, user_id: userId, path: sciezka, thumb_path: sciezkaMini,
      width: pelne.width, height: pelne.height, caption: podpis,
      status: ocena.ok ? 'published' : 'pending', moderacja: { ocena: ocena.powod, at: new Date().toISOString() },
    });
    if (blad) throw new Error(`zapis wiersza: ${blad.message}`);
    console.log(`[wklad] zdjęcie ${id.slice(0, 8)} do "${miejsce.name}" od ${userId.slice(0, 8)} → ${ocena.ok ? 'published' : 'pending'} (${ocena.powod})`);
    return c.json({ id, status: ocena.ok ? 'published' : 'pending', url: adresPliku(sciezka), thumb_url: adresPliku(sciezkaMini) });
  } catch (err: any) {
    if (wgrane.length) await db.storage.from(KOSZYK).remove(wgrane).catch(() => {});
    console.error('[zdjecie-upload]', err);
    return c.json({ error: 'Nie udało się dodać zdjęcia. Spróbuj ponownie.' }, 500);
  }
});

async function usunPliki(zdjecie: { path: string; thumb_path: string }) {
  await db.storage.from(KOSZYK).remove([zdjecie.path, zdjecie.thumb_path]).catch(() => {});
}

wkladRouter.delete('/catalog/photos/:photoId', authMiddleware, async (c) => {
  const photoId = c.req.param('photoId') ?? '';
  if (!UUID.test(photoId)) return c.json({ error: 'Niepoprawny identyfikator' }, 400);
  const { data: z } = await db.from('place_photos').select('id, user_id, path, thumb_path, status').eq('id', photoId).maybeSingle();
  if (!z || z.status === 'removed') return c.json({ error: 'Nie ma takiego zdjęcia.' }, 404);
  const admin = (c.get('user') as { roles?: string[] })?.roles?.includes('admin');
  if (z.user_id !== c.get('userId') && !admin) return c.json({ error: 'To nie jest Twoje zdjęcie.' }, 403);
  await db.from('place_photos').update({ status: 'removed' }).eq('id', photoId);
  await usunPliki(z);
  return c.json({ ok: true });
});

wkladRouter.post('/catalog/photos/:photoId/report', authMiddleware, rateLimit({ name: 'zdjecie-zgloszenie', windowMs: 60 * 60_000, max: 30 }), async (c) => {
  const photoId = c.req.param('photoId') ?? '';
  if (!UUID.test(photoId)) return c.json({ error: 'Niepoprawny identyfikator' }, 400);
  const { powod } = await c.req.json().catch(() => ({})) as { powod?: string };
  const { data: z } = await db.from('place_photos').select('id, user_id, status').eq('id', photoId).maybeSingle();
  if (!z || z.status === 'removed') return c.json({ error: 'Nie ma takiego zdjęcia.' }, 404);
  if (z.user_id === c.get('userId')) return c.json({ error: 'To Twoje zdjęcie — możesz je usunąć.' }, 400);
  const { error } = await db.from('place_photo_reports').upsert(
    { user_id: c.get('userId'), photo_id: photoId, reason: String(powod ?? '').slice(0, 300) },
    { onConflict: 'user_id,photo_id', ignoreDuplicates: true });
  if (error) return c.json({ error: 'Nie udało się zapisać zgłoszenia.' }, 500);
  return c.json({ ok: true });
});

// ── Przegląd (administrator) ─────────────────────────────────────────────────

wkladRouter.get('/admin/wklad', authMiddleware, tylkoAdministrator, async (c) => {
  const [{ data: zdjecia }, { data: miejsca }] = await Promise.all([
    db.from('place_photos').select('id, place_id, user_id, path, thumb_path, caption, moderacja, report_count, created_at')
      .eq('status', 'pending').order('created_at').limit(60),
    db.from('place_catalog').select('id, name, city, category, description, website, lat, lng, created_by, created_at')
      .eq('status', 'pending').order('created_at').limit(60),
  ]);
  const nazwy = new Map<string, string>();
  const ids = [...new Set((zdjecia ?? []).map((z: any) => z.place_id))];
  if (ids.length) {
    const { data } = await db.from('place_catalog').select('id, name, city').in('id', ids);
    for (const p of data ?? []) nazwy.set((p as any).id, `${(p as any).name} (${(p as any).city ?? '—'})`);
  }
  return c.json({
    zdjecia: (zdjecia ?? []).map((z: any) => ({ ...z, miejsce: nazwy.get(z.place_id) ?? z.place_id, url: adresPliku(z.path), thumb_url: adresPliku(z.thumb_path) })),
    miejsca: miejsca ?? [],
  });
});

wkladRouter.post('/admin/wklad/:rodzaj/:id/:akcja', authMiddleware, tylkoAdministrator, async (c) => {
  const { rodzaj, id, akcja } = c.req.param();
  if (!UUID.test(id) || !['zatwierdz', 'odrzuc'].includes(akcja)) return c.json({ error: 'Niepoprawne zapytanie' }, 400);
  if (rodzaj === 'zdjecie') {
    const { data: z } = await db.from('place_photos').select('path, thumb_path').eq('id', id).maybeSingle();
    if (!z) return c.json({ error: 'Nie ma takiego zdjęcia.' }, 404);
    if (akcja === 'zatwierdz') await db.from('place_photos').update({ status: 'published' }).eq('id', id);
    else { await db.from('place_photos').update({ status: 'removed' }).eq('id', id); await usunPliki(z); }
    return c.json({ ok: true });
  }
  if (rodzaj === 'miejsce') {
    const { error } = await db.from('place_catalog').update({ status: akcja === 'zatwierdz' ? 'published' : 'rejected', updated_at: new Date().toISOString() }).eq('id', id);
    return error ? c.json({ error: error.message }, 500) : c.json({ ok: true });
  }
  return c.json({ error: 'Nieznany rodzaj' }, 400);
});
