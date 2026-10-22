-- Custom magazines: material, websites, section background articles and posting.
ALTER TABLE public.ca_mags
  ADD COLUMN IF NOT EXISTS features jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS site_ids uuid[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS posted_at timestamptz,
  ADD COLUMN IF NOT EXISTS post_error text;
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