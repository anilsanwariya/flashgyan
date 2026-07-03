ALTER TABLE public.mcq_questions RENAME COLUMN hint TO question_ext;
ALTER TABLE public.mcq_practice_questions RENAME COLUMN hint TO question_ext;