-- SAATHI answers word questions (पर्यायवाची, विलोम, अर्थ) with Hindi
-- WordNet's meanings too, once switched on in the card studio's Dictionary
-- tab. Off by default.
ALTER TABLE public.home_settings
  ADD COLUMN IF NOT EXISTS saathi_wordnet boolean NOT NULL DEFAULT false;
