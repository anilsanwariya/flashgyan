-- The booklet series (A, B, C, D) of a saved paper: an answer key can cover
-- several series (the same questions in another order), and the paper's
-- series picks its answers.
ALTER TABLE public.exam_papers ADD COLUMN IF NOT EXISTS series text NOT NULL DEFAULT '';