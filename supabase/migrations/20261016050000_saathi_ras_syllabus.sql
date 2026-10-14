-- SAATHI answer writing, aligned with the RPSC RAS Mains scheme and syllabus
-- (09-01-2026): papers I–III have 5-mark (about 50 words) and 10-mark (about
-- 150 words) questions. Adds the syllabus (topics are filled in and embedded by
-- the app), unit tags on model answers, per-unit blueprints and ethics case
-- studies as a question type. Safe to run more than once.

-- 1) Word limits from the scheme. The earlier draft defaults (2 and 20 marks,
--    100 words for 10 marks) are corrected unless model answers already use them.
INSERT INTO public.saathi_answer_formats (marks, word_limit) VALUES (5, 50), (10, 150)
ON CONFLICT (marks) DO NOTHING;
UPDATE public.saathi_answer_formats SET word_limit = 150, updated_at = now()
WHERE marks = 10 AND word_limit = 100;
DELETE FROM public.saathi_answer_formats f
WHERE ((f.marks = 2 AND f.word_limit = 15) OR (f.marks = 20 AND f.word_limit = 200))
  AND NOT EXISTS (SELECT 1 FROM public.saathi_model_answers a WHERE a.marks = f.marks);

-- 2) Ethics case studies (paper II, unit I) are their own question type.
ALTER TABLE public.saathi_model_answers DROP CONSTRAINT IF EXISTS saathi_model_answers_directive_check;
ALTER TABLE public.saathi_model_answers ADD CONSTRAINT saathi_model_answers_directive_check
  CHECK (directive IN ('define', 'explain', 'discuss', 'critical', 'compare', 'suggest', 'case_study'));
ALTER TABLE public.saathi_blueprints DROP CONSTRAINT IF EXISTS saathi_blueprints_directive_check;
ALTER TABLE public.saathi_blueprints ADD CONSTRAINT saathi_blueprints_directive_check
  CHECK (directive IN ('any', 'define', 'explain', 'discuss', 'critical', 'compare', 'suggest', 'case_study'));

-- 3) Syllabus unit and topic of each model answer (e.g. unit 'p1u1', topic 'p1u1.0.4').
ALTER TABLE public.saathi_model_answers ADD COLUMN IF NOT EXISTS unit text;
ALTER TABLE public.saathi_model_answers ADD COLUMN IF NOT EXISTS topic_id text;
CREATE INDEX IF NOT EXISTS saathi_model_answers_unit_idx ON public.saathi_model_answers (unit);

-- 4) Blueprints can belong to one syllabus unit ('' = all units).
ALTER TABLE public.saathi_blueprints ADD COLUMN IF NOT EXISTS unit text NOT NULL DEFAULT '';
ALTER TABLE public.saathi_blueprints DROP CONSTRAINT IF EXISTS saathi_blueprints_marks_directive_version_key;
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'saathi_blueprints_marks_directive_unit_version_key'
  ) THEN
    ALTER TABLE public.saathi_blueprints
      ADD CONSTRAINT saathi_blueprints_marks_directive_unit_version_key
      UNIQUE (marks, directive, unit, version);
  END IF;
END $$;
DROP INDEX IF EXISTS public.saathi_blueprints_one_active;
CREATE UNIQUE INDEX IF NOT EXISTS saathi_blueprints_one_active_per_unit
  ON public.saathi_blueprints (marks, directive, unit) WHERE status = 'active';

-- 5) Syllabus topics with embeddings, synced from the app's copy of the syllabus.
CREATE TABLE IF NOT EXISTS public.ras_syllabus_topics (
  id text PRIMARY KEY,
  unit_id text NOT NULL,
  paper text NOT NULL,
  unit_title text NOT NULL,
  part text NOT NULL,
  topic text NOT NULL,
  embedding vector(1536),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.ras_syllabus_topics TO service_role;
ALTER TABLE public.ras_syllabus_topics ENABLE ROW LEVEL SECURITY;

DROP TRIGGER IF EXISTS ras_syllabus_topics_bump_version ON public.ras_syllabus_topics;
CREATE TRIGGER ras_syllabus_topics_bump_version
  AFTER INSERT OR UPDATE OR DELETE ON public.ras_syllabus_topics
  FOR EACH STATEMENT EXECUTE FUNCTION public.bump_saathi_kb_version();

-- The syllabus topic closest to a question.
CREATE OR REPLACE FUNCTION public.saathi_nearest_syllabus_topic(p_embedding vector)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT jsonb_build_object(
    'id', s.id, 'unit_id', s.unit_id, 'paper', s.paper, 'unit_title', s.unit_title,
    'part', s.part, 'topic', s.topic, 'similarity', 1 - (s.embedding <=> p_embedding)
  )
  FROM public.ras_syllabus_topics s
  WHERE s.embedding IS NOT NULL
  ORDER BY s.embedding <=> p_embedding
  LIMIT 1
$$;
REVOKE EXECUTE ON FUNCTION public.saathi_nearest_syllabus_topic(vector) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.saathi_nearest_syllabus_topic(vector) TO service_role;

-- 6) Answer context, now syllabus-aware. The question's syllabus unit is the
--    nearest topic's unit when it is close enough. Blueprint preference: a case
--    study blueprint for case studies, then the unit's blueprint, then the
--    question type's, then the marks band's general one. Examples from the same
--    unit rank a little higher.
DROP FUNCTION IF EXISTS public.saathi_mains_context(integer, text, vector, integer);
CREATE OR REPLACE FUNCTION public.saathi_mains_context(
  p_marks integer,
  p_directive text,
  p_embedding vector,
  p_count integer DEFAULT 2,
  p_min_topic double precision DEFAULT 0.5
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_topic jsonb := public.saathi_nearest_syllabus_topic(p_embedding);
  v_unit text;
BEGIN
  IF v_topic IS NOT NULL AND (v_topic->>'similarity')::double precision < p_min_topic THEN
    v_topic := NULL;
  END IF;
  v_unit := coalesce(v_topic->>'unit_id', '');

  RETURN jsonb_build_object(
    'word_limit', (
      SELECT f.word_limit FROM public.saathi_answer_formats f WHERE f.marks = p_marks
    ),
    'topic', v_topic,
    'blueprint', (
      SELECT jsonb_build_object(
        'id', b.id, 'marks', b.marks, 'directive', b.directive, 'unit', b.unit,
        'version', b.version, 'guide', b.guide, 'sample_count', b.sample_count
      )
      FROM public.saathi_blueprints b
      WHERE b.status = 'active' AND b.marks = p_marks
        AND (
          (b.unit = '' AND b.directive IN (p_directive, 'any'))
          OR (v_unit <> '' AND b.unit = v_unit AND b.directive IN (p_directive, 'any'))
        )
      ORDER BY
        (p_directive = 'case_study' AND b.directive = 'case_study') DESC,
        (b.unit <> '') DESC,
        (b.directive = p_directive) DESC
      LIMIT 1
    ),
    'exemplars', coalesce((
      SELECT jsonb_agg(e ORDER BY e.rank_distance)
      FROM (
        SELECT a.id, a.question, a.answer, a.marks, a.directive, a.year, a.paper, a.unit,
          1 - (a.embedding <=> p_embedding) AS similarity,
          (a.embedding <=> p_embedding)
            - CASE WHEN a.directive = p_directive THEN 0.05 ELSE 0 END
            - CASE WHEN v_unit <> '' AND a.unit = v_unit THEN 0.03 ELSE 0 END AS rank_distance
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
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.saathi_mains_context(integer, text, vector, integer, double precision) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.saathi_mains_context(integer, text, vector, integer, double precision) TO service_role;

-- 7) The bot's /answer help text uses the scheme's marks.
DO $$
BEGIN
  IF to_regclass('public.bot_commands') IS NOT NULL THEN
    UPDATE public.bot_commands
    SET description_en = 'Write a Mains answer: /answer 10 <question> (5 or 10 marks)',
        description_hi = 'मुख्य परीक्षा उत्तर लिखें: /answer 10 <प्रश्न> (5 या 10 अंक)'
    WHERE command = 'answer'
      AND description_en = 'Write a Mains answer: /answer 10 <question>';
  END IF;
END $$;
