-- Infographics: earlier versions of a card (before an AI rewrite of one of
-- its parts, or a restore), so the editor can go back to one.
ALTER TABLE public.ig_words ADD COLUMN IF NOT EXISTS versions jsonb NOT NULL DEFAULT '[]'::jsonb;
