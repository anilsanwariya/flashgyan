-- Flashcard studio: deleted cards kept for 30 days (the whole card as it
-- was), to restore from "Recently deleted".
CREATE TABLE IF NOT EXISTS public.flash_trash (
  id uuid PRIMARY KEY,
  topic_id uuid NOT NULL REFERENCES public.flash_topics(id) ON DELETE CASCADE,
  card jsonb NOT NULL,
  why text NOT NULL DEFAULT '',
  deleted_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS flash_trash_topic_idx ON public.flash_trash (topic_id, deleted_at);

ALTER TABLE public.flash_trash ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.flash_trash FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.flash_trash TO service_role;
