-- Revision in the students' daily quiz: each question a student got wrong
-- (when it comes back), and where the student is in the posted monthly's
-- practice set and one-liners.
CREATE TABLE IF NOT EXISTS public.bot_revision (
  chat_id bigint NOT NULL,
  key text NOT NULL,
  mcq jsonb NOT NULL,
  box integer NOT NULL DEFAULT 0,
  due date NOT NULL,
  misses integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (chat_id, key)
);

CREATE INDEX IF NOT EXISTS bot_revision_due_idx ON public.bot_revision (chat_id, due);

ALTER TABLE public.bot_revision ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.bot_revision FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.bot_revision TO service_role;

ALTER TABLE public.bot_daily_quiz ADD COLUMN IF NOT EXISTS revision jsonb;
