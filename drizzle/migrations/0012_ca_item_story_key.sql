ALTER TABLE public.ca_items
  ADD COLUMN IF NOT EXISTS story_key text,
  ADD COLUMN IF NOT EXISTS key_embedding vector(1536);