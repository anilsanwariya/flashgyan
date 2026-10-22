-- Custom magazines: a theme over any date range (six months of Science &
-- Technology, July's sports…), with sections and subsections the AI decides.
-- It is filled from the daily stories (and grows as more arrive) until it
-- is marked final. Its stories are copies, so editing them never changes
-- the daily archive.
CREATE TABLE IF NOT EXISTS public.ca_mags (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title_en text NOT NULL,
  title_hi text NOT NULL DEFAULT '',
  -- What the magazine is about, in the editor's words.
  theme text NOT NULL,
  date_from date NOT NULL,
  date_to date NOT NULL,
  status text NOT NULL DEFAULT 'growing' CHECK (status IN ('growing', 'final')),
  -- [{id, en, hi, subs: [{id, en, hi}]}], in print order.
  sections jsonb NOT NULL DEFAULT '[]'::jsonb,
  -- The cover and ads (same shape as a monthly issue's design).
  design jsonb,
  pdf_url_en text,
  pdf_url_hi text,
  pdf_at timestamptz,
  error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  finalized_at timestamptz,
  CHECK (date_from <= date_to)
);
GRANT ALL ON public.ca_mags TO service_role;
ALTER TABLE public.ca_mags ENABLE ROW LEVEL SECURITY;

-- The daily stories each magazine has looked at (fitting or not), so each
-- is judged once.
CREATE TABLE IF NOT EXISTS public.ca_mag_seen (
  mag_id uuid NOT NULL REFERENCES public.ca_mags (id) ON DELETE CASCADE,
  item_id uuid NOT NULL REFERENCES public.ca_items (id) ON DELETE CASCADE,
  fits boolean NOT NULL DEFAULT false,
  PRIMARY KEY (mag_id, item_id)
);
GRANT ALL ON public.ca_mag_seen TO service_role;
ALTER TABLE public.ca_mag_seen ENABLE ROW LEVEL SECURITY;

-- A magazine's copy of a story is a story row without a day of its own
-- (so no daily or monthly issue ever lists it), with the day it came from.
ALTER TABLE public.ca_items ALTER COLUMN issue_date DROP NOT NULL;
ALTER TABLE public.ca_items
  ADD COLUMN IF NOT EXISTS magazine_id uuid REFERENCES public.ca_mags (id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS mag_date date,
  ADD COLUMN IF NOT EXISTS origin_id uuid REFERENCES public.ca_items (id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS mag_section text,
  ADD COLUMN IF NOT EXISTS mag_sub text,
  -- Placed by the editor: the AI leaves it where it is.
  ADD COLUMN IF NOT EXISTS mag_pinned boolean NOT NULL DEFAULT false;
DO $$ BEGIN
  ALTER TABLE public.ca_items
    ADD CONSTRAINT ca_items_day_or_magazine CHECK (issue_date IS NOT NULL OR magazine_id IS NOT NULL);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
CREATE INDEX IF NOT EXISTS ca_items_magazine_idx ON public.ca_items (magazine_id);
