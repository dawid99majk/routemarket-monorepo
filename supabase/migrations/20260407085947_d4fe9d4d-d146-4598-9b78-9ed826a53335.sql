CREATE TABLE public.route_pois (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  route_id integer NOT NULL REFERENCES public.routes(id) ON DELETE CASCADE,
  name text NOT NULL,
  type text NOT NULL DEFAULT 'other',
  lat double precision NOT NULL,
  lng double precision NOT NULL,
  description text NOT NULL DEFAULT '',
  fun_fact text,
  photo_keys jsonb DEFAULT '[]'::jsonb,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.route_pois ENABLE ROW LEVEL SECURITY;

CREATE POLICY "POIs are public for published routes" ON public.route_pois
  FOR SELECT TO public
  USING (EXISTS (SELECT 1 FROM public.routes WHERE routes.id = route_pois.route_id AND routes.status = 'published'));

CREATE POLICY "Creators can manage own route POIs" ON public.route_pois
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.routes WHERE routes.id = route_pois.route_id AND routes.user_id = auth.uid()) OR has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (EXISTS (SELECT 1 FROM public.routes WHERE routes.id = route_pois.route_id AND routes.user_id = auth.uid()) OR has_role(auth.uid(), 'admin'::app_role));

CREATE TABLE public.route_tips (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  route_id integer NOT NULL REFERENCES public.routes(id) ON DELETE CASCADE,
  category text NOT NULL,
  content text NOT NULL DEFAULT '',
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.route_tips ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Tips are public for published routes" ON public.route_tips
  FOR SELECT TO public
  USING (EXISTS (SELECT 1 FROM public.routes WHERE routes.id = route_tips.route_id AND routes.status = 'published'));

CREATE POLICY "Creators can manage own route tips" ON public.route_tips
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.routes WHERE routes.id = route_tips.route_id AND routes.user_id = auth.uid()) OR has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (EXISTS (SELECT 1 FROM public.routes WHERE routes.id = route_tips.route_id AND routes.user_id = auth.uid()) OR has_role(auth.uid(), 'admin'::app_role));

CREATE TABLE public.route_recommendations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  route_id integer NOT NULL REFERENCES public.routes(id) ON DELETE CASCADE,
  name text NOT NULL,
  description text DEFAULT '',
  what_to_order text DEFAULT '',
  price_range text DEFAULT 'mid-range',
  photo_key text,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.route_recommendations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Recommendations are public for published routes" ON public.route_recommendations
  FOR SELECT TO public
  USING (EXISTS (SELECT 1 FROM public.routes WHERE routes.id = route_recommendations.route_id AND routes.status = 'published'));

CREATE POLICY "Creators can manage own route recommendations" ON public.route_recommendations
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.routes WHERE routes.id = route_recommendations.route_id AND routes.user_id = auth.uid()) OR has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (EXISTS (SELECT 1 FROM public.routes WHERE routes.id = route_recommendations.route_id AND routes.user_id = auth.uid()) OR has_role(auth.uid(), 'admin'::app_role));

INSERT INTO storage.buckets (id, name, public) VALUES ('poi-images', 'poi-images', true);

CREATE POLICY "Anyone can view poi images" ON storage.objects
  FOR SELECT TO public
  USING (bucket_id = 'poi-images');

CREATE POLICY "Authenticated users can upload poi images" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'poi-images');

CREATE POLICY "Users can delete own poi images" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'poi-images' AND (storage.foldername(name))[1] = auth.uid()::text);