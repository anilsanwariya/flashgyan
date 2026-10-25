CREATE TABLE IF NOT EXISTS public.notes_topic_plans (
  book_id uuid NOT NULL REFERENCES public.notes_books(id) ON DELETE CASCADE,
  topic_id uuid NOT NULL REFERENCES public.master_topics(id) ON DELETE CASCADE,
  coverage text NOT NULL DEFAULT 'none' CHECK (coverage IN ('full', 'partial', 'none')),
  missing text NOT NULL DEFAULT '',
  sources jsonb NOT NULL DEFAULT '[]'::jsonb,
  map jsonb,
  upload jsonb NOT NULL DEFAULT '[]'::jsonb,
  sig text NOT NULL DEFAULT '',
  checked_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (book_id, topic_id)
);

ALTER TABLE public.notes_topic_plans ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.notes_topic_plans FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.notes_topic_plans TO service_role;