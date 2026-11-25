-- One open card studio job of each kind per topic: a double click (or two
-- tabs) could start the same job twice, and both would pay for the same
-- cards. Safe to run again. Any duplicates open now are stopped first,
-- keeping the oldest.
UPDATE public.flash_jobs j
SET status = 'stopped', locked_until = NULL, updated_at = now()
WHERE j.status IN ('queued', 'running')
  AND EXISTS (
    SELECT 1 FROM public.flash_jobs o
    WHERE o.topic_id = j.topic_id
      AND o.kind = j.kind
      AND o.status IN ('queued', 'running')
      AND (o.created_at, o.id) < (j.created_at, j.id)
  );

CREATE UNIQUE INDEX IF NOT EXISTS flash_jobs_one_open_idx
  ON public.flash_jobs (topic_id, kind)
  WHERE status IN ('queued', 'running');
