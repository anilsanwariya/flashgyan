-- Flashcard studio: a card made from several books keeps the other books'
-- versions (variants), and a note (the AI check's finding, or the editor's).
ALTER TABLE public.flash_cards ADD COLUMN IF NOT EXISTS variants jsonb NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE public.flash_cards ADD COLUMN IF NOT EXISTS note text NOT NULL DEFAULT '';
