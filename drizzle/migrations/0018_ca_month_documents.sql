-- Official documents for the monthly magazine (government reports, gazettes,
-- surveys): read into new stories filed under the date they are about,
-- additions to the month's stories for the editor to approve, corrections,
-- and a "Reports & documents of the month" page.
ALTER TABLE public.ca_sources
  -- The month it was added for (no day of its own, so no daily page reads it).
  ADD COLUMN IF NOT EXISTS doc_month date,
  -- The date it was released or is about: new stories are filed under it.
  ADD COLUMN IF NOT EXISTS doc_date date,
  -- What to read in a long document ("chapters 3 and 5"), when given.
  ADD COLUMN IF NOT EXISTS doc_focus text,
  -- From the government (an official document, or an official website).
  ADD COLUMN IF NOT EXISTS official boolean NOT NULL DEFAULT false,
  -- A report's findings gathered part by part, for its page.
  ADD COLUMN IF NOT EXISTS doc_notes jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS doc_lock timestamptz;
ALTER TABLE public.ca_sources DROP CONSTRAINT IF EXISTS ca_sources_day_or_magazine;
DO $$ BEGIN
  ALTER TABLE public.ca_sources
    ADD CONSTRAINT ca_sources_day_magazine_or_month
    CHECK (issue_date IS NOT NULL OR magazine_id IS NOT NULL OR doc_month IS NOT NULL);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
CREATE INDEX IF NOT EXISTS ca_sources_doc_month_idx ON public.ca_sources (doc_month);

-- Stories made from an official document.
ALTER TABLE public.ca_items ADD COLUMN IF NOT EXISTS from_document boolean NOT NULL DEFAULT false;

-- Government websites: their stories show the source as official.
ALTER TABLE public.ca_watch_sites ADD COLUMN IF NOT EXISTS official boolean NOT NULL DEFAULT false;

-- New facts a document gives a story already written, waiting for the editor.
CREATE TABLE IF NOT EXISTS public.ca_doc_additions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  month date NOT NULL,
  source_id uuid NOT NULL REFERENCES public.ca_sources (id) ON DELETE CASCADE,
  item_id uuid NOT NULL REFERENCES public.ca_items (id) ON DELETE CASCADE,
  facts jsonb NOT NULL DEFAULT '[]'::jsonb,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  decided_at timestamptz,
  UNIQUE (source_id, item_id)
);
CREATE INDEX IF NOT EXISTS ca_doc_additions_month_idx ON public.ca_doc_additions (month, status);
GRANT ALL ON public.ca_doc_additions TO service_role;
ALTER TABLE public.ca_doc_additions ENABLE ROW LEVEL SECURITY;
