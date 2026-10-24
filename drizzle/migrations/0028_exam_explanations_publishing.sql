ALTER TABLE public.exam_questions ADD COLUMN IF NOT EXISTS explanation_en text NOT NULL DEFAULT '';
ALTER TABLE public.exam_questions ADD COLUMN IF NOT EXISTS explanation_hi text NOT NULL DEFAULT '';
ALTER TABLE public.exam_questions ADD COLUMN IF NOT EXISTS explanation_source text NOT NULL DEFAULT '';
ALTER TABLE public.exam_questions ADD COLUMN IF NOT EXISTS explanation_general boolean NOT NULL DEFAULT false;
ALTER TABLE public.exam_questions ADD COLUMN IF NOT EXISTS verified boolean NOT NULL DEFAULT false;
ALTER TABLE public.exam_questions ADD COLUMN IF NOT EXISTS key_note text NOT NULL DEFAULT '';
ALTER TABLE public.exam_papers ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'draft';
ALTER TABLE public.exam_papers DROP CONSTRAINT IF EXISTS exam_papers_status_check;
ALTER TABLE public.exam_papers ADD CONSTRAINT exam_papers_status_check CHECK (status IN ('draft', 'published'));
ALTER TABLE public.exam_papers ADD COLUMN IF NOT EXISTS published_at timestamptz;
ALTER TABLE public.exam_papers ADD COLUMN IF NOT EXISTS mcq_test_id uuid REFERENCES public.mcq_tests (id) ON DELETE SET NULL;

CREATE OR REPLACE FUNCTION public.exam_questions_near(p_embedding vector, p_count integer DEFAULT 4)
RETURNS TABLE (id uuid, similarity double precision)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
  SELECT q.id, 1 - (q.embedding <=> p_embedding) AS similarity
  FROM public.exam_questions q
  JOIN public.exam_papers p ON p.id = q.paper_id AND p.status = 'published'
  WHERE q.embedding IS NOT NULL AND NOT q.deleted
  ORDER BY q.embedding <=> p_embedding
  LIMIT greatest(1, least(p_count, 10))
$$;
REVOKE EXECUTE ON FUNCTION public.exam_questions_near(vector, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.exam_questions_near(vector, integer) TO service_role;