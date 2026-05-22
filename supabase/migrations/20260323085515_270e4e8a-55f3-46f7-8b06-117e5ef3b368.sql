
-- 1. Add new columns to routes
ALTER TABLE public.routes
  ADD COLUMN IF NOT EXISTS ai_assisted boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS ai_assisted_scope text,
  ADD COLUMN IF NOT EXISTS last_verified_at timestamptz,
  ADD COLUMN IF NOT EXISTS risk_level text DEFAULT 'unknown',
  ADD COLUMN IF NOT EXISTS known_hazards jsonb DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS required_equipment jsonb DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS data_confidence text DEFAULT 'unverified';

-- 2. Create buyer_risk_acknowledgements table
CREATE TABLE public.buyer_risk_acknowledgements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  route_id integer NOT NULL REFERENCES public.routes(id),
  acknowledgement_version text NOT NULL DEFAULT '1.0',
  acknowledged_at timestamptz NOT NULL DEFAULT now(),
  risk_level text,
  declarations jsonb NOT NULL,
  user_agent text,
  ip_hash text
);

ALTER TABLE public.buyer_risk_acknowledgements ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can insert own risk acks"
  ON public.buyer_risk_acknowledgements FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users and admins can view risk acks"
  ON public.buyer_risk_acknowledgements FOR SELECT TO authenticated
  USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'::app_role));

-- 3. Create legal_documents table
CREATE TABLE public.legal_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  doc_type text NOT NULL,
  version text NOT NULL,
  content_hash text NOT NULL,
  published_at timestamptz NOT NULL DEFAULT now(),
  title text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (doc_type, version)
);

ALTER TABLE public.legal_documents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Legal documents are public"
  ON public.legal_documents FOR SELECT TO public
  USING (true);

CREATE POLICY "Admins can manage legal documents"
  ON public.legal_documents FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role));

-- 4. Seed initial legal documents from existing meta
INSERT INTO public.legal_documents (doc_type, version, content_hash, published_at, title) VALUES
  ('terms', '1.0.0', 'sha256-terms-v1-a3b2c1', '2026-03-22', 'Regulamin'),
  ('privacy', '1.0.0', 'sha256-privacy-v1-d4e5f6', '2026-03-22', 'Polityka prywatności'),
  ('cookies', '1.0.0', 'sha256-cookies-v1-g7h8i9', '2026-03-22', 'Polityka cookies'),
  ('refunds', '1.0.0', 'sha256-refunds-v1-j0k1l2', '2026-03-22', 'Zwroty i reklamacje');
