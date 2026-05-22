
-- Create route_pdfs table for multi-language PDF uploads
CREATE TABLE public.route_pdfs (
  id integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  route_id integer NOT NULL REFERENCES public.routes(id) ON DELETE CASCADE,
  language_code text NOT NULL,
  file_key text NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE(route_id, language_code)
);

ALTER TABLE public.route_pdfs ENABLE ROW LEVEL SECURITY;

-- Public read
CREATE POLICY "Route PDFs are public" ON public.route_pdfs FOR SELECT TO public USING (true);

-- Creators can insert
CREATE POLICY "Creators can insert route PDFs" ON public.route_pdfs FOR INSERT TO authenticated
WITH CHECK (EXISTS (SELECT 1 FROM routes WHERE routes.id = route_pdfs.route_id AND routes.user_id = auth.uid()));

-- Creators can delete
CREATE POLICY "Creators can delete route PDFs" ON public.route_pdfs FOR DELETE TO authenticated
USING (EXISTS (SELECT 1 FROM routes WHERE routes.id = route_pdfs.route_id AND routes.user_id = auth.uid()) OR has_role(auth.uid(), 'admin'::app_role));

-- Creators can update
CREATE POLICY "Creators can update route PDFs" ON public.route_pdfs FOR UPDATE TO authenticated
USING (EXISTS (SELECT 1 FROM routes WHERE routes.id = route_pdfs.route_id AND routes.user_id = auth.uid()) OR has_role(auth.uid(), 'admin'::app_role));

-- Add primary_language to profiles
ALTER TABLE public.profiles ADD COLUMN primary_language text DEFAULT 'en';
