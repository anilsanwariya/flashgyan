-- Atlas "In the news": current affairs stories (from posted daily issues)
-- linked to the atlas places they are about, by the story's map or by name.
-- The editor can hide a wrong link.
CREATE TABLE IF NOT EXISTS public.atlas_news (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  place_key text NOT NULL,
  item_id uuid NOT NULL REFERENCES public.ca_items (id) ON DELETE CASCADE,
  issue_date date NOT NULL,
  -- "map": a pin of the story's map; "name": the story names it.
  how text NOT NULL CHECK (how IN ('map', 'name')),
  hidden boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (place_key, item_id)
);
CREATE INDEX IF NOT EXISTS atlas_news_place_idx ON public.atlas_news (place_key, issue_date DESC);
CREATE INDEX IF NOT EXISTS atlas_news_date_idx ON public.atlas_news (issue_date DESC);
ALTER TABLE public.atlas_news ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.atlas_news FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.atlas_news TO service_role;
