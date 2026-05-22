
CREATE TABLE public.route_translations (
  id integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  route_id integer NOT NULL REFERENCES public.routes(id) ON DELETE CASCADE,
  language_code text NOT NULL,
  title text NOT NULL,
  description text NOT NULL DEFAULT '',
  is_auto_translated boolean NOT NULL DEFAULT true,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE (route_id, language_code)
);

ALTER TABLE public.route_translations ENABLE ROW LEVEL SECURITY;

-- Public read
CREATE POLICY "Translations are public" ON public.route_translations
  FOR SELECT TO public USING (true);

-- Creators can insert/update translations for own routes
CREATE POLICY "Creators can insert translations" ON public.route_translations
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.routes WHERE routes.id = route_translations.route_id AND routes.user_id = auth.uid())
    OR has_role(auth.uid(), 'admin'::app_role)
  );

CREATE POLICY "Creators can update translations" ON public.route_translations
  FOR UPDATE TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.routes WHERE routes.id = route_translations.route_id AND routes.user_id = auth.uid())
    OR has_role(auth.uid(), 'admin'::app_role)
  );

CREATE POLICY "Creators can delete translations" ON public.route_translations
  FOR DELETE TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.routes WHERE routes.id = route_translations.route_id AND routes.user_id = auth.uid())
    OR has_role(auth.uid(), 'admin'::app_role)
  );

-- Service role insert for AI translations (edge function uses service role)
CREATE POLICY "Service can insert translations" ON public.route_translations
  FOR INSERT TO service_role
  WITH CHECK (true);

CREATE POLICY "Service can update translations" ON public.route_translations
  FOR UPDATE TO service_role
  USING (true);

-- Trigger for updated_at
CREATE TRIGGER update_route_translations_updated_at
  BEFORE UPDATE ON public.route_translations
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
