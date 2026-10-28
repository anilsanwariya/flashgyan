-- Flashcard studio: words the editor has marked correct (names, terms,
-- inflected forms WordNet doesn't list), shared by every topic's word
-- list; and one lookup of many words in Hindi WordNet (as written, or by
-- loose form) for the word list.
CREATE TABLE IF NOT EXISTS public.flash_words (
  word text PRIMARY KEY,
  loose text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS flash_words_loose_idx ON public.flash_words (loose);
ALTER TABLE public.flash_words ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.flash_words FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.flash_words TO service_role;

CREATE OR REPLACE FUNCTION public.flash_wn_lookup(p_words text[], p_loose text[])
RETURNS TABLE (word text, loose text)
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT DISTINCT w.word, w.loose
  FROM public.flash_wn_words w
  WHERE w.word = ANY (p_words) OR w.loose = ANY (p_loose)
  ORDER BY 1, 2
$$;
REVOKE ALL ON FUNCTION public.flash_wn_lookup(text[], text[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.flash_wn_lookup(text[], text[]) TO service_role;
