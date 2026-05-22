import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

export function useUnreadMessages() {
  const { user } = useAuth();

  return useQuery({
    queryKey: ['unread-messages-count', user?.id],
    enabled: !!user,
    refetchInterval: 30000, // poll every 30s
    queryFn: async () => {
      // Get user's conversations
      const { data: convs } = await supabase
        .from('conversations')
        .select('id')
        .eq('user_id', user!.id);

      if (!convs || convs.length === 0) return 0;

      const { count } = await supabase
        .from('messages')
        .select('id', { count: 'exact', head: true })
        .in('conversation_id', convs.map(c => c.id))
        .eq('is_read', false)
        .neq('sender_type', 'user');

      return count ?? 0;
    },
  });
}

export function useAdminUnreadMessages() {
  const { user, isAdmin } = useAuth();

  return useQuery({
    queryKey: ['admin-unread-messages-count'],
    enabled: !!user && isAdmin,
    refetchInterval: 30000,
    queryFn: async () => {
      const { count } = await supabase
        .from('messages')
        .select('id', { count: 'exact', head: true })
        .eq('is_read', false)
        .neq('sender_type', 'admin');

      return count ?? 0;
    },
  });
}
