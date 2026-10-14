-- SAATHI: answer cache that empties itself when the knowledge base changes, and a
-- saved test set of questions for checking search quality.

-- 1) Knowledge base version, bumped by any change to saathi_knowledge.
CREATE TABLE IF NOT EXISTS public.saathi_kb_version (
  id integer PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  version bigint NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO public.saathi_kb_version (id) VALUES (1) ON CONFLICT DO NOTHING;

GRANT ALL ON public.saathi_kb_version TO service_role;
ALTER TABLE public.saathi_kb_version ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.bump_saathi_kb_version()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.saathi_kb_version SET version = version + 1, updated_at = now() WHERE id = 1;
  RETURN NULL;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.bump_saathi_kb_version() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS saathi_knowledge_bump_version ON public.saathi_knowledge;
CREATE TRIGGER saathi_knowledge_bump_version
  AFTER INSERT OR UPDATE OR DELETE ON public.saathi_knowledge
  FOR EACH STATEMENT EXECUTE FUNCTION public.bump_saathi_kb_version();

-- 2) Cached answers, keyed by channel + normalised question + subjects. An entry is
--    only served while the knowledge base version it was made with is current.
CREATE TABLE IF NOT EXISTS public.saathi_answer_cache (
  key text PRIMARY KEY,
  channel text NOT NULL,
  question text NOT NULL,
  answer text NOT NULL,
  sources jsonb NOT NULL DEFAULT '[]',
  followups jsonb NOT NULL DEFAULT '[]',
  english_query text,
  kb_version bigint NOT NULL,
  hits integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_hit_at timestamptz
);

GRANT ALL ON public.saathi_answer_cache TO service_role;
ALTER TABLE public.saathi_answer_cache ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.saathi_cache_key(p_channel text, p_question text, p_subjects text[])
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT md5(
    p_channel || '|' || public.saathi_normalize_question(p_question) || '|' ||
    coalesce((SELECT string_agg(s, ',' ORDER BY s) FROM unnest(p_subjects) AS s), '')
  )
$$;

-- Parameters are prefixed so they can't be confused with the table's columns.
CREATE OR REPLACE FUNCTION public.saathi_cache_get(p_channel text, p_question text, p_subjects text[])
RETURNS SETOF public.saathi_answer_cache
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE public.saathi_answer_cache c
  SET hits = c.hits + 1, last_hit_at = now()
  FROM public.saathi_kb_version v
  WHERE c.key = public.saathi_cache_key(p_channel, p_question, p_subjects)
    AND c.kb_version = v.version
    AND c.created_at > now() - interval '7 days'
  RETURNING c.*;
$$;

CREATE OR REPLACE FUNCTION public.saathi_cache_put(
  p_channel text,
  p_question text,
  p_subjects text[],
  p_answer text,
  p_sources jsonb,
  p_followups jsonb,
  p_english_query text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  current_version bigint;
BEGIN
  SELECT version INTO current_version FROM public.saathi_kb_version WHERE id = 1;
  INSERT INTO public.saathi_answer_cache AS c
    (key, channel, question, answer, sources, followups, english_query, kb_version)
  VALUES (
    public.saathi_cache_key(p_channel, p_question, p_subjects),
    p_channel, left(p_question, 2000), p_answer, p_sources, p_followups, p_english_query,
    current_version
  )
  ON CONFLICT (key) DO UPDATE SET
    question = excluded.question,
    answer = excluded.answer,
    sources = excluded.sources,
    followups = excluded.followups,
    english_query = excluded.english_query,
    kb_version = excluded.kb_version,
    hits = 0,
    created_at = now(),
    last_hit_at = NULL;

  -- Occasionally drop entries that can never be served again.
  IF random() < 0.02 THEN
    DELETE FROM public.saathi_answer_cache
    WHERE kb_version < current_version OR created_at < now() - interval '7 days';
  END IF;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.saathi_cache_key(text, text, text[]) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.saathi_cache_get(text, text, text[]) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.saathi_cache_put(text, text, text[], text, jsonb, jsonb, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.saathi_cache_key(text, text, text[]) TO service_role;
GRANT EXECUTE ON FUNCTION public.saathi_cache_get(text, text, text[]) TO service_role;
GRANT EXECUTE ON FUNCTION public.saathi_cache_put(text, text, text[], text, jsonb, jsonb, text) TO service_role;

-- 3) Saved test questions: each names the document that should answer it.
CREATE TABLE IF NOT EXISTS public.saathi_eval_questions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  question text NOT NULL,
  expected_document text NOT NULL,
  last_passed boolean,
  last_rank integer,
  last_english_query text,
  last_run_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT ALL ON public.saathi_eval_questions TO service_role;
ALTER TABLE public.saathi_eval_questions ENABLE ROW LEVEL SECURITY;
