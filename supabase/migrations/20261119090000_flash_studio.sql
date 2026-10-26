-- Flashcard studio: deck templates (prompt and explanation columns), topics
-- (one chapter of cards made from several books) and their cards. A topic is
-- proofread, then finalised: its cards are shuffled, split into chunks and
-- numbered 1, 2, 3… across the chunks. After that a card's number and chunk
-- never change, so a chunk downloaded again goes back to the same place in
-- the app. Admin-only.
CREATE TABLE IF NOT EXISTS public.flash_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key text NOT NULL UNIQUE,
  name text NOT NULL,
  prompt text NOT NULL DEFAULT '',
  columns jsonb NOT NULL DEFAULT '[]'::jsonb,
  word_key text NOT NULL DEFAULT '',
  examples jsonb NOT NULL DEFAULT '[]'::jsonb,
  sort int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.flash_topics (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  template_id uuid REFERENCES public.flash_templates(id) ON DELETE SET NULL,
  prompt text NOT NULL DEFAULT '',
  columns jsonb NOT NULL DEFAULT '[]'::jsonb,
  word_key text NOT NULL DEFAULT '',
  books jsonb NOT NULL DEFAULT '[]'::jsonb,
  chunks jsonb NOT NULL DEFAULT '[]'::jsonb,
  locked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.flash_cards (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  topic_id uuid NOT NULL REFERENCES public.flash_topics(id) ON DELETE CASCADE,
  pos int NOT NULL DEFAULT 0,
  prompt text,
  front text NOT NULL DEFAULT '',
  back text NOT NULL DEFAULT '',
  back_hint text NOT NULL DEFAULT '',
  is_revealed boolean NOT NULL DEFAULT false,
  word_key text,
  ex jsonb NOT NULL DEFAULT '{}'::jsonb,
  own jsonb NOT NULL DEFAULT '[]'::jsonb,
  sources jsonb NOT NULL DEFAULT '[]'::jsonb,
  error boolean NOT NULL DEFAULT false,
  error_type text NOT NULL DEFAULT '',
  verified boolean NOT NULL DEFAULT false,
  removed boolean NOT NULL DEFAULT false,
  chunk int,
  card_order int,
  app_id text,
  history jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (topic_id, card_order)
);
CREATE INDEX IF NOT EXISTS flash_cards_topic_idx ON public.flash_cards (topic_id, pos);

ALTER TABLE public.flash_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.flash_topics ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.flash_cards ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.flash_templates, public.flash_topics, public.flash_cards FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.flash_templates, public.flash_topics, public.flash_cards TO service_role;
