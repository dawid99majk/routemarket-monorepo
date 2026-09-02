import { supabase } from '@/integrations/supabase/client';

export function pobierzVoterToken(): string {
  try {
    let token = localStorage.getItem('rm_voter_token');
    if (!token) {
      token = 'voter_' + Math.random().toString(36).substring(2, 11) + '_' + Date.now().toString(36);
      localStorage.setItem('rm_voter_token', token);
    }
    return token;
  } catch {
    return 'voter_anon';
  }
}

export async function glosujNaMiejsce(placeId: string): Promise<{ zaglosowano: boolean; vote_count: number }> {
  const token = pobierzVoterToken();
  const { data, error } = await (supabase as any).rpc('rm_glosuj_miejsce', {
    p_place_id: placeId,
    p_voter_token: token,
  });
  if (error) throw error;
  return data as { zaglosowano: boolean; vote_count: number };
}

export async function wczytajMojeGlosy(placeIds: string[]): Promise<Set<string>> {
  if (!placeIds.length) return new Set();
  const token = pobierzVoterToken();
  const { data, error } = await (supabase as any)
    .from('trip_project_place_votes')
    .select('place_id')
    .eq('voter_token', token)
    .in('place_id', placeIds);
  if (error || !data) return new Set();
  return new Set(data.map((r: any) => r.place_id));
}
