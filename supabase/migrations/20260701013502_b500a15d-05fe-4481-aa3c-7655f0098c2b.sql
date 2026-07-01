-- Restrict profiles SELECT to own row
DROP POLICY IF EXISTS "Authenticated users can view profiles" ON public.profiles;
DROP POLICY IF EXISTS "Profiles are viewable by authenticated users" ON public.profiles;
DROP POLICY IF EXISTS "Authenticated can read profiles" ON public.profiles;
DROP POLICY IF EXISTS "profiles_select_authenticated" ON public.profiles;

CREATE POLICY "Users can view their own profile"
  ON public.profiles FOR SELECT
  TO authenticated
  USING (auth.uid() = id);

CREATE POLICY "Admins can view all profiles"
  ON public.profiles FOR SELECT
  TO authenticated
  USING (private.has_role(auth.uid(), 'admin'::app_role));

-- Public read for flashcard-images (flashcards table is public)
DROP POLICY IF EXISTS "Public read flashcard images" ON storage.objects;
CREATE POLICY "Public read flashcard images"
  ON storage.objects FOR SELECT
  TO anon, authenticated
  USING (bucket_id = 'flashcard-images');

-- Public read for mcq-images (mcq_questions table is public)
DROP POLICY IF EXISTS "Public read mcq images" ON storage.objects;
CREATE POLICY "Public read mcq images"
  ON storage.objects FOR SELECT
  TO anon, authenticated
  USING (bucket_id = 'mcq-images');
