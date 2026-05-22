
CREATE TABLE public.purchase_consents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  route_id integer NOT NULL REFERENCES public.routes(id),
  consent_version text NOT NULL DEFAULT '1.0',
  accepted_at timestamptz NOT NULL DEFAULT now(),
  ip_hash text,
  user_agent text,
  declarations jsonb NOT NULL
);

ALTER TABLE public.purchase_consents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can insert own consents"
  ON public.purchase_consents FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can view own consents"
  ON public.purchase_consents FOR SELECT TO authenticated
  USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'::app_role));
