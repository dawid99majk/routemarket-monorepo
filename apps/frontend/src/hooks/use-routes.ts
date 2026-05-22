import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { normalizePreviewTrack } from '@/lib/track-utils';

export interface RouteWithDetails {
  id: number;
  title: string;
  description: string;
  price: number;
  category_id: number | null;
  category_name: string;
  creator_name: string;
  cover_image_key: string | null;
  gpx_file_key: string | null;
  pdf_file_key: string | null;
  location_string: string;
  latitude: number;
  longitude: number;
  distance_km: number | null;
  elevation_gain_m: number | null;
  estimated_time_h: number | null;
  difficulty: string | null;
  surface_type: string | null;
  season: string | null;
  loop_type: string | null;
  start_point: string | null;
  end_point: string | null;
  status: string;
  created_at: string;
  user_id: string;
  ai_assisted: boolean;
  ai_assisted_scope: string | null;
  ai_assisted_note: string | null;
  risk_level: string | null;
  known_hazards: string[] | null;
  required_equipment: string[] | null;
  last_verified_at: string | null;
  data_confidence: string | null;
  preview_track: [number, number][] | null;
}

export interface CategoryRow {
  id: number;
  name: string;
  icon: string;
  sort_order: number;
}

export interface RouteStatsRow {
  route_id: number;
  average_rating: number;
  total_ratings: number;
  total_purchases: number;
}

function getCoverUrl(key: string | null): string {
  if (!key) return 'https://images.unsplash.com/photo-1469474968028-56623f02e42e?w=600&h=400&fit=crop';
  if (key.startsWith('http')) return key;
  const { data } = supabase.storage.from('route-covers').getPublicUrl(key);
  return data.publicUrl;
}

export function useRouteImages(routeId: number | undefined) {
  return useQuery({
    queryKey: ['route-images', routeId],
    enabled: !!routeId,
    queryFn: async (): Promise<string[]> => {
      const { data, error } = await supabase
        .from('route_images')
        .select('image_key, sort_order')
        .eq('route_id', routeId!)
        .order('sort_order');
      if (error) throw error;
      return (data ?? []).map((r) => getCoverUrl(r.image_key));
    },
    staleTime: 1000 * 60 * 5,
  });
}

export function useCategories() {
  return useQuery({
    queryKey: ['categories'],
    queryFn: async (): Promise<CategoryRow[]> => {
      const { data, error } = await supabase
        .from('categories')
        .select('*')
        .order('sort_order');
      if (error) throw error;
      return data ?? [];
    },
    staleTime: 1000 * 60 * 10,
  });
}

export function usePublishedRoutes() {
  return useQuery({
    queryKey: ['routes', 'published'],
    queryFn: async (): Promise<RouteWithDetails[]> => {
      // Fetch routes and categories
      const { data: routesData, error } = await supabase
        .from('routes')
        .select(`*, categories ( name )`)
        .eq('status', 'published')
        .order('created_at', { ascending: false });

      if (error) throw error;
      if (!routesData?.length) return [];

      // Fetch creator names from profiles
      const userIds = [...new Set(routesData.map((r) => r.user_id))];
      const { data: profiles } = await supabase
        .from('profiles')
        .select('user_id, display_name')
        .in('user_id', userIds);

      const profileMap: Record<string, string> = {};
      (profiles ?? []).forEach((p) => { profileMap[p.user_id] = p.display_name ?? 'Anonymous'; });

      return routesData.map((r: any) => ({
        ...r,
        category_name: r.categories?.name ?? 'Unknown',
        creator_name: profileMap[r.user_id] ?? 'Anonymous',
        cover_image_key: getCoverUrl(r.cover_image_key),
        preview_track: normalizePreviewTrack(r.preview_track),
      }));
    },
  });
}

export function useRouteById(id: number | undefined) {
  return useQuery({
    queryKey: ['route', id],
    enabled: !!id,
    queryFn: async (): Promise<RouteWithDetails | null> => {
      const { data, error } = await supabase
        .from('routes')
        .select(`*, categories ( name )`)
        .eq('id', id!)
        .maybeSingle();

      if (error) throw error;
      if (!data) return null;

      // Fetch creator name
      const { data: profile } = await supabase
        .from('profiles')
        .select('display_name')
        .eq('user_id', data.user_id)
        .maybeSingle();

      return {
        ...data,
        category_name: (data as any).categories?.name ?? 'Unknown',
        creator_name: profile?.display_name ?? 'Anonymous',
        cover_image_key: getCoverUrl(data.cover_image_key),
        preview_track: normalizePreviewTrack(data.preview_track),
      } as RouteWithDetails;
    },
  });
}

export function useRouteStats(routeIds: number[]) {
  return useQuery({
    queryKey: ['route-stats', routeIds],
    enabled: routeIds.length > 0,
    queryFn: async (): Promise<Record<number, { average_rating: number; total_ratings: number; total_purchases: number }>> => {
      const [ratingsRes, purchasesRes] = await Promise.all([
        supabase.from('ratings').select('route_id, score').in('route_id', routeIds),
        supabase.from('purchases').select('route_id').in('route_id', routeIds),
      ]);

      const statsMap: Record<number, { average_rating: number; total_ratings: number; total_purchases: number }> = {};

      // Aggregate ratings
      const ratingsByRoute: Record<number, number[]> = {};
      (ratingsRes.data ?? []).forEach((r) => {
        if (!ratingsByRoute[r.route_id]) ratingsByRoute[r.route_id] = [];
        ratingsByRoute[r.route_id].push(r.score);
      });

      // Aggregate purchases
      const purchasesByRoute: Record<number, number> = {};
      (purchasesRes.data ?? []).forEach((p) => {
        purchasesByRoute[p.route_id] = (purchasesByRoute[p.route_id] || 0) + 1;
      });

      routeIds.forEach((id) => {
        const scores = ratingsByRoute[id] || [];
        const avg = scores.length > 0 ? Math.round((scores.reduce((a, b) => a + b, 0) / scores.length) * 10) / 10 : 0;
        statsMap[id] = {
          average_rating: avg,
          total_ratings: scores.length,
          total_purchases: purchasesByRoute[id] || 0,
        };
      });

      return statsMap;
    },
    staleTime: 1000 * 60 * 2,
  });
}
