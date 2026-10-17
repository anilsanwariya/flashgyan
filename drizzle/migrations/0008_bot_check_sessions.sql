CREATE TABLE IF NOT EXISTS public.bot_check_sessions (
  chat_id bigint PRIMARY KEY,
  step text NOT NULL CHECK (step IN ('question', 'answer')),
  question text,
  marks integer,
  photos jsonb NOT NULL DEFAULT '[]'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.bot_check_sessions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.bot_check_sessions FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.bot_check_sessions TO service_role;

CREATE OR REPLACE FUNCTION public.bot_check_add_photo(p_chat_id bigint, p_photo jsonb, p_max integer)
RETURNS integer
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  UPDATE public.bot_check_sessions
  SET photos = photos || jsonb_build_array(p_photo), updated_at = now()
  WHERE chat_id = p_chat_id AND step = 'answer' AND jsonb_array_length(photos) < p_max
  RETURNING jsonb_array_length(photos);
$$;

REVOKE EXECUTE ON FUNCTION public.bot_check_add_photo(bigint, jsonb, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.bot_check_add_photo(bigint, jsonb, integer) TO service_role;

ALTER TABLE public.bot_commands DROP CONSTRAINT IF EXISTS bot_commands_builtin_check;
ALTER TABLE public.bot_commands ADD CONSTRAINT bot_commands_builtin_check
  CHECK (builtin IS NULL OR builtin IN ('study', 'flashcards', 'mcq', 'ask', 'answer', 'daily', 'check', 'help'));