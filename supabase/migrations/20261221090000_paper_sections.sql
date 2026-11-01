-- Exam papers by type and section, tagged on the exam's syllabus.
-- - A paper's type (GK & GS, Hindi + English, one GK subject…) and its
--   sections with the questions each covers ([{"key","from","to"}]); the
--   section list itself is a setting (bot_settings "exam_sections").
-- - The exam's current syllabus its questions are tagged on.
-- - A question's section (set by the AI when no range covers it) and the
--   syllabus line it asks about (subject, topic and subtopic follow from it).
ALTER TABLE public.exam_papers ADD COLUMN IF NOT EXISTS paper_type text NOT NULL DEFAULT '';
ALTER TABLE public.exam_papers ADD COLUMN IF NOT EXISTS sections jsonb NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE public.exam_papers
  ADD COLUMN IF NOT EXISTS exam_syllabus_id uuid REFERENCES public.syllabus_exams (id) ON DELETE SET NULL;

ALTER TABLE public.exam_questions ADD COLUMN IF NOT EXISTS paper_section text NOT NULL DEFAULT '';
ALTER TABLE public.exam_questions
  ADD COLUMN IF NOT EXISTS syllabus_node_id uuid REFERENCES public.syllabus_nodes (id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS exam_questions_syllabus_node_idx ON public.exam_questions (syllabus_node_id);
