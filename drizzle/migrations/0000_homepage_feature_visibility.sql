ALTER TABLE public.home_settings
  ADD COLUMN IF NOT EXISTS hide_flashcards boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS hide_mcq_practice boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS hide_mcq boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS hide_saathi boolean NOT NULL DEFAULT false;