-- Migration: Support for Route Creator Credits and Downloader Tokens
-- Path: supabase/migrations/20260521150000_route_tokens_credits.sql

-- 1. Add credit_balance and token_balance columns to public.profiles
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS credit_balance INT NOT NULL DEFAULT 100;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS token_balance INT NOT NULL DEFAULT 0;

-- 2. Create public.credit_transactions table to log credit changes
CREATE TABLE IF NOT EXISTS public.credit_transactions (
    id SERIAL PRIMARY KEY,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    amount INT NOT NULL, -- positive for credits purchased/bonus, negative for spent on generation
    purpose TEXT NOT NULL, -- 'signup_bonus', 'route_creation', 'route_deep_research', 'topup'
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 3. Create public.token_transactions table to log token changes (purchases, commission, withdrawals)
CREATE TABLE IF NOT EXISTS public.token_transactions (
    id SERIAL PRIMARY KEY,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    amount INT NOT NULL, -- positive for purchased/earned from downloads, negative for spent on route download
    purpose TEXT NOT NULL, -- 'topup', 'route_download', 'route_download_earning', 'withdrawal'
    route_id INT REFERENCES public.routes(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 4. Enable Row Level Security (RLS)
ALTER TABLE public.credit_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.token_transactions ENABLE ROW LEVEL SECURITY;

-- 5. Create RLS Policies
CREATE POLICY "Users can view own credit transactions" 
    ON public.credit_transactions FOR SELECT 
    TO authenticated 
    USING (auth.uid() = user_id);

CREATE POLICY "Users can view own token transactions" 
    ON public.token_transactions FOR SELECT 
    TO authenticated 
    USING (auth.uid() = user_id);

-- System or admin policies
CREATE POLICY "Admins can view all credit transactions" 
    ON public.credit_transactions FOR SELECT 
    TO authenticated 
    USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can view all token transactions" 
    ON public.token_transactions FOR SELECT 
    TO authenticated 
    USING (public.has_role(auth.uid(), 'admin'));

-- Allow insert by authenticated users for self-spending/purchases (will be validated in frontend/edge function)
CREATE POLICY "Users can insert own credit transactions" 
    ON public.credit_transactions FOR INSERT 
    TO authenticated 
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can insert own token transactions" 
    ON public.token_transactions FOR INSERT 
    TO authenticated 
    WITH CHECK (auth.uid() = user_id);

-- 6. Modify handle_new_user() trigger function to log the 100 credits signup bonus
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  -- Insert into profiles with defaults (credit_balance=100, token_balance=0)
  INSERT INTO public.profiles (user_id, display_name, credit_balance, token_balance)
  VALUES (
    NEW.id, 
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email),
    100,
    0
  );
  
  -- Insert credit transaction log for +100 signup bonus
  INSERT INTO public.credit_transactions (user_id, amount, purpose)
  VALUES (NEW.id, 100, 'signup_bonus');
  
  -- Auto assign default 'user' role
  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, 'user');
  
  RETURN NEW;
END;
$$;

-- 7. Backfill existing profiles to ensure credit_balance is at least 100 and log initial transaction if empty
UPDATE public.profiles SET credit_balance = 100 WHERE credit_balance IS NULL;
UPDATE public.profiles SET token_balance = 0 WHERE token_balance IS NULL;

-- Log initial transaction for existing users who do not have one
INSERT INTO public.credit_transactions (user_id, amount, purpose)
SELECT user_id, 100, 'signup_bonus' 
FROM public.profiles p
WHERE NOT EXISTS (
    SELECT 1 FROM public.credit_transactions ct WHERE ct.user_id = p.user_id AND ct.purpose = 'signup_bonus'
);
