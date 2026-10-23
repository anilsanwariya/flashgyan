-- The scheme register: one record per government scheme, with every story on
-- it (launch, extension, outlay revised, progress) linked, so a new story can
-- print what came before.
CREATE TABLE IF NOT EXISTS public.ca_schemes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  name_hi text NOT NULL DEFAULT '',
  level text NOT NULL DEFAULT 'central' CHECK (level IN ('rajasthan', 'central')),
  -- Other names it has gone by (short forms, older names), to match stories.
  aliases text[] NOT NULL DEFAULT '{}',
  embedding vector(1536),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.ca_schemes TO service_role;
ALTER TABLE public.ca_schemes ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.ca_items
  ADD COLUMN IF NOT EXISTS scheme_id uuid REFERENCES public.ca_schemes (id) ON DELETE SET NULL,
  -- Looked at for the register (linked, or no scheme name to link by).
  ADD COLUMN IF NOT EXISTS scheme_checked boolean NOT NULL DEFAULT false;
CREATE INDEX IF NOT EXISTS ca_items_scheme_idx ON public.ca_items (scheme_id);
