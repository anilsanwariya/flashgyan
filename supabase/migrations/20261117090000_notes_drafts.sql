-- The notes themselves: each topic of a notes book written by the AI from
-- the knowledge base passages (kept with it, numbered, so every point shows
-- where it came from), then edited and approved by the editor. Admin-only.
CREATE TABLE IF NOT EXISTS public.notes_drafts (
  book_id uuid NOT NULL REFERENCES public.notes_books(id) ON DELETE CASCADE,
  topic_id uuid NOT NULL REFERENCES public.master_topics(id) ON DELETE CASCADE,
  content jsonb NOT NULL DEFAULT '{}'::jsonb,
  passages jsonb NOT NULL DEFAULT '[]'::jsonb,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'approved')),
  written_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (book_id, topic_id)
);

ALTER TABLE public.notes_drafts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.notes_drafts FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.notes_drafts TO service_role;
