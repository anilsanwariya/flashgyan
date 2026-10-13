ALTER POLICY "home_settings public read" ON public.home_settings TO anon, authenticated USING (id = 1);
DROP POLICY "Public read flashcard images" ON storage.objects;
DROP POLICY "Public read mcq images" ON storage.objects;
CREATE POLICY "Admins select mcq-images" ON storage.objects FOR SELECT TO authenticated USING (bucket_id = 'mcq-images' AND private.has_role(auth.uid(), 'admin'::public.app_role));