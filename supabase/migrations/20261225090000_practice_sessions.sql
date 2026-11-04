-- The north-star number: practice sessions finished each day, by kind
-- (flashcards and MCQ practice end on the summary page, MCQ tests on the
-- result page). Counted by India's date; no student is identified. Written
-- and read only by the server.
CREATE TABLE IF NOT EXISTS public.practice_sessions_daily (
  day date NOT NULL,
  kind text NOT NULL CHECK (kind IN ('flashcards', 'mcq_practice', 'mcq_test')),
  n integer NOT NULL DEFAULT 0,
  PRIMARY KEY (day, kind)
);
GRANT ALL ON public.practice_sessions_daily TO service_role;
ALTER TABLE public.practice_sessions_daily ENABLE ROW LEVEL SECURITY;

-- Adds one finished session of this kind to today's count.
CREATE OR REPLACE FUNCTION public.practice_session_count(p_kind text)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  INSERT INTO public.practice_sessions_daily (day, kind, n)
  SELECT (now() AT TIME ZONE 'Asia/Kolkata')::date, p_kind, 1
  WHERE p_kind IN ('flashcards', 'mcq_practice', 'mcq_test')
  ON CONFLICT (day, kind) DO UPDATE SET n = public.practice_sessions_daily.n + 1;
$$;
REVOKE EXECUTE ON FUNCTION public.practice_session_count(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.practice_session_count(text) TO service_role;
