CREATE POLICY "Service role manages ca-clips files"
ON storage.objects
FOR ALL
TO service_role
USING (bucket_id = 'ca-clips')
WITH CHECK (bucket_id = 'ca-clips');