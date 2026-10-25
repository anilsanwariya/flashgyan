-- The syllabus library: each exam stage's official syllabus (RAS Prelims,
-- RAS Mains…) as published, in Hindi and English line by line, with the
-- scheme of examination (marks, question counts, word limits) and each
-- line's subject section. Admin-only (read through server functions).
CREATE TABLE IF NOT EXISTS public.syllabus_exams (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  body text NOT NULL DEFAULT '',
  stage text NOT NULL DEFAULT 'prelims' CHECK (stage IN ('prelims', 'mains', 'single')),
  notified_on date,
  scheme jsonb,
  pages integer NOT NULL DEFAULT 0,
  pages_done integer NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'final')),
  error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.syllabus_nodes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  exam_id uuid NOT NULL REFERENCES public.syllabus_exams(id) ON DELETE CASCADE,
  position integer NOT NULL DEFAULT 0,
  kind text NOT NULL DEFAULT 'line' CHECK (kind IN ('paper', 'unit', 'part', 'heading', 'subheading', 'line')),
  text_en text NOT NULL DEFAULT '',
  text_hi text NOT NULL DEFAULT '',
  section text NOT NULL DEFAULT '',
  marks integer,
  page integer,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS syllabus_nodes_exam_idx ON public.syllabus_nodes (exam_id, position);

ALTER TABLE public.syllabus_exams ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.syllabus_nodes ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.syllabus_exams FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.syllabus_nodes FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.syllabus_exams TO service_role;
GRANT ALL ON public.syllabus_nodes TO service_role;
