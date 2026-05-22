
-- FIX 1: creator_profiles - restrict SELECT to own row + admins (sensitive Stripe data)
DROP POLICY IF EXISTS "Authenticated can view creator profiles" ON public.creator_profiles;

-- Users can see their own creator profile (full data)
CREATE POLICY "Users can view own creator profile"
  ON public.creator_profiles FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

-- Admins can see all
CREATE POLICY "Admins can view all creator profiles"
  ON public.creator_profiles FOR SELECT TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role));

-- For public display (route cards showing creator name), use the public_creator_profiles view
-- which already excludes sensitive columns. Add a public SELECT policy for it via the base table.
-- Actually, the view uses security_invoker so it needs its own base table access.
-- We need a policy that allows public to see only safe columns - use the view approach.
-- Grant anon/authenticated read on the view directly:
GRANT SELECT ON public.public_creator_profiles TO anon, authenticated;

-- FIX 2: Realtime messages - remove from realtime publication to prevent unauthorized subscriptions
-- Since there's no way to add RLS on realtime.messages via migration, remove the table from publication
ALTER PUBLICATION supabase_realtime DROP TABLE public.messages;

-- FIX 3: analytics_events - restrict user_id to own or null
DROP POLICY IF EXISTS "Authenticated can insert analytics events" ON public.analytics_events;
CREATE POLICY "Authenticated can insert analytics events"
  ON public.analytics_events FOR INSERT TO authenticated
  WITH CHECK (
    event_name IS NOT NULL 
    AND event_name <> '' 
    AND (user_id IS NULL OR user_id = auth.uid())
  );

-- FIX 4: route_pdfs - restrict SELECT to authenticated users who own or purchased the route
DROP POLICY IF EXISTS "Route PDFs are public" ON public.route_pdfs;
CREATE POLICY "Route PDFs visible to purchasers and owners"
  ON public.route_pdfs FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.routes r
      WHERE r.id = route_pdfs.route_id
      AND (r.user_id = auth.uid() OR has_role(auth.uid(), 'admin'::app_role))
    )
    OR
    EXISTS (
      SELECT 1 FROM public.purchases p
      WHERE p.route_id = route_pdfs.route_id AND p.user_id = auth.uid()
    )
  );

-- Also allow public to see just language_code (for PDF language flags on cards) via a function
CREATE OR REPLACE FUNCTION public.get_route_pdf_languages(route_ids integer[])
RETURNS TABLE(route_id integer, language_code text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = 'public'
AS $$
  SELECT rp.route_id, rp.language_code
  FROM public.route_pdfs rp
  WHERE rp.route_id = ANY(route_ids);
$$;
