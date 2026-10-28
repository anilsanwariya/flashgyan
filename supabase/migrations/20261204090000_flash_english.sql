-- Flashcard studio: English decks. Each deck type gets a language (Hindi,
-- or English with Hindi meanings in it), and the English deck types are
-- added. English dictionaries, loaded by the editor on the Dictionary tab
-- and used only through the studio's server: Open English WordNet (its
-- synsets and an index of its words, with each meaning's place among the
-- word's meanings) and the British spelling list (every form of every
-- word). And one lookup of many English words in both.
ALTER TABLE public.flash_templates
  ADD COLUMN IF NOT EXISTS language text NOT NULL DEFAULT 'hi';
UPDATE public.flash_templates SET language = 'en' WHERE key LIKE 'en-%';

INSERT INTO public.flash_templates (key, name, prompt, columns, word_key, examples, sort, wrong_front, language)
VALUES
  ('en-preposition', 'E01 Prepositions', 'Fill in the blank with the correct preposition - ', '[{"id":"c1","title":"Explanation","hint":"the rule or usage, in one or two lines"},{"id":"c2","title":"हिंदी अर्थ","hint":"the sentence''s meaning in Hindi"}]'::jsonb, '', '[{"front":"He is fond ___ music.","back":"of","ex":{"Explanation":"''Fond'' is always followed by ''of''.","हिंदी अर्थ":"उसे संगीत का शौक है।"}}]'::jsonb, 30, false, 'en'),
  ('en-pos', 'E02 Same Word, Different Parts of Speech', 'Use the word as different parts of speech - ', '[{"id":"c1","title":"Usage","hint":"one sentence for each part of speech, one per line, each starting ''◆ ''"},{"id":"c2","title":"हिंदी अर्थ","hint":"the word''s meanings in Hindi"}]'::jsonb, '', '[{"front":"Light","back":"Noun, Verb, Adjective","ex":{"Usage":"◆ Noun: The light in this room is dim.\n◆ Verb: Please light the lamp.\n◆ Adjective: This bag is light.","हिंदी अर्थ":"प्रकाश; जलाना; हल्का"}}]'::jsonb, 31, false, 'en'),
  ('en-phrasal-idioms', 'E03 Phrasal Verbs & Idioms', 'Meaning of - ', '[{"id":"c1","title":"Example sentence","hint":"one everyday sentence using it"},{"id":"c2","title":"हिंदी अर्थ","hint":"the meaning in Hindi"}]'::jsonb, '', '[{"front":"Give up","back":"To stop doing something","ex":{"Example sentence":"He gave up smoking last year.","हिंदी अर्थ":"छोड़ देना"}}]'::jsonb, 32, false, 'en'),
  ('en-one-word', 'E04 One Word Substitution', 'One word for - ', '[{"id":"c1","title":"Example sentence","hint":"one everyday sentence using the word"},{"id":"c2","title":"हिंदी अर्थ","hint":"the word''s meaning in Hindi"}]'::jsonb, '', '[{"front":"One who knows everything","back":"Omniscient","ex":{"Example sentence":"No teacher is omniscient.","हिंदी अर्थ":"सर्वज्ञ"}}]'::jsonb, 33, false, 'en'),
  ('en-confused', 'E05 Words Often Confused or Misused', 'Difference between - ', '[{"id":"c1","title":"Example sentences","hint":"one sentence for each word, one per line, each starting ''◆ ''"},{"id":"c2","title":"हिंदी अर्थ","hint":"each word''s meaning in Hindi"}]'::jsonb, '', '[{"front":"Affect / Effect","back":"Affect: to influence (verb)\nEffect: a result (noun)","ex":{"Example sentences":"◆ Lack of sleep can affect your health.\n◆ The new rule had a good effect.","हिंदी अर्थ":"प्रभावित करना; परिणाम"}}]'::jsonb, 34, false, 'en'),
  ('en-synonyms', 'E06 Synonyms', 'Synonyms of - ', '[{"id":"c1","title":"Meaning","hint":"the word''s meaning, when it has more than one"},{"id":"c2","title":"हिंदी अर्थ","hint":"the word''s meaning in Hindi"}]'::jsonb, '', '[{"front":"Abandon","back":"Desert, Forsake, Leave","ex":{"Meaning":"to leave completely","हिंदी अर्थ":"त्याग देना"}}]'::jsonb, 35, false, 'en'),
  ('en-antonyms', 'E07 Antonyms', 'Antonym of - ', '[{"id":"c1","title":"Meaning","hint":"the word''s meaning, when it has more than one"},{"id":"c2","title":"हिंदी अर्थ","hint":"the word''s meaning in Hindi"}]'::jsonb, '', '[{"front":"Ancient","back":"Modern","ex":{"Meaning":"very old","हिंदी अर्थ":"प्राचीन"}}]'::jsonb, 36, false, 'en'),
  ('en-affix', 'E08 Prefix & Suffix', 'Prefix / suffix in - ', '[{"id":"c1","title":"Root word","hint":"the base word"},{"id":"c2","title":"Meaning","hint":"what the prefix or suffix adds"}]'::jsonb, '', '[{"front":"Unhappy","back":"Prefix: un-","ex":{"Root word":"happy","Meaning":"un- = not"}}]'::jsonb, 37, false, 'en')

ON CONFLICT (key) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.flash_enwn_synsets (
  id text PRIMARY KEY,
  pos text NOT NULL,
  words text[] NOT NULL,
  gloss text NOT NULL DEFAULT '',
  example text NOT NULL DEFAULT '',
  antonyms text[] NOT NULL DEFAULT '{}',
  loaded_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.flash_enwn_words (
  word text NOT NULL,
  lower text NOT NULL,
  synset_id text NOT NULL REFERENCES public.flash_enwn_synsets(id) ON DELETE CASCADE,
  rank smallint NOT NULL DEFAULT 99,
  PRIMARY KEY (word, synset_id)
);
CREATE INDEX IF NOT EXISTS flash_enwn_words_lower_idx ON public.flash_enwn_words (lower);
CREATE INDEX IF NOT EXISTS flash_enwn_words_synset_idx ON public.flash_enwn_words (synset_id);
CREATE TABLE IF NOT EXISTS public.flash_en_spell (
  word text PRIMARY KEY,
  lower text NOT NULL
);
CREATE INDEX IF NOT EXISTS flash_en_spell_lower_idx ON public.flash_en_spell (lower);
ALTER TABLE public.flash_enwn_synsets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.flash_enwn_words ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.flash_en_spell ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.flash_enwn_synsets FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.flash_enwn_words FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.flash_en_spell FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.flash_enwn_synsets TO service_role;
GRANT ALL ON public.flash_enwn_words TO service_role;
GRANT ALL ON public.flash_en_spell TO service_role;

-- Which of these words (in small letters) the spelling list ('s') and
-- WordNet ('w') have, as they write them.
CREATE OR REPLACE FUNCTION public.flash_en_lookup(p_lower text[])
RETURNS TABLE (word text, lower text, src text)
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT DISTINCT s.word, s.lower, 's' FROM public.flash_en_spell s WHERE s.lower = ANY (p_lower)
  UNION
  SELECT DISTINCT w.word, w.lower, 'w' FROM public.flash_enwn_words w WHERE w.lower = ANY (p_lower)
  ORDER BY 1, 2, 3
$$;
REVOKE ALL ON FUNCTION public.flash_en_lookup(text[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.flash_en_lookup(text[]) TO service_role;
