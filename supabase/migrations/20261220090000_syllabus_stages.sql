-- Syllabi for every exam pattern, and old syllabi kept for old papers.
-- - A stage can also be "Stage 1/2/3" (two objective stages, unlike
--   Prelims and Mains), objective or written, and a stage with several
--   papers says whether they are held on the same day or different days.
-- - A syllabus "for old papers only" (archived) is kept for the papers that
--   followed it (to read and sort them), never shown in the Syllabus
--   feature or used for the outlines, notes, quizzes or new papers.
ALTER TABLE public.syllabus_exams DROP CONSTRAINT IF EXISTS syllabus_exams_stage_check;
ALTER TABLE public.syllabus_exams
  ADD CONSTRAINT syllabus_exams_stage_check
  CHECK (stage IN ('prelims', 'mains', 'single', 'stage1', 'stage2', 'stage3'));

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'syllabus_exams' AND column_name = 'mode'
  ) THEN
    ALTER TABLE public.syllabus_exams ADD COLUMN mode text NOT NULL DEFAULT 'objective';
    -- Mains syllabi read before: written papers.
    UPDATE public.syllabus_exams SET mode = 'written' WHERE stage = 'mains';
  END IF;
END $$;
ALTER TABLE public.syllabus_exams DROP CONSTRAINT IF EXISTS syllabus_exams_mode_check;
ALTER TABLE public.syllabus_exams
  ADD CONSTRAINT syllabus_exams_mode_check CHECK (mode IN ('objective', 'written'));

ALTER TABLE public.syllabus_exams ADD COLUMN IF NOT EXISTS paper_days text;
ALTER TABLE public.syllabus_exams DROP CONSTRAINT IF EXISTS syllabus_exams_paper_days_check;
ALTER TABLE public.syllabus_exams
  ADD CONSTRAINT syllabus_exams_paper_days_check CHECK (paper_days IN ('same', 'different'));

ALTER TABLE public.syllabus_exams ADD COLUMN IF NOT EXISTS archived boolean NOT NULL DEFAULT false;

-- The syllabus a paper followed, when it isn't the exam's current one.
ALTER TABLE public.exam_papers
  ADD COLUMN IF NOT EXISTS syllabus_id uuid REFERENCES public.syllabus_exams (id) ON DELETE SET NULL;
