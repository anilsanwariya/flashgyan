CREATE TABLE IF NOT EXISTS public.ca_item_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id uuid NOT NULL REFERENCES public.ca_items (id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  reason text NOT NULL DEFAULT 'rewrite',
  headline text NOT NULL DEFAULT '',
  snapshot jsonb NOT NULL
);

CREATE INDEX IF NOT EXISTS ca_item_versions_item_idx
  ON public.ca_item_versions (item_id, created_at DESC);

ALTER TABLE public.ca_item_versions ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.ca_item_versions FROM PUBLIC, anon, authenticated;

GRANT ALL ON public.ca_item_versions TO service_role;