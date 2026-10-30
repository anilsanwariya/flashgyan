-- The Rajasthan atlas: the editor's places (forts, mines, passes, dams…),
-- their facts (each linked to the districts, tehsils and places it is
-- about), the thematic map layers (physiographic divisions, climate,
-- soils…) and each district's overview page. Imported from the editor's
-- master map and kept up to date in the admin panel; students read only
-- verified facts and published overviews, through the server.
CREATE TABLE IF NOT EXISTS public.atlas_places (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Stable across re-imports: category + spelling-tolerant name.
  key text NOT NULL UNIQUE,
  name_en text NOT NULL,
  name_hi text NOT NULL DEFAULT '',
  -- The full label in the notes ("Kumbhalgarh fort (UNESCO)").
  label_en text NOT NULL DEFAULT '',
  label_hi text NOT NULL DEFAULT '',
  cat text NOT NULL,
  lat double precision NOT NULL,
  lon double precision NOT NULL,
  district text NOT NULL DEFAULT '',
  tehsil text NOT NULL DEFAULT '',
  -- The notes' chapters and maps it appears in: [["ch18","core list"]].
  refs jsonb NOT NULL DEFAULT '[]'::jsonb,
  note_en text NOT NULL DEFAULT '',
  note_hi text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'verified' CHECK (status IN ('verified', 'to_check', 'hidden')),
  source text NOT NULL DEFAULT 'master-map',
  -- Changed in the admin panel: a re-import leaves it as it is.
  edited boolean NOT NULL DEFAULT false,
  in_file boolean NOT NULL DEFAULT true,
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS atlas_places_district_idx ON public.atlas_places (district);
CREATE INDEX IF NOT EXISTS atlas_places_cat_idx ON public.atlas_places (cat);

CREATE TABLE IF NOT EXISTS public.atlas_facts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key text NOT NULL UNIQUE,
  -- "geo" geography, "pol" polity, "his" history, "art" art and culture…
  subject text NOT NULL DEFAULT 'geo',
  chapter_key text NOT NULL DEFAULT '',
  chapter text NOT NULL DEFAULT '',
  heading text NOT NULL DEFAULT '',
  text_en text NOT NULL DEFAULT '',
  text_hi text NOT NULL DEFAULT '',
  -- A table row's column names ("Phase · Union · Date").
  table_head text NOT NULL DEFAULT '',
  -- Kinds, as in the notes: correction 1, trap 2, mnemonic 4, why 8, pyq 16,
  -- answer 32, mcq 64, revision 128, v2 256, anchor 512.
  flags integer NOT NULL DEFAULT 0,
  -- What it is about: D:Jaipur, T:Ajmer|Kishangarh, P:<place key>, S:dune…
  entities text[] NOT NULL DEFAULT '{}',
  position integer NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'verified' CHECK (status IN ('verified', 'to_check', 'hidden')),
  -- The editor's verification note.
  note text NOT NULL DEFAULT '',
  hi_ai boolean NOT NULL DEFAULT false,
  source text NOT NULL DEFAULT 'master-map',
  edited boolean NOT NULL DEFAULT false,
  in_file boolean NOT NULL DEFAULT true,
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS atlas_facts_entities_idx ON public.atlas_facts USING gin (entities);
CREATE INDEX IF NOT EXISTS atlas_facts_chapter_idx ON public.atlas_facts (chapter_key, position);

CREATE TABLE IF NOT EXISTS public.atlas_layers (
  key text PRIMARY KEY,
  name_en text NOT NULL,
  name_hi text NOT NULL DEFAULT '',
  -- The layer drawer's group ("Climate", "Soils"…).
  grp text NOT NULL DEFAULT '',
  note text NOT NULL DEFAULT '',
  -- Drawn from a schematic map in the notes, not surveyed boundaries.
  approx boolean NOT NULL DEFAULT true,
  -- The areas, lines and labels drawn.
  items jsonb NOT NULL DEFAULT '[]'::jsonb,
  position integer NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'verified' CHECK (status IN ('verified', 'to_check', 'hidden')),
  edited boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.atlas_districts (
  -- The district's English name, as on the map ("Sri Ganganagar").
  district text PRIMARY KEY,
  name_hi text NOT NULL DEFAULT '',
  -- From the master map: division, agro-climatic zone, neighbours, HQ.
  meta jsonb NOT NULL DEFAULT '{}'::jsonb,
  -- The overview page: hero, sections of blocks, revision cards.
  overview jsonb,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published')),
  -- Verification notes on the overview.
  checks jsonb NOT NULL DEFAULT '[]'::jsonb,
  versions jsonb NOT NULL DEFAULT '[]'::jsonb,
  published_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.atlas_places ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.atlas_facts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.atlas_layers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.atlas_districts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.atlas_places, public.atlas_facts, public.atlas_layers, public.atlas_districts
  FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.atlas_places, public.atlas_facts, public.atlas_layers, public.atlas_districts
  TO service_role;
