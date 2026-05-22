
-- Remove the authenticated INSERT policy that allows payment bypass
DROP POLICY IF EXISTS "System can insert purchases" ON public.purchases;

-- Only service_role should insert purchases (via edge functions)
-- No authenticated INSERT policy needed
