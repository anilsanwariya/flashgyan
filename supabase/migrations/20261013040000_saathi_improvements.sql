-- SAATHI improvements: correct hybrid ranking, multi-subject search, per-IP rate
-- limits, normalised knowledge gaps, answer feedback, and chunk metadata repair.

-- 1) Fix match_saathi_hybrid ranking. The old version applied LIMIT after
--    ORDER BY k.id, so it returned arbitrary candidates instead of the best ones.
--    Signature is unchanged so older callers keep working.
CREATE OR REPLACE FUNCTION public.match_saathi_hybrid(
  query_text text,
  query_embedding vector,
  match_count integer DEFAULT 6,
  subject_filter text DEFAULT NULL::text
)
RETURNS TABLE(id uuid, title text, subject text, content text, source_file text, similarity double precision)
LANGUAGE sql
STABLE
SET search_path TO 'public'
AS $function$
  with vector_search as (
    select k.id, 1 - (k.embedding <=> query_embedding) as score
    from public.saathi_knowledge k
    where k.embedding is not null
      and k.parent_id is not null
      and (subject_filter is null or k.subject = subject_filter)
    order by k.embedding <=> query_embedding limit match_count * 2
  ),
  keyword_search as (
    select k.id, ts_rank_cd(k.fts_vector, websearch_to_tsquery('simple', query_text)) as score
    from public.saathi_knowledge k
    where k.fts_vector @@ websearch_to_tsquery('simple', query_text)
      and k.parent_id is not null
      and (subject_filter is null or k.subject = subject_filter)
    order by score desc limit match_count * 2
  )
  select k.id, k.title, k.subject, k.content, k.source_file,
    coalesce(v.score, 0.0) + (coalesce(kw.score, 0.0) * 0.5) as similarity
  from public.saathi_knowledge k
  left join vector_search v on v.id = k.id
  left join keyword_search kw on kw.id = k.id
  where v.id is not null or kw.id is not null
  order by similarity desc
  limit match_count;
$function$;

REVOKE EXECUTE ON FUNCTION public.match_saathi_hybrid(text, vector, integer, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.match_saathi_hybrid(text, vector, integer, text) TO service_role;

-- 2) One-call search across any set of subjects (NULL = all), returning the
--    vector and keyword scores separately so callers can apply a relevance cut-off.
CREATE OR REPLACE FUNCTION public.match_saathi_chunks(
  query_text text,
  query_embedding vector,
  match_count integer DEFAULT 8,
  subject_filters text[] DEFAULT NULL
)
RETURNS TABLE(
  id uuid,
  title text,
  subject text,
  content text,
  source_file text,
  vector_score double precision,
  keyword_score double precision,
  similarity double precision
)
LANGUAGE sql
STABLE
SET search_path TO 'public'
AS $function$
  with vector_search as (
    select k.id, 1 - (k.embedding <=> query_embedding) as score
    from public.saathi_knowledge k
    where k.embedding is not null
      and k.parent_id is not null
      and (subject_filters is null or k.subject = any(subject_filters))
    order by k.embedding <=> query_embedding limit match_count * 2
  ),
  keyword_search as (
    select k.id, ts_rank_cd(k.fts_vector, websearch_to_tsquery('simple', query_text)) as score
    from public.saathi_knowledge k
    where k.fts_vector @@ websearch_to_tsquery('simple', query_text)
      and k.parent_id is not null
      and (subject_filters is null or k.subject = any(subject_filters))
    order by score desc limit match_count * 2
  )
  select k.id, k.title, k.subject, k.content, k.source_file,
    coalesce(v.score, 0.0) as vector_score,
    coalesce(kw.score, 0.0) as keyword_score,
    coalesce(v.score, 0.0) + (coalesce(kw.score, 0.0) * 0.5) as similarity
  from public.saathi_knowledge k
  left join vector_search v on v.id = k.id
  left join keyword_search kw on kw.id = k.id
  where v.id is not null or kw.id is not null
  order by similarity desc
  limit match_count;
$function$;

REVOKE EXECUTE ON FUNCTION public.match_saathi_chunks(text, vector, integer, text[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.match_saathi_chunks(text, vector, integer, text[]) TO service_role;

-- 3) Repair chunks whose parent was edited before edits propagated to chunks.
UPDATE public.saathi_knowledge c
SET subject = p.subject,
    medium = p.medium,
    source_file = p.title
FROM public.saathi_knowledge p
WHERE c.parent_id = p.id
  AND (c.subject IS DISTINCT FROM p.subject
    OR c.medium IS DISTINCT FROM p.medium
    OR c.source_file IS DISTINCT FROM p.title);

-- 4) Fixed-window rate limiting for the public SAATHI endpoint.
CREATE TABLE IF NOT EXISTS public.saathi_rate_limits (
  key text PRIMARY KEY,
  window_start timestamptz NOT NULL DEFAULT now(),
  hits integer NOT NULL DEFAULT 0
);

GRANT ALL ON public.saathi_rate_limits TO service_role;
ALTER TABLE public.saathi_rate_limits ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.saathi_consume_rate_limit(
  rl_key text,
  window_seconds integer,
  max_hits integer
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  current_hits integer;
BEGIN
  INSERT INTO public.saathi_rate_limits AS r (key, window_start, hits)
  VALUES (rl_key, now(), 1)
  ON CONFLICT (key) DO UPDATE SET
    window_start = CASE
      WHEN r.window_start < now() - make_interval(secs => window_seconds) THEN now()
      ELSE r.window_start END,
    hits = CASE
      WHEN r.window_start < now() - make_interval(secs => window_seconds) THEN 1
      ELSE r.hits + 1 END
  RETURNING hits INTO current_hits;

  -- Occasionally sweep stale windows so the table stays small.
  IF random() < 0.01 THEN
    DELETE FROM public.saathi_rate_limits WHERE window_start < now() - interval '2 days';
  END IF;

  RETURN current_hits <= max_hits;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.saathi_consume_rate_limit(text, integer, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.saathi_consume_rate_limit(text, integer, integer) TO service_role;

-- 5) Normalise knowledge gaps so "What is GDP?" and "what is gdp" count together.
CREATE OR REPLACE FUNCTION public.saathi_normalize_question(q text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT btrim(
    regexp_replace(
      regexp_replace(lower(coalesce(q, '')), '[[:space:]]+', ' ', 'g'),
      '[[:space:][:punct:]।]+$', ''
    )
  )
$$;

ALTER TABLE public.saathi_knowledge_gaps ADD COLUMN IF NOT EXISTS question_key text;

UPDATE public.saathi_knowledge_gaps
SET question_key = public.saathi_normalize_question(question)
WHERE question_key IS NULL;

WITH ranked AS (
  SELECT
    id,
    row_number() OVER (PARTITION BY question_key ORDER BY last_asked_at DESC, id) AS rn,
    sum(ask_count) OVER (PARTITION BY question_key) AS total,
    max(last_asked_at) OVER (PARTITION BY question_key) AS last_at,
    min(created_at) OVER (PARTITION BY question_key) AS first_at
  FROM public.saathi_knowledge_gaps
)
UPDATE public.saathi_knowledge_gaps g
SET ask_count = r.total, last_asked_at = r.last_at, created_at = r.first_at
FROM ranked r
WHERE g.id = r.id AND r.rn = 1;

WITH ranked AS (
  SELECT id, row_number() OVER (PARTITION BY question_key ORDER BY last_asked_at DESC, id) AS rn
  FROM public.saathi_knowledge_gaps
)
DELETE FROM public.saathi_knowledge_gaps g
USING ranked r
WHERE g.id = r.id AND r.rn > 1;

ALTER TABLE public.saathi_knowledge_gaps ALTER COLUMN question_key SET NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS saathi_knowledge_gaps_question_key_idx
  ON public.saathi_knowledge_gaps (question_key);
-- Uniqueness now lives on question_key; the raw text is just the latest wording.
ALTER TABLE public.saathi_knowledge_gaps
  DROP CONSTRAINT IF EXISTS saathi_knowledge_gaps_question_key;

CREATE OR REPLACE FUNCTION public.increment_knowledge_gap(gap_question text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  q text := left(btrim(coalesce(gap_question, '')), 2000);
  k text := public.saathi_normalize_question(q);
BEGIN
  IF k = '' THEN
    RETURN;
  END IF;
  INSERT INTO public.saathi_knowledge_gaps (question, question_key, ask_count, last_asked_at)
  VALUES (q, k, 1, now())
  ON CONFLICT (question_key)
  DO UPDATE SET
    ask_count = public.saathi_knowledge_gaps.ask_count + 1,
    last_asked_at = now();
END;
$$;

REVOKE EXECUTE ON FUNCTION public.increment_knowledge_gap(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.increment_knowledge_gap(text) TO service_role;
REVOKE EXECUTE ON FUNCTION public.saathi_normalize_question(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.saathi_normalize_question(text) TO service_role;

-- 6) Thumbs up / down on SAATHI answers, reviewed by admins.
CREATE TABLE IF NOT EXISTS public.saathi_feedback (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  question text NOT NULL,
  answer text NOT NULL,
  rating smallint NOT NULL CHECK (rating IN (-1, 1)),
  sources text[] NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT ALL ON public.saathi_feedback TO service_role;
ALTER TABLE public.saathi_feedback ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS saathi_feedback_created_idx
  ON public.saathi_feedback (created_at DESC);
