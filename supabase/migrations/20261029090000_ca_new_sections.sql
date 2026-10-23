-- New sections (Schemes, Policies & Reports; Persons in News; Places in
-- News): stories keep the blueprint type they were read as, which decides
-- their section and how they print (a scheme's fact card).
ALTER TABLE public.ca_items ADD COLUMN IF NOT EXISTS story_type text;

-- Material's new facts and corrections for a custom magazine's stories too:
-- a suggestion belongs to a month (official documents) or a magazine.
ALTER TABLE public.ca_doc_additions ALTER COLUMN month DROP NOT NULL;
ALTER TABLE public.ca_doc_additions
  ADD COLUMN IF NOT EXISTS magazine_id uuid REFERENCES public.ca_mags (id) ON DELETE CASCADE,
  -- "facts": new key points; "correction": figures the material states
  -- differently (changes, as on the corrections list).
  ADD COLUMN IF NOT EXISTS kind text NOT NULL DEFAULT 'facts',
  ADD COLUMN IF NOT EXISTS changes jsonb NOT NULL DEFAULT '[]'::jsonb,
  -- Approved for the daily story too (a custom magazine's copy).
  ADD COLUMN IF NOT EXISTS also_daily boolean NOT NULL DEFAULT false;
DO $$ BEGIN
  ALTER TABLE public.ca_doc_additions
    ADD CONSTRAINT ca_doc_additions_kind CHECK (kind IN ('facts', 'correction'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
ALTER TABLE public.ca_doc_additions DROP CONSTRAINT IF EXISTS ca_doc_additions_source_id_item_id_key;
DO $$ BEGIN
  ALTER TABLE public.ca_doc_additions
    ADD CONSTRAINT ca_doc_additions_source_item_kind UNIQUE (source_id, item_id, kind);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
CREATE INDEX IF NOT EXISTS ca_doc_additions_magazine_idx ON public.ca_doc_additions (magazine_id, status);
