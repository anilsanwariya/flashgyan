-- Exam paper questions: the syllabus subject section and topic (AI-filled,
-- editable, in the Excel export), and the AI's check before proofreading.
ALTER TABLE public.exam_questions ADD COLUMN IF NOT EXISTS subject_section text NOT NULL DEFAULT '';
ALTER TABLE public.exam_questions ADD COLUMN IF NOT EXISTS topic_en text NOT NULL DEFAULT '';
ALTER TABLE public.exam_questions ADD COLUMN IF NOT EXISTS topic_hi text NOT NULL DEFAULT '';
ALTER TABLE public.exam_questions ADD COLUMN IF NOT EXISTS ai_check jsonb;
