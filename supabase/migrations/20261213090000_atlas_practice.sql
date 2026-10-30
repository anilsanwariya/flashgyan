-- Practice from the Rajasthan atlas: multiple-choice questions made from it
-- (a place's district, a district's division and zone; the notes' own
-- question-and-answer pairs with wrong options from the AI), checked by the
-- editor before they reach MCQ practice as their own sets.
CREATE TABLE IF NOT EXISTS public.atlas_mcqs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Stable across re-making: what it asks about.
  key text NOT NULL UNIQUE,
  kind text NOT NULL,
  -- The practice set it goes in ("Atlas · Forts: which district?").
  set_name text NOT NULL DEFAULT '',
  question jsonb NOT NULL,
  options jsonb NOT NULL,
  -- 1-4.
  answer integer NOT NULL CHECK (answer BETWEEN 1 AND 4),
  explanation jsonb NOT NULL DEFAULT '{}'::jsonb,
  -- Where it comes from (the fact or place).
  source text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'approved', 'rejected')),
  -- A notes question still waiting for its wrong options.
  pending boolean NOT NULL DEFAULT false,
  edited boolean NOT NULL DEFAULT false,
  note text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS atlas_mcqs_status_idx ON public.atlas_mcqs (status, set_name);
ALTER TABLE public.atlas_mcqs ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.atlas_mcqs FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.atlas_mcqs TO service_role;

-- The practice sets made from the atlas (rebuilt on publishing; sets made
-- by hand and from papers are never touched).
ALTER TABLE public.mcq_practice_tests ADD COLUMN IF NOT EXISTS from_atlas boolean NOT NULL DEFAULT false;
