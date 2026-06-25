
CREATE TABLE public.mcq_practice_tests (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  order_index INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.mcq_practice_tests TO anon, authenticated;
GRANT ALL ON public.mcq_practice_tests TO service_role;
ALTER TABLE public.mcq_practice_tests ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can view practice tests" ON public.mcq_practice_tests FOR SELECT USING (true);
CREATE POLICY "Admins insert practice tests" ON public.mcq_practice_tests FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins update practice tests" ON public.mcq_practice_tests FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins delete practice tests" ON public.mcq_practice_tests FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE TRIGGER trg_mcq_practice_tests_updated BEFORE UPDATE ON public.mcq_practice_tests FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.mcq_practice_questions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  test_id UUID NOT NULL REFERENCES public.mcq_practice_tests(id) ON DELETE CASCADE,
  order_index INTEGER NOT NULL DEFAULT 0,
  question TEXT NOT NULL,
  hint TEXT NOT NULL DEFAULT '',
  image_url TEXT,
  option_1 TEXT NOT NULL,
  option_2 TEXT NOT NULL,
  option_3 TEXT NOT NULL,
  option_4 TEXT NOT NULL,
  answer INTEGER NOT NULL CHECK (answer BETWEEN 1 AND 4),
  explanation_sections JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_mcq_practice_questions_test ON public.mcq_practice_questions(test_id, order_index);
GRANT SELECT ON public.mcq_practice_questions TO anon, authenticated;
GRANT ALL ON public.mcq_practice_questions TO service_role;
ALTER TABLE public.mcq_practice_questions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can view practice questions" ON public.mcq_practice_questions FOR SELECT USING (true);
CREATE POLICY "Admins insert practice questions" ON public.mcq_practice_questions FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins update practice questions" ON public.mcq_practice_questions FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins delete practice questions" ON public.mcq_practice_questions FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE TRIGGER trg_mcq_practice_questions_updated BEFORE UPDATE ON public.mcq_practice_questions FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.home_settings ADD COLUMN IF NOT EXISTS lock_mcq_practice BOOLEAN NOT NULL DEFAULT false;
