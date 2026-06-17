
-- 1) Create flashcard_decks
CREATE TABLE public.flashcard_decks (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name text NOT NULL,
  description text NOT NULL DEFAULT '',
  subject text NOT NULL,
  topic text NOT NULL,
  order_index integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (subject, topic)
);

GRANT SELECT ON public.flashcard_decks TO anon, authenticated;
GRANT ALL ON public.flashcard_decks TO service_role;

ALTER TABLE public.flashcard_decks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Flashcard decks are publicly readable"
  ON public.flashcard_decks FOR SELECT
  USING (true);

CREATE POLICY "Admins insert flashcard_decks"
  ON public.flashcard_decks FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins update flashcard_decks"
  ON public.flashcard_decks FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins delete flashcard_decks"
  ON public.flashcard_decks FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER trg_flashcard_decks_updated_at
  BEFORE UPDATE ON public.flashcard_decks
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 2) Backfill decks from existing flashcards
INSERT INTO public.flashcard_decks (name, description, subject, topic, order_index)
SELECT DISTINCT topic, '', subject, topic, 0
FROM public.flashcards
ON CONFLICT (subject, topic) DO NOTHING;

-- 3) Extend flashcards
ALTER TABLE public.flashcards
  ADD COLUMN deck_id uuid REFERENCES public.flashcard_decks(id) ON DELETE CASCADE,
  ADD COLUMN image_url text NULL,
  ADD COLUMN updated_at timestamptz NOT NULL DEFAULT now();

UPDATE public.flashcards f
SET deck_id = d.id
FROM public.flashcard_decks d
WHERE f.subject = d.subject AND f.topic = d.topic;

ALTER TABLE public.flashcards
  ALTER COLUMN deck_id SET NOT NULL;

CREATE INDEX flashcards_deck_id_idx ON public.flashcards (deck_id);

-- Add admin write policies on flashcards (currently only public SELECT)
CREATE POLICY "Admins insert flashcards"
  ON public.flashcards FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins update flashcards"
  ON public.flashcards FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins delete flashcards"
  ON public.flashcards FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER trg_flashcards_updated_at
  BEFORE UPDATE ON public.flashcards
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
