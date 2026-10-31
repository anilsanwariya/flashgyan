-- Atlas themes: when a place's event happened (years; BCE negative), a
-- fair's months (1–12), and places suggested from the notes for the editor
-- to accept or reject (students see only accepted, verified places).
ALTER TABLE public.atlas_places ADD COLUMN IF NOT EXISTS era_from integer;
ALTER TABLE public.atlas_places ADD COLUMN IF NOT EXISTS era_to integer;
ALTER TABLE public.atlas_places ADD COLUMN IF NOT EXISTS months smallint[] NOT NULL DEFAULT '{}';

CREATE TABLE IF NOT EXISTS public.atlas_suggestions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- One suggestion per thing: "new:<cat>:<name>" or "update:<place key>".
  key text NOT NULL UNIQUE,
  kind text NOT NULL CHECK (kind IN ('new', 'update')),
  place_key text NOT NULL DEFAULT '',
  data jsonb NOT NULL,
  -- The facts it was read from.
  facts uuid[] NOT NULL DEFAULT '{}',
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'accepted', 'rejected')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS atlas_suggestions_status_idx ON public.atlas_suggestions (status);
ALTER TABLE public.atlas_suggestions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.atlas_suggestions FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.atlas_suggestions TO service_role;
