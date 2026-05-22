import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export type CampaignStatus = 'draft' | 'scheduled' | 'active' | 'paused' | 'ended';
export type CampaignPlacement = 'hero_banner' | 'card_highlight' | 'sidebar' | 'category_bar' | 'checkout';

export interface Campaign {
  id: string;
  name: string;
  description: string;
  status: CampaignStatus;
  placement: CampaignPlacement;
  start_date: string | null;
  end_date: string | null;
  target_url: string | null;
  target_route_id: number | null;
  target_category_id: number | null;
  priority: number;
  is_internal: boolean;
  budget_cents: number | null;
  created_by: string;
  created_at: string;
  updated_at: string;
}

export interface CampaignCreative {
  id: string;
  campaign_id: string;
  language_code: string;
  headline: string;
  subheadline: string | null;
  cta_text: string | null;
  image_key: string | null;
  bg_color: string | null;
  text_color: string | null;
  created_at: string;
}

export interface CampaignFormData {
  name: string;
  description?: string;
  status?: CampaignStatus;
  placement: CampaignPlacement;
  start_date?: string | null;
  end_date?: string | null;
  target_url?: string | null;
  target_route_id?: number | null;
  target_category_id?: number | null;
  priority?: number;
  is_internal?: boolean;
  budget_cents?: number | null;
}

export function useCampaigns() {
  return useQuery({
    queryKey: ['admin-campaigns'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('campaigns' as any)
        .select('*')
        .order('updated_at', { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as Campaign[];
    },
  });
}

export function useCampaignById(id: string | undefined) {
  return useQuery({
    queryKey: ['admin-campaign', id],
    enabled: !!id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('campaigns' as any)
        .select('*')
        .eq('id', id!)
        .single();
      if (error) throw error;
      return data as unknown as Campaign;
    },
  });
}

export function useCampaignCreatives(campaignId: string | undefined) {
  return useQuery({
    queryKey: ['campaign-creatives', campaignId],
    enabled: !!campaignId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('campaign_creatives' as any)
        .select('*')
        .eq('campaign_id', campaignId!);
      if (error) throw error;
      return (data ?? []) as unknown as CampaignCreative[];
    },
  });
}

export function useCreateCampaign() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (form: CampaignFormData) => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('Not authenticated');
      const { data, error } = await supabase
        .from('campaigns' as any)
        .insert({ ...form, created_by: session.user.id } as any)
        .select()
        .single();
      if (error) throw error;
      return data as unknown as Campaign;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-campaigns'] });
      toast.success('Campaign created');
    },
    onError: (e) => toast.error(String(e)),
  });
}

export function useUpdateCampaign() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...form }: CampaignFormData & { id: string }) => {
      const { data, error } = await supabase
        .from('campaigns' as any)
        .update(form as any)
        .eq('id', id)
        .select()
        .single();
      if (error) throw error;
      return data as unknown as Campaign;
    },
    onSuccess: (d) => {
      qc.invalidateQueries({ queryKey: ['admin-campaigns'] });
      qc.invalidateQueries({ queryKey: ['admin-campaign', d.id] });
      toast.success('Campaign updated');
    },
    onError: (e) => toast.error(String(e)),
  });
}

export function useDeleteCampaign() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('campaigns' as any)
        .delete()
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-campaigns'] });
      toast.success('Campaign deleted');
    },
    onError: (e) => toast.error(String(e)),
  });
}

export function useUpsertCreative() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (creative: Omit<CampaignCreative, 'id' | 'created_at'> & { id?: string }) => {
      const { data, error } = await supabase
        .from('campaign_creatives' as any)
        .upsert(creative as any, { onConflict: 'id' })
        .select()
        .single();
      if (error) throw error;
      return data as unknown as CampaignCreative;
    },
    onSuccess: (d) => {
      qc.invalidateQueries({ queryKey: ['campaign-creatives', d.campaign_id] });
      toast.success('Creative saved');
    },
    onError: (e) => toast.error(String(e)),
  });
}

export function useCampaignStats(campaignId: string | undefined) {
  return useQuery({
    queryKey: ['campaign-stats', campaignId],
    enabled: !!campaignId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('campaign_events' as any)
        .select('event_type')
        .eq('campaign_id', campaignId!);
      if (error) throw error;
      const events = (data ?? []) as unknown as { event_type: string }[];
      return {
        impressions: events.filter(e => e.event_type === 'impression').length,
        clicks: events.filter(e => e.event_type === 'click').length,
        dismissals: events.filter(e => e.event_type === 'dismiss').length,
        ctr: events.length > 0
          ? (events.filter(e => e.event_type === 'click').length /
             Math.max(1, events.filter(e => e.event_type === 'impression').length) * 100).toFixed(1)
          : '0.0',
      };
    },
  });
}
