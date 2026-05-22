
-- ============================================
-- GPX Marketplace Database Schema
-- ============================================

-- 1. User Roles
CREATE TYPE public.app_role AS ENUM ('admin', 'moderator', 'user', 'creator');

CREATE TABLE public.user_roles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    role app_role NOT NULL DEFAULT 'user',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (user_id, role)
);

ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role app_role)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role
  )
$$;

CREATE POLICY "Users can read own roles" ON public.user_roles
  FOR SELECT TO authenticated USING (auth.uid() = user_id);

CREATE POLICY "Admins can manage all roles" ON public.user_roles
  FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- 2. Profiles
CREATE TABLE public.profiles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL UNIQUE,
    display_name TEXT,
    avatar_url TEXT,
    bio TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Profiles are viewable by everyone" ON public.profiles FOR SELECT USING (true);
CREATE POLICY "Users can update own profile" ON public.profiles FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own profile" ON public.profiles FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Auto-create profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (user_id, display_name)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email));
  
  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, 'user');
  
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- 3. Categories
CREATE TABLE public.categories (
    id SERIAL PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    icon TEXT NOT NULL DEFAULT 'map',
    sort_order INT NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.categories ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Categories are public" ON public.categories FOR SELECT USING (true);
CREATE POLICY "Admins manage categories" ON public.categories FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- Seed categories
INSERT INTO public.categories (name, icon, sort_order) VALUES
  ('Hiking', 'mountain', 1),
  ('Cycling', 'bike', 2),
  ('Running', 'footprints', 3),
  ('Trail Running', 'trees', 4),
  ('Gravel', 'road', 5),
  ('Ski Touring', 'snowflake', 6),
  ('Kayaking', 'waves', 7),
  ('Off-road', 'car', 8);

-- 4. Routes
CREATE TABLE public.routes (
    id SERIAL PRIMARY KEY,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    title TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    price NUMERIC(10,2) NOT NULL DEFAULT 0,
    category_id INT REFERENCES public.categories(id),
    cover_image_key TEXT,
    gpx_file_key TEXT,
    pdf_file_key TEXT,
    location_string TEXT NOT NULL DEFAULT '',
    latitude DOUBLE PRECISION NOT NULL DEFAULT 0,
    longitude DOUBLE PRECISION NOT NULL DEFAULT 0,
    distance_km NUMERIC(8,2),
    elevation_gain_m INT,
    estimated_time_h NUMERIC(5,2),
    difficulty TEXT CHECK (difficulty IN ('easy', 'moderate', 'hard', 'expert')),
    surface_type TEXT,
    season TEXT,
    loop_type TEXT CHECK (loop_type IN ('loop', 'out-and-back', 'point-to-point')),
    start_point TEXT,
    end_point TEXT,
    status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'pending', 'published', 'rejected')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.routes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Published routes are public" ON public.routes
  FOR SELECT USING (status = 'published' OR auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Creators can insert routes" ON public.routes
  FOR INSERT TO authenticated WITH CHECK (
    auth.uid() = user_id AND (public.has_role(auth.uid(), 'creator') OR public.has_role(auth.uid(), 'admin'))
  );

CREATE POLICY "Creators can update own routes" ON public.routes
  FOR UPDATE TO authenticated USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can delete routes" ON public.routes
  FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'admin'));

CREATE INDEX idx_routes_category ON public.routes(category_id);
CREATE INDEX idx_routes_user ON public.routes(user_id);
CREATE INDEX idx_routes_status ON public.routes(status);

-- 5. Purchases
CREATE TABLE public.purchases (
    id SERIAL PRIMARY KEY,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    route_id INT REFERENCES public.routes(id) ON DELETE CASCADE NOT NULL,
    amount_paid NUMERIC(10,2) NOT NULL,
    stripe_payment_intent_id TEXT,
    purchased_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (user_id, route_id)
);

ALTER TABLE public.purchases ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own purchases" ON public.purchases
  FOR SELECT TO authenticated USING (auth.uid() = user_id);

CREATE POLICY "System can insert purchases" ON public.purchases
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Admins can view all purchases" ON public.purchases
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- 6. Ratings
CREATE TABLE public.ratings (
    id SERIAL PRIMARY KEY,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    route_id INT REFERENCES public.routes(id) ON DELETE CASCADE NOT NULL,
    score INT NOT NULL CHECK (score >= 1 AND score <= 5),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (user_id, route_id)
);

ALTER TABLE public.ratings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Ratings are public" ON public.ratings FOR SELECT USING (true);
CREATE POLICY "Users can rate" ON public.ratings FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own rating" ON public.ratings FOR UPDATE TO authenticated USING (auth.uid() = user_id);

-- 7. Comments
CREATE TABLE public.comments (
    id SERIAL PRIMARY KEY,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    route_id INT REFERENCES public.routes(id) ON DELETE CASCADE NOT NULL,
    content TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.comments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Comments are public" ON public.comments FOR SELECT USING (true);
CREATE POLICY "Users can comment" ON public.comments FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can delete own comments" ON public.comments FOR DELETE TO authenticated USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'));

-- 8. Creator Profiles
CREATE TABLE public.creator_profiles (
    id SERIAL PRIMARY KEY,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL UNIQUE,
    display_name TEXT NOT NULL,
    bio TEXT DEFAULT '',
    stripe_connect_account_id TEXT,
    stripe_onboarding_complete BOOLEAN DEFAULT false,
    total_earnings NUMERIC(10,2) DEFAULT 0,
    total_sales INT DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.creator_profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Creator profiles are public" ON public.creator_profiles FOR SELECT USING (true);
CREATE POLICY "Creators can update own profile" ON public.creator_profiles FOR UPDATE TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users can create own creator profile" ON public.creator_profiles FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

-- 9. Updated at trigger function
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER update_profiles_updated_at BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_routes_updated_at BEFORE UPDATE ON public.routes FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_creator_profiles_updated_at BEFORE UPDATE ON public.creator_profiles FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 10. Storage buckets
INSERT INTO storage.buckets (id, name, public) VALUES ('route-covers', 'route-covers', true);
INSERT INTO storage.buckets (id, name, public) VALUES ('gpx-files', 'gpx-files', false);
INSERT INTO storage.buckets (id, name, public) VALUES ('pdf-guides', 'pdf-guides', false);

-- Storage policies: covers are public
CREATE POLICY "Route covers are public" ON storage.objects FOR SELECT USING (bucket_id = 'route-covers');
CREATE POLICY "Creators can upload covers" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'route-covers' AND auth.uid()::text = (storage.foldername(name))[1]);
CREATE POLICY "Creators can update covers" ON storage.objects FOR UPDATE TO authenticated USING (bucket_id = 'route-covers' AND auth.uid()::text = (storage.foldername(name))[1]);
CREATE POLICY "Creators can delete covers" ON storage.objects FOR DELETE TO authenticated USING (bucket_id = 'route-covers' AND auth.uid()::text = (storage.foldername(name))[1]);

-- GPX files: only purchasers + owner
CREATE POLICY "GPX owners can manage" ON storage.objects FOR ALL TO authenticated USING (bucket_id = 'gpx-files' AND auth.uid()::text = (storage.foldername(name))[1]);
CREATE POLICY "GPX purchasers can download" ON storage.objects FOR SELECT TO authenticated USING (
  bucket_id = 'gpx-files' AND EXISTS (
    SELECT 1 FROM public.purchases p
    JOIN public.routes r ON r.id = p.route_id
    WHERE p.user_id = auth.uid() AND r.gpx_file_key = name
  )
);

-- PDF guides: same as GPX
CREATE POLICY "PDF owners can manage" ON storage.objects FOR ALL TO authenticated USING (bucket_id = 'pdf-guides' AND auth.uid()::text = (storage.foldername(name))[1]);
CREATE POLICY "PDF purchasers can download" ON storage.objects FOR SELECT TO authenticated USING (
  bucket_id = 'pdf-guides' AND EXISTS (
    SELECT 1 FROM public.purchases p
    JOIN public.routes r ON r.id = p.route_id
    WHERE p.user_id = auth.uid() AND r.pdf_file_key = name
  )
);
