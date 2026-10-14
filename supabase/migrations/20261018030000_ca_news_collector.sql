-- Current affairs: automatic collection from watched websites. Every evening
-- (or on demand) a run reads each site's news list, the AI picks the
-- exam-relevant headlines, their text is fetched and saved as the day's
-- sources, and the usual pipeline writes the draft for admin review.
-- Service-role only. Safe to run more than once.

-- 1) Websites to watch.
CREATE TABLE IF NOT EXISTS public.ca_watch_sites (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  url text NOT NULL UNIQUE,
  name text NOT NULL,
  section text NOT NULL DEFAULT 'news' CHECK (section IN ('editorial', 'news', 'pib', 'dipr', 'other')),
  language text NOT NULL DEFAULT 'Hindi' CHECK (language IN ('Hindi', 'English', 'Bilingual')),
  -- Most articles taken from this site per run.
  max_articles integer NOT NULL DEFAULT 10 CHECK (max_articles BETWEEN 1 AND 50),
  enabled boolean NOT NULL DEFAULT true,
  -- How the last run read the site (rss, page or search) and what went wrong.
  last_method text,
  last_found integer,
  last_error text,
  last_run_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO public.ca_watch_sites (url, name, section, language) VALUES
  ('https://dipr.rajasthan.gov.in/pages/sm/government-order/attachments/14928/85/10/2583', 'DIPR Rajasthan', 'dipr', 'Hindi'),
  ('https://www.patrika.com/', 'Rajasthan Patrika', 'news', 'Hindi'),
  ('https://www.jagran.com/rajasthan/jaipur', 'Dainik Jagran (Jaipur)', 'news', 'Hindi'),
  ('https://www.bhaskar.com/', 'Dainik Bhaskar', 'news', 'Hindi'),
  ('https://indianexpress.com/', 'The Indian Express', 'news', 'English')
ON CONFLICT (url) DO NOTHING;

-- 2) Collection runs, one per issue date. A tick claims the run with a short
--    lock so two ticks never work on it at the same time.
CREATE TABLE IF NOT EXISTS public.ca_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  issue_date date NOT NULL UNIQUE,
  status text NOT NULL DEFAULT 'running' CHECK (status IN ('running', 'done', 'failed')),
  started_by text NOT NULL DEFAULT 'schedule',
  -- Sites already read in this run.
  discovered uuid[] NOT NULL DEFAULT '{}',
  locked_until timestamptz,
  notified boolean NOT NULL DEFAULT false,
  error text,
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- 3) Articles found on the watched sites.
CREATE TABLE IF NOT EXISTS public.ca_articles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id uuid REFERENCES public.ca_runs (id) ON DELETE CASCADE,
  site_id uuid REFERENCES public.ca_watch_sites (id) ON DELETE SET NULL,
  issue_date date NOT NULL,
  url text NOT NULL UNIQUE,
  title text NOT NULL,
  published_at timestamptz,
  -- found -> selected | skipped -> (parsing) -> fetched | failed
  status text NOT NULL DEFAULT 'found'
    CHECK (status IN ('found', 'selected', 'skipped', 'parsing', 'fetched', 'failed')),
  reason text,
  parse_job text,
  source_id uuid REFERENCES public.ca_sources (id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ca_articles_run_idx ON public.ca_articles (run_id, status);

-- Sources keep the page they came from.
ALTER TABLE public.ca_sources ADD COLUMN IF NOT EXISTS url text;

GRANT ALL ON public.ca_watch_sites, public.ca_runs, public.ca_articles TO service_role;
ALTER TABLE public.ca_watch_sites ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ca_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ca_articles ENABLE ROW LEVEL SECURITY;

-- 4) Claims the running collection for about a minute.
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
    ORDER BY issue_date
    LIMIT 1
    FOR UPDATE SKIP LOCKED
  )
  RETURNING *
$$;
REVOKE EXECUTE ON FUNCTION public.ca_claim_run(integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ca_claim_run(integer) TO service_role;
