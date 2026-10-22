-- Events that run over several days (the Olympics, a COP summit, Khelo India
-- games): their daily stories are linked to them, and when one concludes its
-- complete summary prints in the monthly magazine of the month it ended.
CREATE TABLE IF NOT EXISTS public.ca_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- English name ("Paris Olympics 2024"), and the Hindi one.
  name text NOT NULL,
  name_hi text NOT NULL DEFAULT '',
  kind text NOT NULL DEFAULT 'other'
    CHECK (kind IN ('sports', 'summit', 'conference', 'exhibition', 'election', 'other')),
  place text NOT NULL DEFAULT '',
  starts_on date,
  ends_on date,
  status text NOT NULL DEFAULT 'running' CHECK (status IN ('running', 'concluded')),
  -- The complete summary (the same shape as a story's text), once written.
  summary jsonb,
  embedding vector(1536),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.ca_events TO service_role;
ALTER TABLE public.ca_events ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.ca_items
  ADD COLUMN IF NOT EXISTS event_id uuid REFERENCES public.ca_events (id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS ca_items_event_idx ON public.ca_items (event_id);
