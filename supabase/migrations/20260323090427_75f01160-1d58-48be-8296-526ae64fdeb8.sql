
ALTER TABLE public.routes
  ADD COLUMN IF NOT EXISTS ai_assisted_note text;
