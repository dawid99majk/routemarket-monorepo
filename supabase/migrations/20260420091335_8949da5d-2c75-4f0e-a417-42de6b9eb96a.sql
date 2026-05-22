-- 1. Generated content table
CREATE TABLE public.generated_content (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  created_by UUID NOT NULL,
  content_type TEXT NOT NULL CHECK (content_type IN ('text', 'image')),
  category TEXT NOT NULL,
  prompt TEXT NOT NULL,
  result_text TEXT,
  file_key TEXT,
  route_id INTEGER REFERENCES public.routes(id) ON DELETE SET NULL,
  language_code TEXT DEFAULT 'pl',
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_generated_content_created_by ON public.generated_content(created_by);
CREATE INDEX idx_generated_content_category ON public.generated_content(category);
CREATE INDEX idx_generated_content_created_at ON public.generated_content(created_at DESC);

ALTER TABLE public.generated_content ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage generated content"
  ON public.generated_content
  FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

CREATE TRIGGER update_generated_content_updated_at
  BEFORE UPDATE ON public.generated_content
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- 2. Marketing assets storage bucket (public)
INSERT INTO storage.buckets (id, name, public)
VALUES ('marketing-assets', 'marketing-assets', true)
ON CONFLICT (id) DO NOTHING;

-- 3. Storage RLS policies for marketing-assets
CREATE POLICY "Marketing assets are publicly readable"
  ON storage.objects
  FOR SELECT
  TO public
  USING (bucket_id = 'marketing-assets');

CREATE POLICY "Admins can upload marketing assets"
  ON storage.objects
  FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'marketing-assets' AND public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can update marketing assets"
  ON storage.objects
  FOR UPDATE
  TO authenticated
  USING (bucket_id = 'marketing-assets' AND public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can delete marketing assets"
  ON storage.objects
  FOR DELETE
  TO authenticated
  USING (bucket_id = 'marketing-assets' AND public.has_role(auth.uid(), 'admin'::app_role));