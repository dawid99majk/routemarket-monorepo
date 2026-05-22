
CREATE TABLE public.route_images (
  id integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  route_id integer NOT NULL REFERENCES public.routes(id) ON DELETE CASCADE,
  image_key text NOT NULL,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.route_images ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Route images are public" ON public.route_images
  FOR SELECT TO public USING (true);

CREATE POLICY "Creators can insert route images" ON public.route_images
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.routes WHERE routes.id = route_id AND routes.user_id = auth.uid())
  );

CREATE POLICY "Creators can delete own route images" ON public.route_images
  FOR DELETE TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.routes WHERE routes.id = route_id AND routes.user_id = auth.uid())
    OR has_role(auth.uid(), 'admin'::app_role)
  );
