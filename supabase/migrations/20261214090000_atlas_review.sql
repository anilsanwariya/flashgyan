-- Atlas review: place names whose Hindi the AI wrote are marked, like facts,
-- so the editor can check them in the Hindi review queue.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'atlas_places' AND column_name = 'hi_ai'
  ) THEN
    ALTER TABLE public.atlas_places ADD COLUMN hi_ai boolean NOT NULL DEFAULT false;
    -- The map labels' Hindi came from the AI (the master map has none);
    -- the editor's own edits are left alone.
    UPDATE public.atlas_places SET hi_ai = true WHERE NOT edited AND label_hi <> '';
  END IF;
END $$;
CREATE INDEX IF NOT EXISTS atlas_places_hi_ai_idx ON public.atlas_places (hi_ai) WHERE hi_ai;
CREATE INDEX IF NOT EXISTS atlas_facts_hi_ai_idx ON public.atlas_facts (hi_ai) WHERE hi_ai;
