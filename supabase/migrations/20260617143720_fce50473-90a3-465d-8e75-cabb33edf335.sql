DROP TABLE IF EXISTS public.flashcards CASCADE;

CREATE TABLE public.flashcards (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  subject text NOT NULL,
  topic text NOT NULL,
  order_index integer NOT NULL DEFAULT 0,
  prompt text NOT NULL,
  back text NOT NULL,
  sections jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.flashcards TO anon, authenticated;
GRANT ALL ON public.flashcards TO service_role;

ALTER TABLE public.flashcards ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Flashcards are publicly readable"
  ON public.flashcards FOR SELECT
  TO anon, authenticated
  USING (true);

CREATE INDEX flashcards_deck_order_idx
  ON public.flashcards (subject, topic, order_index);