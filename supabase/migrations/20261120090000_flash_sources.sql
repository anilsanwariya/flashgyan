-- Flashcard studio: the books a topic's cards are read from (a Word file or
-- pasted text kept in pieces, or a PDF read page by page), how far the AI
-- has read, where it stopped, and the lines the editor must check.
CREATE TABLE IF NOT EXISTS public.flash_sources (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  topic_id uuid NOT NULL REFERENCES public.flash_topics(id) ON DELETE CASCADE,
  book text NOT NULL,
  name text NOT NULL DEFAULT '',
  kind text NOT NULL CHECK (kind IN ('word', 'pdf', 'text')),
  pieces jsonb NOT NULL DEFAULT '[]'::jsonb,
  total int NOT NULL DEFAULT 0,
  done int NOT NULL DEFAULT 0,
  cards int NOT NULL DEFAULT 0,
  context jsonb NOT NULL DEFAULT '{}'::jsonb,
  todos jsonb NOT NULL DEFAULT '[]'::jsonb,
  error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS flash_sources_topic_idx ON public.flash_sources (topic_id, created_at);

ALTER TABLE public.flash_sources ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.flash_sources FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.flash_sources TO service_role;
