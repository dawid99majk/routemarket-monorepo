import { supabase } from '@/integrations/supabase/client';

/**
 * Nazwa użytkownika do podpisów i awatarów. Profil zapisuje ją w profiles.display_name
 * i to jest jedyne pole, które użytkownik może edytować — planer czytał wcześniej
 * metadane konta, których nikt nigdy nie wypełniał, więc wszędzie widniał "Podróżnik".
 *
 * Domyślną wartością display_name jest adres e-mail, a adres nie jest imieniem
 * i nie ma prawa trafić na publiczną tablicę — dlatego go odrzucamy.
 */
export async function nazwaUzytkownika(): Promise<string | null> {
  const { data } = await supabase.auth.getUser();
  const u = data.user;
  if (!u) return null;

  const { data: profil } = await (supabase as any)
    .from('profiles').select('display_name').eq('user_id', u.id).maybeSingle();

  const kandydat = String(profil?.display_name ?? '').trim();
  if (kandydat && !kandydat.includes('@')) return kandydat;

  const zMetadanych = String((u.user_metadata as any)?.full_name ?? '').trim();
  return zMetadanych && !zMetadanych.includes('@') ? zMetadanych : null;
}

/** Inicjały do awatara; bez nazwy bierzemy dwie litery z adresu. */
export async function inicjalyUzytkownika(): Promise<string | null> {
  const nazwa = await nazwaUzytkownika();
  if (nazwa) return nazwa.split(/\s+/).slice(0, 2).map((c) => c[0]).join('').toUpperCase();
  const { data } = await supabase.auth.getUser();
  return (data.user?.email ?? '').slice(0, 2).toUpperCase() || null;
}

/** Podpis publiczny: imię i inicjał nazwiska, nigdy adres e-mail. */
export async function podpisPubliczny(): Promise<string | null> {
  const nazwa = await nazwaUzytkownika();
  if (!nazwa) return null;
  const cz = nazwa.split(/\s+/);
  return cz.length > 1 ? `${cz[0]} ${cz[1][0]}.` : cz[0];
}
