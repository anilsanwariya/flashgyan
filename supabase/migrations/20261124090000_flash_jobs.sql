-- Flashcard studio: AI jobs that run on the server (the AI check, filling
-- explanations), so they keep going with the browser closed. The minute
-- tick (/api/ca/tick) takes a few batches of each job's cards at a time.
CREATE TABLE IF NOT EXISTS public.flash_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  topic_id uuid NOT NULL REFERENCES public.flash_topics(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('check', 'fill')),
  ids jsonb NOT NULL DEFAULT '[]'::jsonb,
  total int NOT NULL DEFAULT 0,
  done int NOT NULL DEFAULT 0,
  found int NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'running', 'done', 'stopped', 'failed')),
  error text,
  fails int NOT NULL DEFAULT 0,
  locked_until timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS flash_jobs_topic_idx ON public.flash_jobs (topic_id, created_at);
CREATE INDEX IF NOT EXISTS flash_jobs_status_idx ON public.flash_jobs (status, created_at);

ALTER TABLE public.flash_jobs ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.flash_jobs FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.flash_jobs TO service_role;
