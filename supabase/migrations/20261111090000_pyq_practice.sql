-- MCQ practice sets made from published exam papers' questions, by subject
-- section and topic; rebuilt when a paper is published or unpublished (sets
-- made by hand are never touched).
ALTER TABLE public.mcq_practice_tests ADD COLUMN IF NOT EXISTS from_papers boolean NOT NULL DEFAULT false;
