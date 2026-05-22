import React, { useEffect, useRef, useCallback, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { X, ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/contexts/AuthContext';

interface ActiveCampaign {
  id: string;
  name: string;
  target_url: string | null;
  target_route_id: number | null;
  priority: number;
  creatives: {
    headline: string;
    subheadline: string | null;
    cta_text: string | null;
    bg_color: string | null;
    text_color: string | null;
    image_key: string | null;
  } | null;
}

function useActiveBanners(lang: string) {
  return useQuery({
    queryKey: ['active-banners', lang],
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const { data: campaigns, error } = await supabase
        .from('public_campaigns' as any)
        .select('id, name, target_url, target_route_id, priority')
        .eq('placement', 'hero_banner')
        .order('priority', { ascending: false });
      if (error) throw error;
      if (!campaigns?.length) return [];

      const ids = campaigns.map((c: any) => c.id);
      const { data: creatives } = await supabase
        .from('campaign_creatives')
        .select('campaign_id, headline, subheadline, cta_text, bg_color, text_color, image_key')
        .in('campaign_id', ids);

      return (campaigns as any[]).map((c): ActiveCampaign => {
        const match = (creatives as any[])?.find(
          (cr) => cr.campaign_id === c.id && cr.language_code === lang
        ) ?? (creatives as any[])?.find(
          (cr) => cr.campaign_id === c.id && cr.language_code === 'en'
        ) ?? (creatives as any[])?.find(
          (cr) => cr.campaign_id === c.id
        ) ?? null;
        return { ...c, creatives: match };
      }).filter((c) => c.creatives !== null);
    },
  });
}

function trackCampaignEvent(campaignId: string, eventType: 'impression' | 'click' | 'dismiss', userId?: string) {
  supabase
    .from('campaign_events')
    .insert({
      campaign_id: campaignId,
      event_type: eventType,
      user_id: userId ?? null,
      metadata: {},
    } as any)
    .then(({ error }) => {
      if (error) console.warn('[campaign-event]', eventType, error.message);
    });
}

export default function CampaignBanner() {
  const { i18n } = useTranslation();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { data: banners = [], isLoading } = useActiveBanners(i18n.language);
  const [current, setCurrent] = useState(0);
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());
  const impressedRef = useRef<Set<string>>(new Set());

  const visibleBanners = banners.filter((b) => !dismissed.has(b.id));
  const activeBanner = visibleBanners[current % Math.max(1, visibleBanners.length)] ?? null;

  // Track impression once per banner per session
  useEffect(() => {
    if (!activeBanner || impressedRef.current.has(activeBanner.id)) return;
    impressedRef.current.add(activeBanner.id);
    trackCampaignEvent(activeBanner.id, 'impression', user?.id);
  }, [activeBanner?.id, user?.id]);

  // Auto-rotate every 8s
  useEffect(() => {
    if (visibleBanners.length <= 1) return;
    const t = setInterval(() => setCurrent((c) => c + 1), 8000);
    return () => clearInterval(t);
  }, [visibleBanners.length]);

  const handleClick = useCallback(() => {
    if (!activeBanner) return;
    trackCampaignEvent(activeBanner.id, 'click', user?.id);
    if (activeBanner.target_route_id) {
      navigate(`/route/${activeBanner.target_route_id}`);
    } else if (activeBanner.target_url) {
      window.open(activeBanner.target_url, '_blank', 'noopener');
    }
  }, [activeBanner, navigate, user?.id]);

  const handleDismiss = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    if (!activeBanner) return;
    trackCampaignEvent(activeBanner.id, 'dismiss', user?.id);
    setDismissed((prev) => new Set(prev).add(activeBanner.id));
  }, [activeBanner, user?.id]);

  if (isLoading || !activeBanner) return null;

  const cr = activeBanner.creatives!;
  const bgColor = cr.bg_color || 'hsl(var(--primary))';
  const textColor = cr.text_color || 'hsl(var(--primary-foreground))';

  return (
    <div
      className="relative overflow-hidden transition-all duration-500 ease-out"
      style={{ backgroundColor: bgColor, color: textColor }}
    >
      <div className="max-w-[1600px] mx-auto px-3 sm:px-6 lg:px-8 py-3 sm:py-4">
        <div className="flex items-center gap-3 sm:gap-4">
          {/* Navigation arrows */}
          {visibleBanners.length > 1 && (
            <button
              onClick={(e) => { e.stopPropagation(); setCurrent((c) => c - 1); }}
              className="shrink-0 p-1 rounded-full opacity-70 hover:opacity-100 transition-opacity"
              style={{ color: textColor }}
              aria-label="Previous banner"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
          )}

          {/* Content */}
          <div
            className="flex-1 flex flex-col sm:flex-row items-start sm:items-center gap-2 sm:gap-4 cursor-pointer min-w-0"
            onClick={handleClick}
            role="link"
          >
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-sm sm:text-base truncate leading-tight">
                {cr.headline}
              </p>
              {cr.subheadline && (
                <p className="text-xs sm:text-sm opacity-80 truncate mt-0.5">
                  {cr.subheadline}
                </p>
              )}
            </div>
            {cr.cta_text && (
              <Button
                size="sm"
                variant="secondary"
                className="shrink-0 text-xs font-medium h-8 px-4 rounded-full"
                onClick={handleClick}
                tabIndex={-1}
              >
                {cr.cta_text}
              </Button>
            )}
          </div>

          {/* Navigation arrows right */}
          {visibleBanners.length > 1 && (
            <button
              onClick={(e) => { e.stopPropagation(); setCurrent((c) => c + 1); }}
              className="shrink-0 p-1 rounded-full opacity-70 hover:opacity-100 transition-opacity"
              style={{ color: textColor }}
              aria-label="Next banner"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          )}

          {/* Dismiss */}
          <button
            onClick={handleDismiss}
            className="shrink-0 p-1 rounded-full opacity-60 hover:opacity-100 transition-opacity"
            style={{ color: textColor }}
            aria-label="Dismiss banner"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Dots indicator */}
        {visibleBanners.length > 1 && (
          <div className="flex justify-center gap-1.5 mt-2">
            {visibleBanners.map((b, i) => (
              <button
                key={b.id}
                onClick={(e) => { e.stopPropagation(); setCurrent(i); }}
                className="w-1.5 h-1.5 rounded-full transition-all duration-300"
                style={{
                  backgroundColor: textColor,
                  opacity: (current % visibleBanners.length) === i ? 1 : 0.35,
                  transform: (current % visibleBanners.length) === i ? 'scale(1.3)' : 'scale(1)',
                }}
                aria-label={`Banner ${i + 1}`}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
