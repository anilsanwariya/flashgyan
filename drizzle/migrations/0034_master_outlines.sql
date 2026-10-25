-- Master subject outlines: our own chapter > topic > subtopic tree per
-- subject section, which the notes follow; and the links from each official
-- syllabus line (of any exam) to the topics that cover it, so one outline
-- serves every exam that asks the subject. Admin-only.
CREATE TABLE IF NOT EXISTS public.master_topics (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  section text NOT NULL,
  parent_id uuid REFERENCES public.master_topics(id) ON DELETE CASCADE,
  level text NOT NULL DEFAULT 'topic' CHECK (level IN ('chapter', 'topic', 'subtopic')),
  position integer NOT NULL DEFAULT 0,
  name_en text NOT NULL DEFAULT '',
  name_hi text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS master_topics_section_idx ON public.master_topics (section, parent_id, position);

CREATE TABLE IF NOT EXISTS public.syllabus_links (
  node_id uuid NOT NULL REFERENCES public.syllabus_nodes(id) ON DELETE CASCADE,
  topic_id uuid NOT NULL REFERENCES public.master_topics(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (node_id, topic_id)
);

CREATE INDEX IF NOT EXISTS syllabus_links_topic_idx ON public.syllabus_links (topic_id);

ALTER TABLE public.master_topics ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.syllabus_links ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.master_topics FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.syllabus_links FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.master_topics TO service_role;
GRANT ALL ON public.syllabus_links TO service_role;
