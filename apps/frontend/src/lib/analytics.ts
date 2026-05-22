import { supabase } from '@/integrations/supabase/client';

export type AnalyticsEvent =
  | 'route_view'
  | 'checkout_started'
  | 'consent_gate_opened'
  | 'consent_gate_accepted'
  | 'checkout_completed'
  | 'publish_attempted'
  | 'publish_blocked_missing_declarations'
  | 'route_published'
  | 'route_updated'
  | 'guide_opened'
  | 'guide_completed'
  | 'guide_shared'
  | 'guide_helpfulness_submitted';

interface TrackParams {
  event: AnalyticsEvent;
  routeId?: number;
  userId?: string;
  metadata?: Record<string, unknown>;
}

/**
 * Fire-and-forget analytics event.
 * Never throws — failures are silently logged to console.
 */
export function trackEvent({ event, routeId, userId, metadata }: TrackParams) {
  supabase
    .from('analytics_events' as any)
    .insert({
      event_name: event,
      route_id: routeId ?? null,
      user_id: userId ?? null,
      metadata: metadata ?? {},
    } as any)
    .then(({ error }: { error: any }) => {
      if (error) console.warn('[analytics]', event, error.message);
    });
}
