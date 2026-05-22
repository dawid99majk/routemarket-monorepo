
CREATE TABLE public.creator_declarations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  route_id integer NOT NULL REFERENCES public.routes(id) ON DELETE CASCADE,
  declarations jsonb NOT NULL,
  terms_version text NOT NULL DEFAULT '1.0',
  accepted_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.creator_declarations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can insert own declarations"
  ON public.creator_declarations FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can view own declarations"
  ON public.creator_declarations FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'::app_role));
