-- Exam paper questions proofread at three levels: the question and its
-- options read right, the answer, and the explanation (needed only once one
-- is written). "verified" stays as "finished" for the other features. Also:
-- the other options a key accepts (a question with two right answers) and
-- the question's difficulty, for the app's sheets.
ALTER TABLE public.exam_questions ADD COLUMN IF NOT EXISTS proof_question boolean NOT NULL DEFAULT false;
ALTER TABLE public.exam_questions ADD COLUMN IF NOT EXISTS proof_answer boolean NOT NULL DEFAULT false;
ALTER TABLE public.exam_questions ADD COLUMN IF NOT EXISTS proof_explanation boolean NOT NULL DEFAULT false;
ALTER TABLE public.exam_questions ADD COLUMN IF NOT EXISTS also_correct smallint[] NOT NULL DEFAULT '{}';
ALTER TABLE public.exam_questions ADD COLUMN IF NOT EXISTS difficulty text;
ALTER TABLE public.exam_questions DROP CONSTRAINT IF EXISTS exam_questions_difficulty_check;
ALTER TABLE public.exam_questions
  ADD CONSTRAINT exam_questions_difficulty_check CHECK (difficulty IN ('easy', 'medium', 'hard'));

-- Questions verified before: every check that applies is ticked.
UPDATE public.exam_questions
SET proof_question = true,
    proof_answer = true,
    proof_explanation = (explanation_en <> '' OR explanation_hi <> '')
WHERE verified AND NOT proof_question AND NOT proof_answer;
