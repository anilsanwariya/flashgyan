
CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = _role
  )
$$;

CREATE TABLE public.bot_flashcards (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  subject text NOT NULL,
  topic text NOT NULL,
  order_index integer NOT NULL DEFAULT 0,
  prompt text NOT NULL,
  question text NOT NULL,
  answer text NOT NULL,
  sections jsonb NOT NULL DEFAULT '[]'::jsonb,
  image_url text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.bot_flashcards TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.bot_flashcards TO authenticated;
ALTER TABLE public.bot_flashcards ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins manage bot_flashcards" ON public.bot_flashcards
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));

CREATE TABLE public.bot_mcq_tests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  description text NOT NULL DEFAULT '',
  subject text NOT NULL DEFAULT '',
  topic text NOT NULL DEFAULT '',
  order_index integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.bot_mcq_tests TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.bot_mcq_tests TO authenticated;
ALTER TABLE public.bot_mcq_tests ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins manage bot_mcq_tests" ON public.bot_mcq_tests
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));

CREATE TABLE public.bot_mcq_questions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  test_id uuid NOT NULL REFERENCES public.bot_mcq_tests(id) ON DELETE CASCADE,
  order_index integer NOT NULL DEFAULT 0,
  question text NOT NULL,
  question_ext text NOT NULL DEFAULT '',
  image_url text,
  option_1 text NOT NULL,
  option_2 text NOT NULL,
  option_3 text NOT NULL,
  option_4 text NOT NULL,
  answer integer NOT NULL,
  explanation_sections jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.bot_mcq_questions TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.bot_mcq_questions TO authenticated;
ALTER TABLE public.bot_mcq_questions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins manage bot_mcq_questions" ON public.bot_mcq_questions
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));

CREATE TABLE public.bot_users (
  chat_id bigint PRIMARY KEY,
  username text,
  first_name text,
  last_active timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.bot_users TO service_role;
GRANT SELECT ON public.bot_users TO authenticated;
ALTER TABLE public.bot_users ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins read bot_users" ON public.bot_users
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role));

CREATE TABLE public.bot_sessions (
  chat_id bigint PRIMARY KEY,
  subject text NOT NULL,
  current_count integer NOT NULL DEFAULT 0,
  correct_count integer NOT NULL DEFAULT 0,
  incorrect_count integer NOT NULL DEFAULT 0,
  active_poll_id text,
  correct_option_id integer,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.bot_sessions TO service_role;
ALTER TABLE public.bot_sessions ENABLE ROW LEVEL SECURITY;

CREATE TRIGGER bot_flashcards_set_updated BEFORE UPDATE ON public.bot_flashcards
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER bot_mcq_tests_set_updated BEFORE UPDATE ON public.bot_mcq_tests
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER bot_mcq_questions_set_updated BEFORE UPDATE ON public.bot_mcq_questions
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER bot_sessions_set_updated BEFORE UPDATE ON public.bot_sessions
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
