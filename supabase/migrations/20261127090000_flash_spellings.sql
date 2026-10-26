-- Flashcard studio: the editor's house spelling rules (a word's preferred
-- spelling, spellings also right, spellings wrong), keyed by the word's
-- loose form (without nukta, ं for ँ). The rest of the house list comes
-- from the verified cards themselves.
CREATE TABLE IF NOT EXISTS public.flash_spellings (
  key text PRIMARY KEY,
  preferred text,
  accepted text[] NOT NULL DEFAULT '{}',
  rejected text[] NOT NULL DEFAULT '{}',
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.flash_spellings ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.flash_spellings FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.flash_spellings TO service_role;
