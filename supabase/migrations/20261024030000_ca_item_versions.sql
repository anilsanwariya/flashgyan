-- Earlier versions of current affairs stories, kept when a story is written
-- again (a rewrite from highlights, "Write text", or restoring a version), so
-- the admin can compare and restore them. The latest few per story are kept.
CREATE TABLE IF NOT EXISTS public.ca_item_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id uuid NOT NULL REFERENCES public.ca_items (id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  -- What replaced it: 'rewrite', 'write' or 'restore'.
  reason text NOT NULL DEFAULT 'rewrite',
  headline text NOT NULL DEFAULT '',
  -- The story as it was: content, facts, sources and Static Connect books.
  snapshot jsonb NOT NULL
);

CREATE INDEX IF NOT EXISTS ca_item_versions_item_idx
  ON public.ca_item_versions (item_id, created_at DESC);

ALTER TABLE public.ca_item_versions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.ca_item_versions FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.ca_item_versions TO service_role;
