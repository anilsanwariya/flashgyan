-- The question bank (every paper's questions, filtered and reported): whether
-- a question has an explanation, kept by the database so the bank doesn't
-- load every explanation's text.
ALTER TABLE public.exam_questions
  ADD COLUMN IF NOT EXISTS has_explanation boolean
  GENERATED ALWAYS AS (explanation_en <> '' OR explanation_hi <> '') STORED;
