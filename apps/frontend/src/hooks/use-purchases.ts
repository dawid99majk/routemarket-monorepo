import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export function useUserPurchases(userId: string | undefined) {
  return useQuery({
    queryKey: ['purchases', userId],
    enabled: !!userId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('purchases')
        .select('*')
        .eq('user_id', userId!)
        .order('purchased_at', { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useHasPurchased(userId: string | undefined, routeId: number | undefined) {
  return useQuery({
    queryKey: ['purchase-check', userId, routeId],
    enabled: !!userId && !!routeId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('purchases')
        .select('id')
        .eq('user_id', userId!)
        .eq('route_id', routeId!)
        .maybeSingle();
      if (error) throw error;
      return !!data;
    },
  });
}

export function useCreatorSales(userId: string | undefined) {
  return useQuery({
    queryKey: ['creator-sales', userId],
    enabled: !!userId,
    queryFn: async () => {
      // Get creator's route IDs first
      const { data: routes, error: routesErr } = await supabase
        .from('routes')
        .select('id')
        .eq('user_id', userId!);
      if (routesErr) throw routesErr;
      if (!routes?.length) return [];

      const routeIds = routes.map(r => r.id);
      const { data, error } = await supabase
        .from('purchases')
        .select('*')
        .in('route_id', routeIds)
        .order('purchased_at', { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });
}
