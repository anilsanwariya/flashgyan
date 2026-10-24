-- Newspaper clipping, finished in the background: after "Done" the server
-- reads the clippings, merges the day's duplicates and writes the stories,
-- a step at a time (the collection tick, or the Daily page while open).
-- {"state": "reading" | "merging" | "writing" | "done", "read", "write_ids",
--  "written", "failed", "error", "at"}; null: nothing to do.
ALTER TABLE public.ca_newspapers ADD COLUMN IF NOT EXISTS work jsonb;
ALTER TABLE public.ca_newspapers ADD COLUMN IF NOT EXISTS locked_until timestamptz;
