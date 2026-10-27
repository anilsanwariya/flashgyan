-- Flashcard studio: Hindi WordNet (IIT Bombay, CFILT), loaded by the
-- editor from its database file for the card studio's dictionary: its
-- synsets (one meaning's words, gloss, example, antonym synsets) and an
-- index of its words (with their loose form: no nukta, ं for ँ).
CREATE TABLE IF NOT EXISTS public.flash_wn_synsets (
  id integer PRIMARY KEY,
  pos smallint NOT NULL,
  words text[] NOT NULL,
  gloss text NOT NULL DEFAULT '',
  example text NOT NULL DEFAULT '',
  antonyms integer[] NOT NULL DEFAULT '{}',
  loaded_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.flash_wn_words (
  word text NOT NULL,
  loose text NOT NULL,
  synset_id integer NOT NULL REFERENCES public.flash_wn_synsets(id) ON DELETE CASCADE,
  PRIMARY KEY (word, synset_id)
);
CREATE INDEX IF NOT EXISTS flash_wn_words_loose_idx ON public.flash_wn_words (loose);
CREATE INDEX IF NOT EXISTS flash_wn_words_synset_idx ON public.flash_wn_words (synset_id);
ALTER TABLE public.flash_wn_synsets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.flash_wn_words ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.flash_wn_synsets FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.flash_wn_words FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.flash_wn_synsets TO service_role;
GRANT ALL ON public.flash_wn_words TO service_role;
