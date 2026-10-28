-- Infographics: "Words in the News". Each day the AI suggests words from
-- the day's collected papers; the editor picks some, the AI writes and
-- proofreads their cards, the editor reviews them, and the cards are made
-- into images and posted to the Telegram channel as one album.
-- ig_days: one row per day and its progress. ig_words: every suggested,
-- picked, reserved and posted word (the posted ones are the history that
-- keeps words from repeating). Used only through the server.
CREATE TABLE IF NOT EXISTS public.ig_days (
  day date PRIMARY KEY,
  status text NOT NULL DEFAULT 'suggesting'
    CHECK (status IN ('suggesting','picking','writing','review','rendering','scheduled','posting','posted','failed','cancelled')),
  -- Which suggestion languages are done ('en', 'hi').
  suggested text[] NOT NULL DEFAULT '{}',
  design text,
  design_reason text NOT NULL DEFAULT '',
  caption text NOT NULL DEFAULT '',
  scheduled_for timestamptz,
  posted_at timestamptz,
  telegram_message_id bigint,
  error text,
  -- Telegram notes already sent ('suggested', 'review').
  notified text[] NOT NULL DEFAULT '{}',
  locked_until timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ig_days_status_idx ON public.ig_days (status, scheduled_for);

CREATE TABLE IF NOT EXISTS public.ig_words (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- The day it was suggested on, and the day it is used on.
  day date NOT NULL,
  for_day date,
  lang text NOT NULL CHECK (lang IN ('en','hi')),
  word text NOT NULL,
  -- The dictionary form and the key that stops repeats.
  base text NOT NULL DEFAULT '',
  key text NOT NULL,
  pos_hint text NOT NULL DEFAULT '',
  sentence text NOT NULL DEFAULT '',
  paper text NOT NULL DEFAULT '',
  source_id uuid,
  why text NOT NULL DEFAULT '',
  own boolean NOT NULL DEFAULT false,
  status text NOT NULL DEFAULT 'suggested'
    CHECK (status IN ('suggested','picked','reserve','dropped','posted','released')),
  position int NOT NULL DEFAULT 0,
  card jsonb,
  checks jsonb NOT NULL DEFAULT '[]'::jsonb,
  -- Proofread by the AI and the dictionaries; ticked by the editor.
  proofed boolean NOT NULL DEFAULT false,
  checked boolean NOT NULL DEFAULT false,
  image_path text,
  posted_on date,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ig_words_day_idx ON public.ig_words (day);
CREATE INDEX IF NOT EXISTS ig_words_for_day_idx ON public.ig_words (for_day);
CREATE INDEX IF NOT EXISTS ig_words_key_idx ON public.ig_words (key, status);
CREATE INDEX IF NOT EXISTS ig_words_status_idx ON public.ig_words (status, day);

ALTER TABLE public.ig_days ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ig_words ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.ig_days FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.ig_words FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.ig_days TO service_role;
GRANT ALL ON public.ig_words TO service_role;
