-- Flashcard studio: Wiktionary entries for words looked up (meanings,
-- synonyms, antonyms, other spellings), kept so each word is fetched once
-- a month and the AI check can use them.
CREATE TABLE IF NOT EXISTS public.flash_dictionary (
  word text PRIMARY KEY,
  entry jsonb NOT NULL,
  fetched_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.flash_dictionary ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.flash_dictionary FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.flash_dictionary TO service_role;
