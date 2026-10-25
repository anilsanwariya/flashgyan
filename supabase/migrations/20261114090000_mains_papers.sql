-- Subjective (Mains) papers: a paper's kind; a written question's unit,
-- part, marks and word limit, and a model answer kept for learning only
-- (never shown to students). Every question (MCQ or written) can be linked
-- to the master outline's topic it asks about.
ALTER TABLE public.exam_papers
  ADD COLUMN IF NOT EXISTS kind text NOT NULL DEFAULT 'objective'
  CHECK (kind IN ('objective', 'subjective'));

ALTER TABLE public.exam_questions ADD COLUMN IF NOT EXISTS unit text NOT NULL DEFAULT '';
ALTER TABLE public.exam_questions ADD COLUMN IF NOT EXISTS part text NOT NULL DEFAULT '';
ALTER TABLE public.exam_questions ADD COLUMN IF NOT EXISTS marks integer;
ALTER TABLE public.exam_questions ADD COLUMN IF NOT EXISTS word_limit integer;
ALTER TABLE public.exam_questions ADD COLUMN IF NOT EXISTS model_answer text NOT NULL DEFAULT '';
ALTER TABLE public.exam_questions ADD COLUMN IF NOT EXISTS model_source text NOT NULL DEFAULT '';
ALTER TABLE public.exam_questions
  ADD COLUMN IF NOT EXISTS master_topic_id uuid REFERENCES public.master_topics(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS exam_questions_master_topic_idx ON public.exam_questions (master_topic_id);
