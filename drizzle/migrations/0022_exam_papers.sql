-- Exam papers, saved exam by exam with their answer keys: read from a
-- question paper (PDF, page by page) or imported from Excel, exported to
-- Excel, and checked against the current affairs magazine (which questions
-- it covered, rated low or missed).
CREATE TABLE IF NOT EXISTS public.exam_papers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  exam text NOT NULL,
  subject text NOT NULL DEFAULT '',
  conducted_by text NOT NULL DEFAULT '',
  exam_date date,
  paper_code text NOT NULL DEFAULT '',
  -- Questions the paper says it has (from its cover), when known.
  questions_total integer,
  source text NOT NULL DEFAULT 'pdf' CHECK (source IN ('pdf', 'excel')),
  -- Reading a PDF page by page.
  pages integer NOT NULL DEFAULT 0,
  pages_done integer NOT NULL DEFAULT 0,
  key_added boolean NOT NULL DEFAULT false,
  -- Checked against the magazine: when, and the lessons drawn.
  checked_at timestamptz,
  lessons jsonb NOT NULL DEFAULT '[]'::jsonb,
  error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.exam_papers TO service_role;
ALTER TABLE public.exam_papers ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.exam_questions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  paper_id uuid NOT NULL REFERENCES public.exam_papers (id) ON DELETE CASCADE,
  q_no integer NOT NULL,
  question_en text NOT NULL DEFAULT '',
  question_hi text NOT NULL DEFAULT '',
  -- The question's other part: statements, List I / List II, assertion and
  -- reason.
  extra_en text NOT NULL DEFAULT '',
  extra_hi text NOT NULL DEFAULT '',
  -- Four options, each {"en": "...", "hi": "..."}.
  options jsonb NOT NULL DEFAULT '[]'::jsonb,
  -- The correct option (1-4) from the answer key; deleted by the key.
  correct smallint CHECK (correct BETWEEN 1 AND 4),
  deleted boolean NOT NULL DEFAULT false,
  -- Against the magazine: current affairs or static, the closest story, and
  -- whether we covered it ("covered"), had it but left it out or rated it
  -- low ("low") or never had it ("missed").
  ca boolean,
  matched_item uuid REFERENCES public.ca_items (id) ON DELETE SET NULL,
  match text CHECK (match IN ('covered', 'low', 'missed')),
  match_note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (paper_id, q_no)
);
CREATE INDEX IF NOT EXISTS exam_questions_paper_idx ON public.exam_questions (paper_id, q_no);
GRANT ALL ON public.exam_questions TO service_role;
ALTER TABLE public.exam_questions ENABLE ROW LEVEL SECURITY;

-- Stories close to an exam question, left out ones too (a story we had but
-- dropped counts as "low", not "missed"). Daily stories only.
CREATE OR REPLACE FUNCTION public.exam_similar_items(
  p_embedding vector,
  p_from date,
  p_to date,
  p_count integer DEFAULT 6
)
RETURNS TABLE (id uuid, similarity double precision)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT i.id, 1 - (i.embedding <=> p_embedding) AS similarity
  FROM public.ca_items i
  WHERE i.embedding IS NOT NULL
    AND i.status IN ('included', 'dropped')
    AND i.issue_date BETWEEN p_from AND p_to
  ORDER BY i.embedding <=> p_embedding
  LIMIT greatest(1, least(p_count, 10))
$$;
REVOKE EXECUTE ON FUNCTION public.exam_similar_items(vector, date, date, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.exam_similar_items(vector, date, date, integer) TO service_role;
