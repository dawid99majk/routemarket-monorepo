
-- FIX: Remove public SELECT on campaigns table (use public_campaigns view instead)
DROP POLICY IF EXISTS "Public can read active campaigns" ON public.campaigns;

-- Grant view access to anon for the safe public_campaigns view
GRANT SELECT ON public.public_campaigns TO anon, authenticated;
