-- Export sets: a question bank filter saved as a set of questions for the
-- app, downloaded as a Hindi and an English sheet. Each question in a set,
-- per language, keeps its order number, the app's id (uploaded back), and
-- what it looked like when last downloaded, so the set knows when to be
-- uploaded again and which app ids to remove. Admin-only (server functions).
CREATE TABLE IF NOT EXISTS public.exam_export_sets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  filter jsonb NOT NULL DEFAULT '{}'::jsonb,
  -- The explanation column's title in each language ("explanation_<title>").
  titles jsonb NOT NULL DEFAULT '{"hi": "व्याख्या", "en": "Explanation"}'::jsonb,
  -- When each language's sheet was last downloaded.
  downloaded jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.exam_export_items (
  set_id uuid NOT NULL REFERENCES public.exam_export_sets (id) ON DELETE CASCADE,
  -- No foreign key: a deleted question's app id is still to be removed.
  question_id uuid NOT NULL,
  lang text NOT NULL CHECK (lang IN ('hi', 'en')),
  position integer NOT NULL,
  app_id text NOT NULL DEFAULT '',
  -- The row as last downloaded (its text, options, key and explanation).
  sig text NOT NULL DEFAULT '',
  -- Short text, for the list of questions to remove from the app.
  label text NOT NULL DEFAULT '',
  -- Left the set (or deleted) since: to be removed from the app.
  gone_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (set_id, question_id, lang)
);

ALTER TABLE public.exam_export_sets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.exam_export_items ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.exam_export_sets FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.exam_export_items FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.exam_export_sets TO service_role;
GRANT ALL ON public.exam_export_items TO service_role;
