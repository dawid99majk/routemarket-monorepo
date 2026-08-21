import { supabase } from '@/integrations/supabase/client';
import { TRIP_PRESETS, EMPTY_AXES } from '@/lib/tripPresets';

export interface ZamiarWyjazdu {
  cel: string;
  klimat: string;
  /** Termin wpisany swobodnie; nierozpoznany zostawia wyjazd bez dat. */
  termin?: string;
}

const MIESIACE = ['stycznia', 'lutego', 'marca', 'kwietnia', 'maja', 'czerwca',
  'lipca', 'sierpnia', 'września', 'października', 'listopada', 'grudnia'];

/**
 * Termin wpisywany jednym polem. Rozpoznajemy zapisy, których ludzie faktycznie
 * używają; gdy żaden nie pasuje, wyjazd powstaje bez dat jako szkic — to lepsze
 * niż zgadywanie terminu albo blokowanie zapisu.
 */
export function parseTermin(raw: string | undefined): { start: Date; days: number } | null {
  const t = (raw ?? '').trim().toLowerCase().replace(/[–—]/g, '-');
  if (!t) return null;
  const rok = new Date().getFullYear();

  const slowny = t.match(/^(\d{1,2})\s*-\s*(\d{1,2})\s+([a-ząćęłńóśźż]+)\s*(\d{4})?$/);
  if (slowny) {
    const mi = MIESIACE.findIndex((m) => m.startsWith(slowny[3].slice(0, 5)));
    if (mi >= 0) {
      const y = slowny[4] ? Number(slowny[4]) : rok;
      const days = Number(slowny[2]) - Number(slowny[1]) + 1;
      if (days > 0 && days < 60) return { start: new Date(y, mi, Number(slowny[1])), days };
    }
  }

  const cyfry = t.match(/^(\d{1,2})[.\/](\d{1,2})(?:[.\/](\d{4}))?\s*-\s*(\d{1,2})[.\/](\d{1,2})(?:[.\/](\d{4}))?$/);
  if (cyfry) {
    const start = new Date(Number(cyfry[3] || rok), Number(cyfry[2]) - 1, Number(cyfry[1]));
    const koniec = new Date(Number(cyfry[6] || cyfry[3] || rok), Number(cyfry[5]) - 1, Number(cyfry[4]));
    const days = Math.round((koniec.getTime() - start.getTime()) / 86_400_000) + 1;
    if (days > 0 && days < 60) return { start, days };
  }
  return null;
}

export const etykietaKlimatu = (id: string) =>
  id === 'solo' ? 'Solo' : TRIP_PRESETS.find((t) => t.id === id)?.label ?? id;

/**
 * Jedno miejsce, w którym powstaje wyjazd. Wcześniej ta sama logika żyła
 * w panelu na Starcie, a landing tylko odkładał zamiar do sesji — przez co
 * użytkownik po wpisaniu miasta i tak lądował na formularzu i klikał drugi raz.
 */
export async function utworzWyjazd({ cel, klimat, termin }: ZamiarWyjazdu): Promise<string | null> {
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) return null;

  const parsed = parseTermin(termin);
  // parseTermin od początku zwracał datę startu, a tu brana była wyłącznie liczba
  // dni — termin wpisany na pierwszym ekranie ginął bezpowrotnie i na tablicy nie
  // było już czego pokazać ani czym sterować godzinami otwarcia.
  const isoDnia = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const koniec = parsed
    ? new Date(parsed.start.getTime() + (parsed.days - 1) * 86_400_000)
    : null;

  const { data, error } = await supabase.from('trip_projects').insert({
    user_id: userData.user.id,
    name: `${cel.trim()} ${etykietaKlimatu(klimat).toLowerCase()}`,
    destination: cel.trim(),
    days: parsed?.days ?? null,
    start_date: parsed ? isoDnia(parsed.start) : null,
    end_date: koniec ? isoDnia(koniec) : null,
    trip_type: klimat,
    ...(TRIP_PRESETS.find((t) => t.id === klimat)?.axes ?? EMPTY_AXES),
  }).select('id').single();

  if (error) throw new Error(error.message);
  return data?.id ?? null;
}
