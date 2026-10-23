-- Newspaper clipping: a day's full newspaper (or Sujas) uploaded as a PDF,
-- and the articles the editor boxes on its pages. Each clipping is read into
-- its own source; its images stay with it, for checking and for story images.
CREATE TABLE IF NOT EXISTS public.ca_newspapers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  issue_date date NOT NULL,
  source_name text NOT NULL,
  -- A government paper (Sujas): its stories count as official.
  official boolean NOT NULL DEFAULT false,
  -- The PDF, in the private ca-clips bucket; removed after 30 days (the
  -- clippings stay).
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
  -- The boxes, in reading order (an article continued on another page has
  -- several): [{"page", "x", "y", "w", "h" (0-1 of the page), "path"}].
  parts jsonb NOT NULL DEFAULT '[]'::jsonb,
  -- new: waiting to be read; read: its source made; changed: boxes changed
  -- after reading; skipped: not news (an ad); failed.
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

-- Private bucket for the newspapers and their clippings: only the server
-- reads it, and the admin pages get signed links.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'storage' AND table_name = 'buckets'
  ) THEN
    INSERT INTO storage.buckets (id, name, public)
    VALUES ('ca-clips', 'ca-clips', false)
    ON CONFLICT (id) DO NOTHING;
  END IF;
END $$;
