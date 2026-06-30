
-- 1) Move has_role out of the exposed public schema into a private schema
CREATE SCHEMA IF NOT EXISTS private;
GRANT USAGE ON SCHEMA private TO authenticated, service_role;

CREATE OR REPLACE FUNCTION private.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role)
$$;
REVOKE EXECUTE ON FUNCTION private.has_role(uuid, public.app_role) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION private.has_role(uuid, public.app_role) TO authenticated, service_role;

-- 2) Recreate every policy that referenced public.has_role to use private.has_role

-- mcq_tests
DROP POLICY IF EXISTS "Admins insert mcq_tests" ON public.mcq_tests;
DROP POLICY IF EXISTS "Admins update mcq_tests" ON public.mcq_tests;
DROP POLICY IF EXISTS "Admins delete mcq_tests" ON public.mcq_tests;
CREATE POLICY "Admins insert mcq_tests" ON public.mcq_tests FOR INSERT TO authenticated WITH CHECK (private.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins update mcq_tests" ON public.mcq_tests FOR UPDATE TO authenticated USING (private.has_role(auth.uid(), 'admin')) WITH CHECK (private.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins delete mcq_tests" ON public.mcq_tests FOR DELETE TO authenticated USING (private.has_role(auth.uid(), 'admin'));

-- mcq_questions
DROP POLICY IF EXISTS "Admins insert mcq_questions" ON public.mcq_questions;
DROP POLICY IF EXISTS "Admins update mcq_questions" ON public.mcq_questions;
DROP POLICY IF EXISTS "Admins delete mcq_questions" ON public.mcq_questions;
CREATE POLICY "Admins insert mcq_questions" ON public.mcq_questions FOR INSERT TO authenticated WITH CHECK (private.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins update mcq_questions" ON public.mcq_questions FOR UPDATE TO authenticated USING (private.has_role(auth.uid(), 'admin')) WITH CHECK (private.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins delete mcq_questions" ON public.mcq_questions FOR DELETE TO authenticated USING (private.has_role(auth.uid(), 'admin'));

-- flashcard_decks
DROP POLICY IF EXISTS "Admins insert flashcard_decks" ON public.flashcard_decks;
DROP POLICY IF EXISTS "Admins update flashcard_decks" ON public.flashcard_decks;
DROP POLICY IF EXISTS "Admins delete flashcard_decks" ON public.flashcard_decks;
CREATE POLICY "Admins insert flashcard_decks" ON public.flashcard_decks FOR INSERT TO authenticated WITH CHECK (private.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins update flashcard_decks" ON public.flashcard_decks FOR UPDATE TO authenticated USING (private.has_role(auth.uid(), 'admin')) WITH CHECK (private.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins delete flashcard_decks" ON public.flashcard_decks FOR DELETE TO authenticated USING (private.has_role(auth.uid(), 'admin'));

-- flashcards
DROP POLICY IF EXISTS "Admins insert flashcards" ON public.flashcards;
DROP POLICY IF EXISTS "Admins update flashcards" ON public.flashcards;
DROP POLICY IF EXISTS "Admins delete flashcards" ON public.flashcards;
CREATE POLICY "Admins insert flashcards" ON public.flashcards FOR INSERT TO authenticated WITH CHECK (private.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins update flashcards" ON public.flashcards FOR UPDATE TO authenticated USING (private.has_role(auth.uid(), 'admin')) WITH CHECK (private.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins delete flashcards" ON public.flashcards FOR DELETE TO authenticated USING (private.has_role(auth.uid(), 'admin'));

-- saathi_knowledge
DROP POLICY IF EXISTS "Admins can insert saathi_knowledge" ON public.saathi_knowledge;
DROP POLICY IF EXISTS "Admins can update saathi_knowledge" ON public.saathi_knowledge;
DROP POLICY IF EXISTS "Admins can delete saathi_knowledge" ON public.saathi_knowledge;
CREATE POLICY "Admins can insert saathi_knowledge" ON public.saathi_knowledge FOR INSERT TO authenticated WITH CHECK (private.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins can update saathi_knowledge" ON public.saathi_knowledge FOR UPDATE TO authenticated USING (private.has_role(auth.uid(), 'admin')) WITH CHECK (private.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins can delete saathi_knowledge" ON public.saathi_knowledge FOR DELETE TO authenticated USING (private.has_role(auth.uid(), 'admin'));

-- home_banners
DROP POLICY IF EXISTS "home_banners admin all" ON public.home_banners;
CREATE POLICY "home_banners admin all" ON public.home_banners FOR ALL TO authenticated USING (private.has_role(auth.uid(), 'admin')) WITH CHECK (private.has_role(auth.uid(), 'admin'));

-- home_settings
DROP POLICY IF EXISTS "home_settings admin all" ON public.home_settings;
CREATE POLICY "home_settings admin all" ON public.home_settings FOR ALL TO authenticated USING (private.has_role(auth.uid(), 'admin')) WITH CHECK (private.has_role(auth.uid(), 'admin'));

-- mcq_practice_tests
DROP POLICY IF EXISTS "Admins insert practice tests" ON public.mcq_practice_tests;
DROP POLICY IF EXISTS "Admins update practice tests" ON public.mcq_practice_tests;
DROP POLICY IF EXISTS "Admins delete practice tests" ON public.mcq_practice_tests;
CREATE POLICY "Admins insert practice tests" ON public.mcq_practice_tests FOR INSERT TO authenticated WITH CHECK (private.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins update practice tests" ON public.mcq_practice_tests FOR UPDATE TO authenticated USING (private.has_role(auth.uid(), 'admin')) WITH CHECK (private.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins delete practice tests" ON public.mcq_practice_tests FOR DELETE TO authenticated USING (private.has_role(auth.uid(), 'admin'));

-- mcq_practice_questions
DROP POLICY IF EXISTS "Admins insert practice questions" ON public.mcq_practice_questions;
DROP POLICY IF EXISTS "Admins update practice questions" ON public.mcq_practice_questions;
DROP POLICY IF EXISTS "Admins delete practice questions" ON public.mcq_practice_questions;
CREATE POLICY "Admins insert practice questions" ON public.mcq_practice_questions FOR INSERT TO authenticated WITH CHECK (private.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins update practice questions" ON public.mcq_practice_questions FOR UPDATE TO authenticated USING (private.has_role(auth.uid(), 'admin')) WITH CHECK (private.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins delete practice questions" ON public.mcq_practice_questions FOR DELETE TO authenticated USING (private.has_role(auth.uid(), 'admin'));

-- storage.objects policies referencing has_role
DROP POLICY IF EXISTS "MCQ images admin insert" ON storage.objects;
DROP POLICY IF EXISTS "MCQ images admin update" ON storage.objects;
DROP POLICY IF EXISTS "MCQ images admin delete" ON storage.objects;
CREATE POLICY "MCQ images admin insert" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'mcq-images' AND private.has_role(auth.uid(), 'admin'));
CREATE POLICY "MCQ images admin update" ON storage.objects FOR UPDATE TO authenticated USING (bucket_id = 'mcq-images' AND private.has_role(auth.uid(), 'admin'));
CREATE POLICY "MCQ images admin delete" ON storage.objects FOR DELETE TO authenticated USING (bucket_id = 'mcq-images' AND private.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "Admins insert flashcard-images" ON storage.objects;
DROP POLICY IF EXISTS "Admins update flashcard-images" ON storage.objects;
DROP POLICY IF EXISTS "Admins delete flashcard-images" ON storage.objects;
CREATE POLICY "Admins insert flashcard-images" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'flashcard-images' AND private.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins update flashcard-images" ON storage.objects FOR UPDATE TO authenticated USING (bucket_id = 'flashcard-images' AND private.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins delete flashcard-images" ON storage.objects FOR DELETE TO authenticated USING (bucket_id = 'flashcard-images' AND private.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "home-banners admin write" ON storage.objects;
CREATE POLICY "home-banners admin write" ON storage.objects FOR ALL TO authenticated USING (bucket_id = 'home-banners' AND private.has_role(auth.uid(), 'admin')) WITH CHECK (bucket_id = 'home-banners' AND private.has_role(auth.uid(), 'admin'));

-- 3) Drop the publicly-exposed SECURITY DEFINER function
DROP FUNCTION IF EXISTS public.has_role(uuid, public.app_role);

-- 4) Add admin-only SELECT policy for the private flashcard-images bucket
CREATE POLICY "Admins select flashcard-images" ON storage.objects FOR SELECT TO authenticated USING (bucket_id = 'flashcard-images' AND private.has_role(auth.uid(), 'admin'));

-- 5) Remove broad public SELECT policies on public buckets (direct GET by URL still works)
DROP POLICY IF EXISTS "MCQ images public read" ON storage.objects;
DROP POLICY IF EXISTS "home-banners public read" ON storage.objects;

-- 6) Add admin-only write policies for the public 'my-images' bucket (reads remain via direct public URL)
DROP POLICY IF EXISTS "my-images admin write" ON storage.objects;
CREATE POLICY "my-images admin write" ON storage.objects FOR ALL TO authenticated USING (bucket_id = 'my-images' AND private.has_role(auth.uid(), 'admin')) WITH CHECK (bucket_id = 'my-images' AND private.has_role(auth.uid(), 'admin'));
