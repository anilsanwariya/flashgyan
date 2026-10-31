-- Atlas "Report a mistake": what students say is wrong in a fact, a place
-- or a district page, for the editor to fix or dismiss. Only the server
-- writes and reads them (sent through a rate-limited server function).
CREATE TABLE IF NOT EXISTS public.atlas_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind text NOT NULL CHECK (kind IN ('fact', 'place', 'district')),
  -- The fact's id, the place's key or the district's name.
  ref text NOT NULL,
  -- What the student saw (the fact's text, the place's name).
  label text NOT NULL DEFAULT '',
  message text NOT NULL,
  correction text NOT NULL DEFAULT '',
  page text NOT NULL DEFAULT '',
  user_id uuid,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'fixed', 'dismissed')),
  note text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS atlas_reports_status_idx ON public.atlas_reports (status, created_at DESC);
ALTER TABLE public.atlas_reports ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.atlas_reports FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.atlas_reports TO service_role;
