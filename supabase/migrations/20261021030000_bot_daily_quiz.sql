-- Telegram bot: daily current affairs quiz with a streak. Students who opt in
-- get 5 quiz polls from the latest magazine issue at the hour they pick (India
-- time); finishing every quiz they are sent keeps their streak going.
-- Service-role only. Safe to run more than once.

CREATE TABLE IF NOT EXISTS public.bot_daily_quiz (
  chat_id bigint PRIMARY KEY,
  enabled boolean NOT NULL DEFAULT true,
  -- Hour of the day (India time) the quiz is sent.
  send_hour integer NOT NULL DEFAULT 9 CHECK (send_hour BETWEEN 0 AND 23),
  streak integer NOT NULL DEFAULT 0,
  best_streak integer NOT NULL DEFAULT 0,
  -- India dates the last quiz was sent and the last one finished.
  last_sent_date date,
  last_done_date date,
  -- The quiz now open: {"issue": "YYYY-MM-DD", "date": "YYYY-MM-DD",
  -- "polls": [{"id": poll id, "correct": option}], "answered": [poll ids], "correct": n}
  quiz jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS bot_daily_quiz_due_idx
  ON public.bot_daily_quiz (enabled, send_hour, last_sent_date);

ALTER TABLE public.bot_daily_quiz ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.bot_daily_quiz FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.bot_daily_quiz TO service_role;

-- Records one answer to the open quiz, once per poll, safely when answers
-- arrive together. Returns the updated row, or nothing for an unknown poll or
-- a repeat answer.
CREATE OR REPLACE FUNCTION public.bot_daily_quiz_answer(p_chat_id bigint, p_poll_id text, p_option integer)
RETURNS SETOF public.bot_daily_quiz
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  r public.bot_daily_quiz;
  poll jsonb;
BEGIN
  SELECT * INTO r FROM public.bot_daily_quiz WHERE chat_id = p_chat_id FOR UPDATE;
  IF NOT FOUND OR r.quiz IS NULL THEN
    RETURN;
  END IF;
  SELECT e INTO poll FROM jsonb_array_elements(coalesce(r.quiz->'polls', '[]'::jsonb)) e
  WHERE e->>'id' = p_poll_id;
  IF poll IS NULL OR coalesce(r.quiz->'answered', '[]'::jsonb) ? p_poll_id THEN
    RETURN;
  END IF;
  r.quiz := jsonb_set(
    jsonb_set(r.quiz, '{answered}', coalesce(r.quiz->'answered', '[]'::jsonb) || to_jsonb(p_poll_id)),
    '{correct}',
    to_jsonb(coalesce((r.quiz->>'correct')::int, 0)
      + CASE WHEN (poll->>'correct')::int = p_option THEN 1 ELSE 0 END)
  );
  UPDATE public.bot_daily_quiz SET quiz = r.quiz, updated_at = now()
  WHERE chat_id = p_chat_id
  RETURNING * INTO r;
  RETURN NEXT r;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.bot_daily_quiz_answer(bigint, text, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.bot_daily_quiz_answer(bigint, text, integer) TO service_role;

-- Claims today's send for one student: true only for the first caller of the
-- day, so two runs never send the same quiz twice.
CREATE OR REPLACE FUNCTION public.bot_daily_quiz_claim(p_chat_id bigint, p_today date)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  UPDATE public.bot_daily_quiz
  SET last_sent_date = p_today, updated_at = now()
  WHERE chat_id = p_chat_id AND (last_sent_date IS NULL OR last_sent_date < p_today);
  RETURN FOUND;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.bot_daily_quiz_claim(bigint, date) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.bot_daily_quiz_claim(bigint, date) TO service_role;

-- /daily: opt in, pick the time, or take today's quiz now.
DO $$
BEGIN
  IF to_regclass('public.bot_commands') IS NOT NULL THEN
    ALTER TABLE public.bot_commands DROP CONSTRAINT IF EXISTS bot_commands_builtin_check;
    ALTER TABLE public.bot_commands ADD CONSTRAINT bot_commands_builtin_check
      CHECK (builtin IS NULL OR builtin IN ('study', 'flashcards', 'mcq', 'ask', 'answer', 'daily', 'help'));
    INSERT INTO public.bot_commands
      (command, description_en, description_hi, action, builtin, scope, sort_order)
    VALUES
      ('daily', 'Daily current affairs quiz and streak',
       'दैनिक करेंट अफेयर्स क्विज़ और स्ट्रीक', 'builtin', 'daily', 'private', 35)
    ON CONFLICT (command) DO NOTHING;
  END IF;
END $$;
