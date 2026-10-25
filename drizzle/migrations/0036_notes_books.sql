-- Notes books: one per subject section and stage (Prelims or Mains), with
-- its cover design and its front pages' text (preamble, edition page, how to
-- use, sources). The contents, syllabus coverage and PYQ analysis are made
-- from the master outline and the linked questions. Admin-only.
CREATE TABLE IF NOT EXISTS public.notes_books (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  section text NOT NULL,
  stage text NOT NULL CHECK (stage IN ('prelims', 'mains')),
  cover jsonb NOT NULL DEFAULT '{}'::jsonb,
  front jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (section, stage)
);

ALTER TABLE public.notes_books ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.notes_books FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.notes_books TO service_role;
