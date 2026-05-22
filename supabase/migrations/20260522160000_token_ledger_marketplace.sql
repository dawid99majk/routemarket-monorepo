-- Migration: Token Ledger and Marketplace Publish
-- Path: supabase/migrations/20260522160000_token_ledger_marketplace.sql

-- 1. Create token_transactions table for precise accounting
CREATE TABLE IF NOT EXISTS public.token_transactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) NOT NULL,
    type TEXT NOT NULL CHECK (type IN ('purchase', 'bonus', 'earned', 'spend', 'payout')),
    amount INTEGER NOT NULL,
    source TEXT NOT NULL, -- e.g., 'stripe', 'system_bonus', 'route_sale'
    related_route_id TEXT, -- project slug or route ID
    counterparty_user_id UUID REFERENCES auth.users(id), -- for sales
    is_withdrawable BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 2. Add earned_tokens and bonus_tokens to profiles
ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS bonus_tokens INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS earned_tokens INTEGER DEFAULT 0;

-- 3. Update RLS for token_transactions
ALTER TABLE public.token_transactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own transactions" 
ON public.token_transactions FOR SELECT 
TO authenticated 
USING (auth.uid() = user_id);

-- 4. Marketplace Routes Table Extension (if needed)
-- Assuming public.routes already exists, adding publish_mode
ALTER TABLE public.routes 
ADD COLUMN IF NOT EXISTS publish_mode TEXT DEFAULT 'private' CHECK (publish_mode IN ('private', 'unlisted', 'public_free_preview', 'public_paid')),
ADD COLUMN IF NOT EXISTS token_price INTEGER DEFAULT 5,
ADD COLUMN IF NOT EXISTS is_ai_assisted BOOLEAN DEFAULT TRUE;

-- 5. Trigger to update balance on transaction
CREATE OR REPLACE FUNCTION public.update_profile_balance_from_transaction()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.type = 'earned' THEN
        UPDATE public.profiles SET earned_tokens = earned_tokens + NEW.amount WHERE user_id = NEW.user_id;
    ELSIF NEW.type = 'bonus' THEN
        UPDATE public.profiles SET bonus_tokens = bonus_tokens + NEW.amount WHERE user_id = NEW.user_id;
    ELSIF NEW.type = 'spend' THEN
        -- Logic to spend bonus first, then earned, then paid tokens can be complex, 
        -- but for now we just decrement a general balance or specific columns.
        NULL;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
