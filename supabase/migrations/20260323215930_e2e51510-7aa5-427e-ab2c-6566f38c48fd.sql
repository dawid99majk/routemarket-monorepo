
-- Add new columns to routes table for City category support
ALTER TABLE public.routes
  ADD COLUMN IF NOT EXISTS subcategory text DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS duration text DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS route_type text DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS audience jsonb DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS budget text DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS tags jsonb DEFAULT '[]'::jsonb;
