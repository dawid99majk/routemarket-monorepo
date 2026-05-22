
-- Campaign status type
CREATE TYPE public.campaign_status AS ENUM ('draft', 'scheduled', 'active', 'paused', 'ended');

-- Campaign placement slots
CREATE TYPE public.campaign_placement AS ENUM ('hero_banner', 'card_highlight', 'sidebar', 'category_bar', 'checkout');

-- Main campaigns table
CREATE TABLE public.campaigns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  description text DEFAULT '',
  status campaign_status NOT NULL DEFAULT 'draft',
  placement campaign_placement NOT NULL DEFAULT 'hero_banner',
  start_date timestamp with time zone,
  end_date timestamp with time zone,
  target_url text,
  target_route_id integer REFERENCES public.routes(id) ON DELETE SET NULL,
  target_category_id integer REFERENCES public.categories(id) ON DELETE SET NULL,
  priority integer NOT NULL DEFAULT 0,
  is_internal boolean NOT NULL DEFAULT true,
  budget_cents integer,
  created_by uuid NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Campaign creatives (images/text per language)
CREATE TABLE public.campaign_creatives (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id uuid NOT NULL REFERENCES public.campaigns(id) ON DELETE CASCADE,
  language_code text NOT NULL DEFAULT 'en',
  headline text NOT NULL,
  subheadline text,
  cta_text text,
  image_key text,
  bg_color text,
  text_color text,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Campaign events (impressions/clicks tracked via analytics_events pattern)
CREATE TABLE public.campaign_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id uuid NOT NULL REFERENCES public.campaigns(id) ON DELETE CASCADE,
  event_type text NOT NULL, -- 'impression', 'click', 'dismiss'
  user_id uuid,
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX idx_campaigns_status ON public.campaigns(status);
CREATE INDEX idx_campaigns_dates ON public.campaigns(start_date, end_date);
CREATE INDEX idx_campaign_creatives_campaign ON public.campaign_creatives(campaign_id);
CREATE INDEX idx_campaign_events_campaign ON public.campaign_events(campaign_id);
CREATE INDEX idx_campaign_events_type ON public.campaign_events(event_type);

-- Enable RLS
ALTER TABLE public.campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.campaign_creatives ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.campaign_events ENABLE ROW LEVEL SECURITY;

-- Campaigns: admins full access, public can read active
CREATE POLICY "Admins can manage campaigns" ON public.campaigns FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Active campaigns are public" ON public.campaigns FOR SELECT TO public
  USING (status = 'active');

-- Creatives: admins full access, public can read for active campaigns
CREATE POLICY "Admins can manage creatives" ON public.campaign_creatives FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Creatives for active campaigns are public" ON public.campaign_creatives FOR SELECT TO public
  USING (EXISTS (SELECT 1 FROM public.campaigns c WHERE c.id = campaign_id AND c.status = 'active'));

-- Events: anyone can insert, admins can read
CREATE POLICY "Anyone can log campaign events" ON public.campaign_events FOR INSERT TO public
  WITH CHECK (true);

CREATE POLICY "Admins can read campaign events" ON public.campaign_events FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- Auto-update updated_at
CREATE TRIGGER update_campaigns_updated_at
  BEFORE UPDATE ON public.campaigns
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
