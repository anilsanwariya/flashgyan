-- Flashcard studio: a word's loose form now also writes ं for a half nasal
-- before a consonant of its own group (सम्पन्न → संपन्न, हिन्दी → हिंदी), so
-- WordNet's word index is brought up to it. (House spelling rules are
-- matched under the new form when read; nothing to change there.)
UPDATE public.flash_wn_words
SET loose = regexp_replace(
  regexp_replace(
    regexp_replace(
      regexp_replace(
        regexp_replace(loose, 'ङ्([कखगघ])', 'ं\1', 'g'),
        'ञ्([चछजझ])', 'ं\1', 'g'),
      'ण्([टठडढ])', 'ं\1', 'g'),
    'न्([तथदध])', 'ं\1', 'g'),
  'म्([पफबभ])', 'ं\1', 'g')
WHERE loose ~ '[ङञणनम]्';
