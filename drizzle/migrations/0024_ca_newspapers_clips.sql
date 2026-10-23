CREATE TABLE IF NOT EXISTS public.ca_newspapers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  issue_date date NOT NULL,
  source_name text NOT NULL,
  official boolean NOT NULL DEFAULT false,
  file_path text NOT NULL,
  file_size bigint NOT NULL DEFAULT 0,
  pages integer NOT NULL DEFAULT 0,
  file_deleted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ca_newspapers_date_idx ON public.ca_newspapers (issue_date);
GRANT ALL ON public.ca_newspapers TO service_role;
ALTER TABLE public.ca_newspapers ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.ca_clips (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  newspaper_id uuid NOT NULL REFERENCES public.ca_newspapers (id) ON DELETE CASCADE,
  parts jsonb NOT NULL DEFAULT '[]'::jsonb,
  status text NOT NULL DEFAULT 'new'
    CHECK (status IN ('new', 'read', 'changed', 'skipped', 'failed')),
  error text,
  headline text NOT NULL DEFAULT '',
  source_id uuid REFERENCES public.ca_sources (id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ca_clips_newspaper_idx ON public.ca_clips (newspaper_id, created_at);
CREATE INDEX IF NOT EXISTS ca_clips_source_idx ON public.ca_clips (source_id);
GRANT ALL ON public.ca_clips TO service_role;
ALTER TABLE public.ca_clips ENABLE ROW LEVEL SECURITY;