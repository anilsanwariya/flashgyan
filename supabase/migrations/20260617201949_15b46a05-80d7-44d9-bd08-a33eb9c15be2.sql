
CREATE POLICY "Admins insert flashcard-images"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'flashcard-images' AND public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins update flashcard-images"
  ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'flashcard-images' AND public.has_role(auth.uid(), 'admin'))
  WITH CHECK (bucket_id = 'flashcard-images' AND public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins delete flashcard-images"
  ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'flashcard-images' AND public.has_role(auth.uid(), 'admin'));
