
-- Create table for private (post-purchase) full route description
CREATE TABLE IF NOT EXISTS public.route_private_details (
  route_id integer PRIMARY KEY,
  full_description text NOT NULL DEFAULT '',
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.route_private_details ENABLE ROW LEVEL SECURITY;

-- Owner (creator) can manage their own row
CREATE POLICY "Creators manage own route private details"
ON public.route_private_details
FOR ALL
TO authenticated
USING (
  EXISTS (SELECT 1 FROM public.routes r
          WHERE r.id = route_private_details.route_id
            AND r.user_id = auth.uid())
  OR public.has_role(auth.uid(), 'admin'::app_role)
)
WITH CHECK (
  EXISTS (SELECT 1 FROM public.routes r
          WHERE r.id = route_private_details.route_id
            AND r.user_id = auth.uid())
  OR public.has_role(auth.uid(), 'admin'::app_role)
);

-- Buyers can read once they purchased
CREATE POLICY "Buyers can read full description"
ON public.route_private_details
FOR SELECT
TO authenticated
USING (
  EXISTS (SELECT 1 FROM public.purchases p
          WHERE p.route_id = route_private_details.route_id
            AND p.user_id = auth.uid())
);

-- updated_at trigger
CREATE TRIGGER trg_route_private_details_updated_at
BEFORE UPDATE ON public.route_private_details
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Backfill: copy current routes.description into the new table for existing rows
INSERT INTO public.route_private_details (route_id, full_description)
SELECT id, COALESCE(description, '')
FROM public.routes
ON CONFLICT (route_id) DO NOTHING;

-- Truncate existing routes.description to public-summary length (3000)
UPDATE public.routes
SET description = LEFT(description, 3000)
WHERE length(description) > 3000;
