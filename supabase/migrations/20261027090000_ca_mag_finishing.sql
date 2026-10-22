-- Custom magazines, step 4: material and websites of its own, a background
-- article for each section, and posting to Telegram.
ALTER TABLE public.ca_mags
  -- Each section's background article (from the knowledge base), by id.
  ADD COLUMN IF NOT EXISTS features jsonb NOT NULL DEFAULT '{}'::jsonb,
  -- The websites collected for it (from the watched websites).
  ADD COLUMN IF NOT EXISTS site_ids uuid[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS posted_at timestamptz,
  ADD COLUMN IF NOT EXISTS post_error text;

-- Material uploaded for one magazine: a source without a day of its own (so
-- no daily issue reads it), with the date it is about.
ALTER TABLE public.ca_sources ALTER COLUMN issue_date DROP NOT NULL;
ALTER TABLE public.ca_sources
  ADD COLUMN IF NOT EXISTS magazine_id uuid REFERENCES public.ca_mags (id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS mag_date date;
DO $$ BEGIN
  ALTER TABLE public.ca_sources
    ADD CONSTRAINT ca_sources_day_or_magazine CHECK (issue_date IS NOT NULL OR magazine_id IS NOT NULL);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
CREATE INDEX IF NOT EXISTS ca_sources_magazine_idx ON public.ca_sources (magazine_id);
