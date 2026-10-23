-- Past exam questions linked to stories ("Asked before" under a story), and
-- each current affairs question's magazine section (the coverage meter).
ALTER TABLE public.exam_questions ADD COLUMN IF NOT EXISTS embedding vector(1536);
ALTER TABLE public.exam_questions ADD COLUMN IF NOT EXISTS section text;

-- A story's past questions: [{"id", "exam", "year", "q_no", "en", "hi"}];
-- checked once (again after "Check again"); the editor's removals stay out.
ALTER TABLE public.ca_items ADD COLUMN IF NOT EXISTS asked jsonb;
ALTER TABLE public.ca_items ADD COLUMN IF NOT EXISTS asked_checked boolean NOT NULL DEFAULT false;
ALTER TABLE public.ca_items ADD COLUMN IF NOT EXISTS asked_hidden uuid[] NOT NULL DEFAULT '{}';

-- The past questions closest to a story.
CREATE OR REPLACE FUNCTION public.exam_questions_near(
  p_embedding vector,
  p_count integer DEFAULT 4
)
RETURNS TABLE (id uuid, similarity double precision)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT q.id, 1 - (q.embedding <=> p_embedding) AS similarity
  FROM public.exam_questions q
  WHERE q.embedding IS NOT NULL AND NOT q.deleted
  ORDER BY q.embedding <=> p_embedding
  LIMIT greatest(1, least(p_count, 10))
$$;
REVOKE EXECUTE ON FUNCTION public.exam_questions_near(vector, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.exam_questions_near(vector, integer) TO service_role;
