-- The news event in a few fixed English words ("place · subject · what
-- happened"), and its embedding, to find the same story told from another
-- angle or in another source. Empty on older stories.
ALTER TABLE public.ca_items
  ADD COLUMN IF NOT EXISTS story_key text,
  ADD COLUMN IF NOT EXISTS key_embedding vector(1536);
