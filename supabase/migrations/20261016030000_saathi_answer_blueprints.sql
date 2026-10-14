-- SAATHI answer writing (RAS Mains): model answers to previous-year questions,
-- blueprints learned from them, word limits per marks, and scores for checking
-- that blueprints improve answers. Only the service role (server code) reads or
-- writes these tables; admins use them through the admin panel.

-- 1) Word limit for each marks band. Editable in the admin panel.
CREATE TABLE IF NOT EXISTS public.saathi_answer_formats (
  marks integer PRIMARY KEY CHECK (marks BETWEEN 1 AND 50),
  word_limit integer NOT NULL CHECK (word_limit BETWEEN 5 AND 1000),
  enabled boolean NOT NULL DEFAULT true,
  updated_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO public.saathi_answer_formats (marks, word_limit) VALUES
  (2, 15), (5, 50), (10, 100), (20, 200)
ON CONFLICT (marks) DO NOTHING;

GRANT ALL ON public.saathi_answer_formats TO service_role;
ALTER TABLE public.saathi_answer_formats ENABLE ROW LEVEL SECURITY;

-- 2) Previous-year questions with model answers. "analysis" is the answer's
--    structure as read by the AI; "holdout" answers are kept out of blueprints
--    and examples so they can be used to score SAATHI fairly.
CREATE TABLE IF NOT EXISTS public.saathi_model_answers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  question text NOT NULL CHECK (length(question) BETWEEN 1 AND 4000),
  answer text NOT NULL CHECK (length(answer) BETWEEN 1 AND 30000),
  marks integer NOT NULL CHECK (marks BETWEEN 1 AND 50),
  directive text NOT NULL DEFAULT 'explain'
    CHECK (directive IN ('define', 'explain', 'discuss', 'critical', 'compare', 'suggest')),
  exam text NOT NULL DEFAULT 'RAS Mains',
  year integer CHECK (year IS NULL OR year BETWEEN 1950 AND 2100),
  paper text,
  subject text,
  source text,
  holdout boolean NOT NULL DEFAULT false,
  word_count integer NOT NULL DEFAULT 0,
  analysis jsonb,
  analysis_error text,
  embedding vector(1536),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS saathi_model_answers_marks_idx
  ON public.saathi_model_answers (marks, directive);

GRANT ALL ON public.saathi_model_answers TO service_role;
ALTER TABLE public.saathi_model_answers ENABLE ROW LEVEL SECURITY;

-- 3) Blueprints: versioned per marks + question type ('any' = all types of that
--    marks band). One active version per pair. "guide" is the text SAATHI follows;
--    "locked" versions were edited by an admin, so rebuilding saves a draft
--    instead of replacing them.
CREATE TABLE IF NOT EXISTS public.saathi_blueprints (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  marks integer NOT NULL CHECK (marks BETWEEN 1 AND 50),
  directive text NOT NULL
    CHECK (directive IN ('any', 'define', 'explain', 'discuss', 'critical', 'compare', 'suggest')),
  version integer NOT NULL,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('active', 'draft', 'archived')),
  locked boolean NOT NULL DEFAULT false,
  guide text NOT NULL,
  stats jsonb,
  tips jsonb NOT NULL DEFAULT '[]',
  sample_count integer NOT NULL DEFAULT 0,
  answer_ids uuid[] NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (marks, directive, version)
);
CREATE UNIQUE INDEX IF NOT EXISTS saathi_blueprints_one_active
  ON public.saathi_blueprints (marks, directive) WHERE status = 'active';

GRANT ALL ON public.saathi_blueprints TO service_role;
ALTER TABLE public.saathi_blueprints ENABLE ROW LEVEL SECURITY;

-- 4) Scores: SAATHI's answer to a held-out question compared with its model answer.
CREATE TABLE IF NOT EXISTS public.saathi_blueprint_scores (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  answer_id uuid NOT NULL REFERENCES public.saathi_model_answers (id) ON DELETE CASCADE,
  blueprint_id uuid REFERENCES public.saathi_blueprints (id) ON DELETE SET NULL,
  generated text NOT NULL,
  word_count integer NOT NULL DEFAULT 0,
  scores jsonb NOT NULL,
  total numeric NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS saathi_blueprint_scores_answer_idx
  ON public.saathi_blueprint_scores (answer_id, created_at DESC);

GRANT ALL ON public.saathi_blueprint_scores TO service_role;
ALTER TABLE public.saathi_blueprint_scores ENABLE ROW LEVEL SECURITY;

-- 5) Cached answers depend on blueprints, examples and word limits too.
DROP TRIGGER IF EXISTS saathi_answer_formats_bump_version ON public.saathi_answer_formats;
CREATE TRIGGER saathi_answer_formats_bump_version
  AFTER INSERT OR UPDATE OR DELETE ON public.saathi_answer_formats
  FOR EACH STATEMENT EXECUTE FUNCTION public.bump_saathi_kb_version();

DROP TRIGGER IF EXISTS saathi_model_answers_bump_version ON public.saathi_model_answers;
CREATE TRIGGER saathi_model_answers_bump_version
  AFTER INSERT OR UPDATE OR DELETE ON public.saathi_model_answers
  FOR EACH STATEMENT EXECUTE FUNCTION public.bump_saathi_kb_version();

DROP TRIGGER IF EXISTS saathi_blueprints_bump_version ON public.saathi_blueprints;
CREATE TRIGGER saathi_blueprints_bump_version
  AFTER INSERT OR UPDATE OR DELETE ON public.saathi_blueprints
  FOR EACH STATEMENT EXECUTE FUNCTION public.bump_saathi_kb_version();

-- 6) Everything an answer needs in one call: the word limit, the active
--    blueprint (the question type's own, else the marks band's 'any'), the
--    closest model answers of the same marks as examples (held-out answers
--    excluded) and the closest previous-year question of any marks.
CREATE OR REPLACE FUNCTION public.saathi_mains_context(
  p_marks integer,
  p_directive text,
  p_embedding vector,
  p_count integer DEFAULT 2
)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT jsonb_build_object(
    'word_limit', (
      SELECT f.word_limit FROM public.saathi_answer_formats f WHERE f.marks = p_marks
    ),
    'blueprint', (
      SELECT jsonb_build_object(
        'id', b.id, 'marks', b.marks, 'directive', b.directive, 'version', b.version,
        'guide', b.guide, 'sample_count', b.sample_count
      )
      FROM public.saathi_blueprints b
      WHERE b.status = 'active' AND b.marks = p_marks AND b.directive IN (p_directive, 'any')
      ORDER BY (b.directive = p_directive) DESC
      LIMIT 1
    ),
    'exemplars', coalesce((
      SELECT jsonb_agg(e ORDER BY e.rank_distance)
      FROM (
        SELECT a.id, a.question, a.answer, a.marks, a.directive, a.year, a.paper,
          1 - (a.embedding <=> p_embedding) AS similarity,
          (a.embedding <=> p_embedding)
            - CASE WHEN a.directive = p_directive THEN 0.05 ELSE 0 END AS rank_distance
        FROM public.saathi_model_answers a
        WHERE NOT a.holdout AND a.embedding IS NOT NULL AND a.marks = p_marks
        ORDER BY rank_distance
        LIMIT greatest(0, least(p_count, 5))
      ) e
    ), '[]'::jsonb),
    'pyq', (
      SELECT jsonb_build_object(
        'question', a.question, 'year', a.year, 'paper', a.paper, 'marks', a.marks,
        'similarity', 1 - (a.embedding <=> p_embedding)
      )
      FROM public.saathi_model_answers a
      WHERE a.embedding IS NOT NULL
      ORDER BY a.embedding <=> p_embedding
      LIMIT 1
    )
  )
$$;

REVOKE EXECUTE ON FUNCTION public.saathi_mains_context(integer, text, vector, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.saathi_mains_context(integer, text, vector, integer) TO service_role;

-- 7) Cached descriptive answers also keep their marks, word count and
--    blueprint details ("meta"). saathi_cache_put gains an optional p_meta.
ALTER TABLE public.saathi_answer_cache ADD COLUMN IF NOT EXISTS meta jsonb;

DROP FUNCTION IF EXISTS public.saathi_cache_put(text, text, text[], text, jsonb, jsonb, text);
CREATE OR REPLACE FUNCTION public.saathi_cache_put(
  p_channel text,
  p_question text,
  p_subjects text[],
  p_answer text,
  p_sources jsonb,
  p_followups jsonb,
  p_english_query text,
  p_meta jsonb DEFAULT NULL
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
    (key, channel, question, answer, sources, followups, english_query, kb_version, meta)
  VALUES (
    public.saathi_cache_key(p_channel, p_question, p_subjects),
    p_channel, left(p_question, 2000), p_answer, p_sources, p_followups, p_english_query,
    current_version, p_meta
  )
  ON CONFLICT (key) DO UPDATE SET
    question = excluded.question,
    answer = excluded.answer,
    sources = excluded.sources,
    followups = excluded.followups,
    english_query = excluded.english_query,
    kb_version = excluded.kb_version,
    meta = excluded.meta,
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

REVOKE EXECUTE ON FUNCTION public.saathi_cache_put(text, text, text[], text, jsonb, jsonb, text, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.saathi_cache_put(text, text, text[], text, jsonb, jsonb, text, jsonb) TO service_role;

-- saathi_cache_get returns whole cache rows; recreate it so it includes "meta".
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

-- 8) Telegram: /answer writes a descriptive answer.
DO $$
BEGIN
  IF to_regclass('public.bot_commands') IS NOT NULL THEN
    ALTER TABLE public.bot_commands DROP CONSTRAINT IF EXISTS bot_commands_builtin_check;
    ALTER TABLE public.bot_commands ADD CONSTRAINT bot_commands_builtin_check
      CHECK (builtin IS NULL OR builtin IN ('study', 'flashcards', 'mcq', 'ask', 'answer', 'help'));
    INSERT INTO public.bot_commands
      (command, description_en, description_hi, action, builtin, scope, sort_order)
    VALUES
      ('answer', 'Write a Mains answer: /answer 10 <question>',
       'मुख्य परीक्षा उत्तर लिखें: /answer 10 <प्रश्न>', 'builtin', 'answer', 'all', 45)
    ON CONFLICT (command) DO NOTHING;
  END IF;
END $$;
