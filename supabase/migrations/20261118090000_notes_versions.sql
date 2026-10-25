-- Earlier versions of a topic's notes (kept before the AI writes anything
-- and now and then while the editor works), newest first.
ALTER TABLE public.notes_drafts
  ADD COLUMN IF NOT EXISTS versions jsonb NOT NULL DEFAULT '[]'::jsonb;
