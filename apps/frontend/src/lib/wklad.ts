import { supabase } from '@/integrations/supabase/client';
import i18n from '@/i18n';
import { ApiError } from '@/lib/api';

const BASE = import.meta.env.VITE_API_URL || '/route-builder-api';

export interface ZdjecieWkladu {
  id: string;
  url: string;
  thumb_url: string;
  width: number;
  height: number;
  caption: string | null;
  author: string | null;
  mine: boolean;
  pending: boolean;
  created_at: string;
}

/**
 * Zdjęcie od użytkownika przechodzi przez płótno: przeglądarka przeskaluje je,
 * zastosuje obrót z EXIF i zapisze jako nowy JPEG bez metadanych — razem z położeniem
 * GPS, którego nikt nie zamierzał publikować. Serwer czyści plik jeszcze raz, bo nie może
 * ufać klientowi, ale tu dzieje się to, co oszczędza łącze: z 8 MB z telefonu robi się
 * kilkaset kB.
 */
async function naPlotnie(plik: File, bok: number, jakosc: number): Promise<{ blob: Blob; w: number; h: number }> {
  let bmp: ImageBitmap;
  try {
    bmp = await createImageBitmap(plik, { imageOrientation: 'from-image' });
  } catch {
    throw new ApiError(i18n.t('wklad.zdjecie_nie_obraz'), 400);
  }
  const skala = Math.min(1, bok / Math.max(bmp.width, bmp.height));
  const w = Math.max(1, Math.round(bmp.width * skala));
  const h = Math.max(1, Math.round(bmp.height * skala));
  if (Math.min(bmp.width, bmp.height) < 200) {
    bmp.close?.();
    throw new ApiError(i18n.t('wklad.zdjecie_za_male'), 400);
  }
  const plotno = document.createElement('canvas');
  plotno.width = w;
  plotno.height = h;
  const ctx = plotno.getContext('2d');
  if (!ctx) throw new ApiError(i18n.t('wklad.zdjecie_nie_obraz'), 400);
  ctx.fillStyle = '#fff';           // PNG z przezroczystością nie może wyjść czarny
  ctx.fillRect(0, 0, w, h);
  ctx.drawImage(bmp, 0, 0, w, h);
  bmp.close?.();
  const blob = await new Promise<Blob | null>((ok) => plotno.toBlob(ok, 'image/jpeg', jakosc));
  if (!blob) throw new ApiError(i18n.t('wklad.zdjecie_nie_obraz'), 400);
  return { blob, w, h };
}

async function naglowki(): Promise<Record<string, string>> {
  const { data: { session } } = await supabase.auth.getSession();
  const h: Record<string, string> = { 'Accept-Language': i18n.language?.split('-')[0] || 'pl' };
  if (session?.access_token) h.Authorization = `Bearer ${session.access_token}`;
  return h;
}

async function bladZOdpowiedzi(res: Response, domyslny: string): Promise<ApiError> {
  const payload = await res.json().catch(() => null);
  if (res.status === 413) return new ApiError(i18n.t('wklad.zdjecie_za_duze'), 413);
  if (res.status === 401) return new ApiError(i18n.t('wklad.zaloguj_sie'), 401);
  return new ApiError(payload?.error || domyslny, res.status, payload?.retry_after_s);
}

export async function pobierzZdjeciaWkladu(placeId: string): Promise<ZdjecieWkladu[]> {
  const res = await fetch(`${BASE}/catalog/${placeId}/photos`, { headers: await naglowki() });
  if (!res.ok) throw await bladZOdpowiedzi(res, i18n.t('wklad.zdjecie_blad'));
  return (await res.json()).photos ?? [];
}

export async function wyslijZdjecie(placeId: string, plik: File, podpis: string): Promise<{ id: string; status: 'published' | 'pending' }> {
  const [pelne, mini] = await Promise.all([naPlotnie(plik, 1600, 0.82), naPlotnie(plik, 600, 0.78)]);
  const form = new FormData();
  form.append('foto', pelne.blob, 'foto.jpg');
  form.append('miniatura', mini.blob, 'miniatura.jpg');
  form.append('podpis', podpis.trim());
  form.append('zgoda', 'tak');
  const res = await fetch(`${BASE}/catalog/${placeId}/photos`, { method: 'POST', headers: await naglowki(), body: form });
  if (!res.ok) throw await bladZOdpowiedzi(res, i18n.t('wklad.zdjecie_blad'));
  return res.json();
}

export async function zglosZdjecie(photoId: string, powod = ''): Promise<void> {
  const res = await fetch(`${BASE}/catalog/photos/${photoId}/report`, {
    method: 'POST', headers: { ...(await naglowki()), 'Content-Type': 'application/json' }, body: JSON.stringify({ powod }),
  });
  if (!res.ok) throw await bladZOdpowiedzi(res, i18n.t('wklad.zdjecie_blad'));
}

export async function usunZdjecie(photoId: string): Promise<void> {
  const res = await fetch(`${BASE}/catalog/photos/${photoId}`, { method: 'DELETE', headers: await naglowki() });
  if (!res.ok) throw await bladZOdpowiedzi(res, i18n.t('wklad.zdjecie_blad'));
}
