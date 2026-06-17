
CREATE TABLE public.mcq_tests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  description text NOT NULL DEFAULT '',
  order_index int NOT NULL DEFAULT 0,
  duration_seconds int NOT NULL DEFAULT 600,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.mcq_tests TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.mcq_tests TO authenticated;
GRANT ALL ON public.mcq_tests TO service_role;
ALTER TABLE public.mcq_tests ENABLE ROW LEVEL SECURITY;
CREATE POLICY "MCQ tests are publicly readable" ON public.mcq_tests FOR SELECT USING (true);
CREATE POLICY "Admins insert mcq_tests" ON public.mcq_tests FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins update mcq_tests" ON public.mcq_tests FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins delete mcq_tests" ON public.mcq_tests FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'admin'));

CREATE TABLE public.mcq_questions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  test_id uuid NOT NULL REFERENCES public.mcq_tests(id) ON DELETE CASCADE,
  order_index int NOT NULL DEFAULT 0,
  question text NOT NULL,
  hint text NOT NULL DEFAULT '',
  image_url text,
  option_1 text NOT NULL,
  option_2 text NOT NULL,
  option_3 text NOT NULL,
  option_4 text NOT NULL,
  answer int NOT NULL CHECK (answer BETWEEN 1 AND 4),
  explanation_sections jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX mcq_questions_test_id_order ON public.mcq_questions(test_id, order_index);
GRANT SELECT ON public.mcq_questions TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.mcq_questions TO authenticated;
GRANT ALL ON public.mcq_questions TO service_role;
ALTER TABLE public.mcq_questions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "MCQ questions are publicly readable" ON public.mcq_questions FOR SELECT USING (true);
CREATE POLICY "Admins insert mcq_questions" ON public.mcq_questions FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins update mcq_questions" ON public.mcq_questions FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins delete mcq_questions" ON public.mcq_questions FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'admin'));

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;
CREATE TRIGGER mcq_tests_updated_at BEFORE UPDATE ON public.mcq_tests FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER mcq_questions_updated_at BEFORE UPDATE ON public.mcq_questions FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE POLICY "MCQ images public read" ON storage.objects FOR SELECT USING (bucket_id = 'mcq-images');
CREATE POLICY "MCQ images admin insert" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'mcq-images' AND public.has_role(auth.uid(), 'admin'));
CREATE POLICY "MCQ images admin update" ON storage.objects FOR UPDATE TO authenticated USING (bucket_id = 'mcq-images' AND public.has_role(auth.uid(), 'admin'));
CREATE POLICY "MCQ images admin delete" ON storage.objects FOR DELETE TO authenticated USING (bucket_id = 'mcq-images' AND public.has_role(auth.uid(), 'admin'));
