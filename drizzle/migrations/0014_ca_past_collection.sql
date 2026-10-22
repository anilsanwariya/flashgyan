-- Collecting news from past dates: a collection over a date range reads the
-- watched websites one day at a time and files the stories under their
-- real dates, so monthly and custom magazines get them too. Daily issues
-- already posted are not changed.
CREATE TABLE IF NOT EXISTS public.ca_backfills (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  date_from date NOT NULL,
  date_to date NOT NULL,
  -- The websites it reads.
  sites uuid[] NOT NULL DEFAULT '{}',
  status text NOT NULL DEFAULT 'running' CHECK (status IN ('running', 'paused', 'done', 'cancelled')),
  -- The next date to start (past date_to once every date has started).
  next_date date NOT NULL,
  started_by text NOT NULL DEFAULT 'admin',
  error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  CHECK (date_from <= date_to)
);
GRANT ALL ON public.ca_backfills TO service_role;
ALTER TABLE public.ca_backfills ENABLE ROW LEVEL SECURITY;

-- A day's collection is the evening's ("daily") or part of a past-date one.
ALTER TABLE public.ca_runs ADD COLUMN IF NOT EXISTS mode text NOT NULL DEFAULT 'daily';
ALTER TABLE public.ca_runs
  ADD COLUMN IF NOT EXISTS backfill_id uuid REFERENCES public.ca_backfills (id) ON DELETE SET NULL;

-- Stories found by a past-date collection, after the day's issue.
ALTER TABLE public.ca_items ADD COLUMN IF NOT EXISTS collected_later boolean NOT NULL DEFAULT false;

-- The evening's collection goes before past dates.
CREATE OR REPLACE FUNCTION public.ca_claim_run(p_seconds integer DEFAULT 60)
RETURNS SETOF public.ca_runs
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  UPDATE public.ca_runs
  SET locked_until = now() + make_interval(secs => p_seconds), updated_at = now()
  WHERE id = (
    SELECT id FROM public.ca_runs
    WHERE status = 'running' AND (locked_until IS NULL OR locked_until < now())
    ORDER BY (mode = 'past'), issue_date
    LIMIT 1
    FOR UPDATE SKIP LOCKED
  )
  RETURNING *
$$;
REVOKE EXECUTE ON FUNCTION public.ca_claim_run(integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ca_claim_run(integer) TO service_role;
