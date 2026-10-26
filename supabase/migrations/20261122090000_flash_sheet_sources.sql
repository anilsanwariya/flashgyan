-- Flashcard studio: Excel sheets added to a topic are kept as its sources
-- too (kind 'sheet'), so each can be seen, replaced or removed with its
-- cards.
ALTER TABLE public.flash_sources DROP CONSTRAINT IF EXISTS flash_sources_kind_check;
ALTER TABLE public.flash_sources
  ADD CONSTRAINT flash_sources_kind_check CHECK (kind IN ('word', 'pdf', 'text', 'sheet'));
