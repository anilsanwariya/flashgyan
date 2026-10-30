-- GK infographics: a subject (Rajasthan Geography) is a series posted over
-- several days, a topic a day, as image cards made only from the editor's
-- books (the SAATHI knowledge base subjects it names). Each day's cards are
-- written once in both languages and posted as two albums, Hindi and
-- English, each in its own fixed design.
CREATE TABLE IF NOT EXISTS public.gk_subjects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name_en text NOT NULL,
  name_hi text NOT NULL DEFAULT '',
  -- The knowledge base subjects its facts come from.
  kb_subjects text[] NOT NULL DEFAULT '{}',
  -- One subject runs at a time.
  status text NOT NULL DEFAULT 'paused' CHECK (status IN ('active', 'paused', 'done')),
  started_on date,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS gk_subjects_one_active ON public.gk_subjects ((status))
  WHERE status = 'active';

CREATE TABLE IF NOT EXISTS public.gk_topics (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  subject_id uuid NOT NULL REFERENCES public.gk_subjects(id) ON DELETE CASCADE,
  position integer NOT NULL DEFAULT 0,
  name_en text NOT NULL,
  name_hi text NOT NULL DEFAULT '',
  -- What the editor wants it to cover ("all the forts with their districts").
  note text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'todo' CHECK (status IN ('todo', 'posted', 'skipped')),
  posted_on date,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS gk_topics_subject_idx ON public.gk_topics (subject_id, position);

CREATE TABLE IF NOT EXISTS public.gk_days (
  day date PRIMARY KEY,
  subject_id uuid REFERENCES public.gk_subjects(id) ON DELETE SET NULL,
  topic_id uuid REFERENCES public.gk_topics(id) ON DELETE SET NULL,
  -- The series' day number ("Day 4").
  day_no integer NOT NULL DEFAULT 1,
  status text NOT NULL DEFAULT 'planning' CHECK (status IN
    ('planning', 'picking', 'writing', 'review', 'rendering', 'scheduled', 'posting', 'posted', 'failed', 'cancelled')),
  -- The AI's card ideas for the topic, and its note on the books' material.
  ideas jsonb NOT NULL DEFAULT '[]'::jsonb,
  material_note text NOT NULL DEFAULT '',
  caption_en text NOT NULL DEFAULT '',
  caption_hi text NOT NULL DEFAULT '',
  scheduled_for timestamptz,
  posted_at timestamptz,
  error text,
  notified text[] NOT NULL DEFAULT '{}',
  locked_until timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.gk_cards (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  day date NOT NULL REFERENCES public.gk_days(day) ON DELETE CASCADE,
  position integer NOT NULL DEFAULT 0,
  -- The idea it was written from, and the card (both languages).
  idea jsonb NOT NULL,
  card jsonb,
  checks jsonb NOT NULL DEFAULT '[]'::jsonb,
  proofed boolean NOT NULL DEFAULT false,
  checked boolean NOT NULL DEFAULT false,
  image_en text,
  image_hi text,
  versions jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS gk_cards_day_idx ON public.gk_cards (day, position);

ALTER TABLE public.gk_subjects ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.gk_topics ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.gk_days ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.gk_cards ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.gk_subjects, public.gk_topics, public.gk_days, public.gk_cards
  FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.gk_subjects, public.gk_topics, public.gk_days, public.gk_cards TO service_role;
