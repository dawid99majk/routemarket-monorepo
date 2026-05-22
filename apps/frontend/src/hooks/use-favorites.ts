import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export function useFavoritesCount(routeIds: number[]) {
  return useQuery({
    queryKey: ['favorites-count', routeIds],
    enabled: routeIds.length > 0,
    queryFn: async (): Promise<Record<number, number>> => {
      const { data, error } = await supabase
        .rpc('get_favorites_count', { route_ids: routeIds } as any);
      if (error) throw error;
      const counts: Record<number, number> = {};
      ((data as any[]) ?? []).forEach((f: any) => {
        counts[f.route_id] = f.fav_count;
      });
      return counts;
    },
    staleTime: 1000 * 60 * 2,
  });
}

export function useUserFavorites(userId: string | undefined) {
  return useQuery({
    queryKey: ['user-favorites', userId],
    enabled: !!userId,
    queryFn: async (): Promise<number[]> => {
      const { data, error } = await supabase
        .from('favorites')
        .select('route_id')
        .eq('user_id', userId!);
      if (error) throw error;
      return (data ?? []).map((f) => f.route_id);
    },
    staleTime: 1000 * 60,
  });
}

export function useToggleFavorite() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ userId, routeId, isFavorited }: { userId: string; routeId: number; isFavorited: boolean }) => {
      if (isFavorited) {
        const { error } = await supabase
          .from('favorites')
          .delete()
          .eq('user_id', userId)
          .eq('route_id', routeId);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('favorites')
          .insert({ user_id: userId, route_id: routeId });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['user-favorites'] });
      queryClient.invalidateQueries({ queryKey: ['favorites-count'] });
    },
  });
}
