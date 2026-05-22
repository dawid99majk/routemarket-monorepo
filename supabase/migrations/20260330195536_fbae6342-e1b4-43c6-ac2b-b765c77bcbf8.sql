
-- Fix Security Definer Views by setting them to SECURITY INVOKER
ALTER VIEW public.public_creator_profiles SET (security_invoker = on);
ALTER VIEW public.public_campaigns SET (security_invoker = on);

-- Add a public SELECT policy for campaigns via the view pattern
-- Public needs to read active campaigns for banners/highlights
CREATE POLICY "Public can read active campaigns"
  ON public.campaigns FOR SELECT TO public
  USING (status = 'active');
