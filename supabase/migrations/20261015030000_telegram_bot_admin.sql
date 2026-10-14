-- Telegram bot managed from the admin panel: commands, automatic replies,
-- editable messages/settings, broadcasts with segments and scheduling, and a
-- usage log for stats. All tables are service-role only (admin server functions
-- and the bot edge function); nothing here is readable by students.

-- 1) Users: blocked state (from my_chat_member updates and failed sends) and
--    Telegram's language code for language-targeted broadcasts.
ALTER TABLE public.bot_users
  ADD COLUMN IF NOT EXISTS blocked boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS language_code text;

-- 2) Key/value settings: welcome and fallback messages, button labels, menu
--    button, webhook secret, test-send chat ids, free-text-to-SAATHI switch.
CREATE TABLE IF NOT EXISTS public.bot_settings (
  key text PRIMARY KEY,
  value jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.bot_settings TO service_role;
ALTER TABLE public.bot_settings ENABLE ROW LEVEL SECURITY;

-- 3) Commands. action:
--    builtin  -> runs an existing feature (builtin = study | flashcards | mcq | ask | help)
--    message  -> replies with text and optional photo/document and buttons
CREATE TABLE IF NOT EXISTS public.bot_commands (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  command text NOT NULL UNIQUE CHECK (command ~ '^[a-z0-9_]{1,32}$'),
  description_en text NOT NULL DEFAULT '',
  description_hi text NOT NULL DEFAULT '',
  action text NOT NULL DEFAULT 'message' CHECK (action IN ('builtin', 'message')),
  builtin text CHECK (builtin IS NULL OR builtin IN ('study', 'flashcards', 'mcq', 'ask', 'help')),
  response_text text NOT NULL DEFAULT '',
  media_url text,
  media_type text CHECK (media_type IS NULL OR media_type IN ('photo', 'document')),
  buttons jsonb NOT NULL DEFAULT '[]',
  show_in_menu boolean NOT NULL DEFAULT true,
  -- 'private': only in direct chats; 'all': also in groups
  scope text NOT NULL DEFAULT 'private' CHECK (scope IN ('private', 'all')),
  enabled boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 100,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.bot_commands TO service_role;
ALTER TABLE public.bot_commands ENABLE ROW LEVEL SECURITY;

-- The commands the bot already had, so they can be renamed, described and
-- reordered from the admin panel.
INSERT INTO public.bot_commands (command, description_en, description_hi, action, builtin, scope, sort_order)
VALUES
  ('start', 'Start the bot', 'बॉट शुरू करें', 'builtin', 'study', 'private', 0),
  ('study', 'Practise flashcards and MCQs', 'फ्लैशकार्ड और MCQ अभ्यास', 'builtin', 'study', 'private', 10),
  ('flashcards', 'Practise flashcards', 'फ्लैशकार्ड अभ्यास', 'builtin', 'flashcards', 'private', 20),
  ('mcq', 'Take an MCQ quiz', 'MCQ क्विज़ दें', 'builtin', 'mcq', 'private', 30),
  ('ask', 'Ask SAATHI a question', 'SAATHI से प्रश्न पूछें', 'builtin', 'ask', 'all', 40),
  ('help', 'Show all commands', 'सभी कमांड देखें', 'builtin', 'help', 'private', 90)
ON CONFLICT (command) DO NOTHING;

-- 4) Keyword auto-replies for plain (non-command) messages in private chats.
CREATE TABLE IF NOT EXISTS public.bot_auto_replies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  keywords text[] NOT NULL DEFAULT '{}',
  match_type text NOT NULL DEFAULT 'contains' CHECK (match_type IN ('contains', 'exact')),
  response_text text NOT NULL DEFAULT '',
  media_url text,
  media_type text CHECK (media_type IS NULL OR media_type IN ('photo', 'document')),
  buttons jsonb NOT NULL DEFAULT '[]',
  enabled boolean NOT NULL DEFAULT true,
  priority integer NOT NULL DEFAULT 100,
  hits integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.bot_auto_replies TO service_role;
ALTER TABLE public.bot_auto_replies ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.bot_auto_reply_hit(reply_id uuid)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE public.bot_auto_replies SET hits = hits + 1 WHERE id = reply_id;
$$;
REVOKE EXECUTE ON FUNCTION public.bot_auto_reply_hit(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.bot_auto_reply_hit(uuid) TO service_role;

-- 5) Usage log for stats and subject-based broadcast segments.
--    kind: start | command | auto_reply | saathi | flashcards | mcq | fallback
CREATE TABLE IF NOT EXISTS public.bot_events (
  id bigserial PRIMARY KEY,
  chat_id bigint NOT NULL,
  kind text NOT NULL,
  name text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.bot_events TO service_role;
GRANT USAGE, SELECT ON SEQUENCE public.bot_events_id_seq TO service_role;
ALTER TABLE public.bot_events ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS bot_events_created_idx ON public.bot_events (created_at);
CREATE INDEX IF NOT EXISTS bot_events_kind_name_idx ON public.bot_events (kind, name);

-- 6) Broadcasts. segment: {"type": "all"} | {"type": "active", "days": n}
--    | {"type": "language", "language": "hi"} | {"type": "subject", "subject": "..."}
--    Sending walks users in chat_id order from `cursor`, so it can resume.
CREATE TABLE IF NOT EXISTS public.bot_broadcasts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  text text NOT NULL DEFAULT '',
  media_url text,
  media_type text CHECK (media_type IS NULL OR media_type IN ('photo', 'document')),
  buttons jsonb NOT NULL DEFAULT '[]',
  segment jsonb NOT NULL DEFAULT '{"type": "all"}',
  status text NOT NULL DEFAULT 'scheduled'
    CHECK (status IN ('scheduled', 'sending', 'done', 'cancelled')),
  scheduled_at timestamptz NOT NULL DEFAULT now(),
  started_at timestamptz,
  finished_at timestamptz,
  cursor bigint,
  locked_until timestamptz,
  total integer NOT NULL DEFAULT 0,
  sent integer NOT NULL DEFAULT 0,
  failed integer NOT NULL DEFAULT 0,
  blocked integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.bot_broadcasts TO service_role;
ALTER TABLE public.bot_broadcasts ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS bot_broadcasts_due_idx ON public.bot_broadcasts (status, scheduled_at);

-- Claims one due broadcast for up to `lock_seconds`, so two senders never
-- process the same broadcast at once. Returns nothing when none is due.
CREATE OR REPLACE FUNCTION public.bot_claim_broadcast(lock_seconds integer DEFAULT 60)
RETURNS SETOF public.bot_broadcasts
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE public.bot_broadcasts b
  SET status = 'sending',
      started_at = coalesce(b.started_at, now()),
      locked_until = now() + make_interval(secs => lock_seconds)
  WHERE b.id = (
    SELECT id FROM public.bot_broadcasts
    WHERE status IN ('scheduled', 'sending')
      AND scheduled_at <= now()
      AND (locked_until IS NULL OR locked_until < now())
    ORDER BY scheduled_at
    LIMIT 1
    FOR UPDATE SKIP LOCKED
  )
  RETURNING b.*;
$$;
REVOKE EXECUTE ON FUNCTION public.bot_claim_broadcast(integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.bot_claim_broadcast(integer) TO service_role;

-- Recipients for a segment, after `after_chat_id`, in chat_id order. Only
-- private chats (positive ids; groups the bot is in have negative ids), and
-- users who blocked the bot are skipped.
CREATE OR REPLACE FUNCTION public.bot_segment_users(segment jsonb, after_chat_id bigint, max_rows integer)
RETURNS TABLE(chat_id bigint)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT u.chat_id
  FROM public.bot_users u
  WHERE NOT u.blocked
    AND u.chat_id > 0
    AND (after_chat_id IS NULL OR u.chat_id > after_chat_id)
    AND CASE coalesce(segment->>'type', 'all')
      WHEN 'active' THEN u.last_active >= now() - make_interval(days => coalesce((segment->>'days')::int, 7))
      WHEN 'language' THEN coalesce(u.language_code, '') LIKE (segment->>'language') || '%'
      WHEN 'subject' THEN EXISTS (
        SELECT 1 FROM public.bot_events e
        WHERE e.chat_id = u.chat_id
          AND e.kind IN ('flashcards', 'mcq')
          AND e.name = segment->>'subject'
      )
      ELSE true
    END
  ORDER BY u.chat_id
  LIMIT max_rows;
$$;
REVOKE EXECUTE ON FUNCTION public.bot_segment_users(jsonb, bigint, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.bot_segment_users(jsonb, bigint, integer) TO service_role;

CREATE OR REPLACE FUNCTION public.bot_segment_count(segment jsonb)
RETURNS integer
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT count(*)::int FROM public.bot_segment_users(segment, NULL, 2147483647);
$$;
REVOKE EXECUTE ON FUNCTION public.bot_segment_count(jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.bot_segment_count(jsonb) TO service_role;

-- 7) Stats for the admin panel.
CREATE OR REPLACE FUNCTION public.bot_stats(days integer DEFAULT 30)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH since AS (SELECT now() - make_interval(days => days) AS t)
  SELECT jsonb_build_object(
    'users_total', (SELECT count(*) FROM public.bot_users),
    'users_blocked', (SELECT count(*) FROM public.bot_users WHERE blocked),
    'users_active_7d', (SELECT count(*) FROM public.bot_users WHERE last_active >= now() - interval '7 days'),
    'new_users', (SELECT count(*) FROM public.bot_users, since WHERE created_at >= since.t),
    'saathi_questions', (SELECT count(*) FROM public.bot_events, since WHERE kind = 'saathi' AND created_at >= since.t),
    'daily', coalesce((
      SELECT jsonb_agg(jsonb_build_object('day', d.day, 'active', d.active, 'events', d.events) ORDER BY d.day)
      FROM (
        SELECT date_trunc('day', created_at)::date AS day,
               count(DISTINCT chat_id) AS active,
               count(*) AS events
        FROM public.bot_events, since
        WHERE created_at >= since.t
        GROUP BY 1
      ) d
    ), '[]'::jsonb),
    'top', coalesce((
      SELECT jsonb_agg(jsonb_build_object('kind', t.kind, 'name', t.name, 'count', t.n) ORDER BY t.n DESC)
      FROM (
        SELECT kind, coalesce(name, '') AS name, count(*) AS n
        FROM public.bot_events, since
        WHERE created_at >= since.t AND kind IN ('command', 'auto_reply', 'flashcards', 'mcq')
        GROUP BY kind, coalesce(name, '')
        ORDER BY n DESC
        LIMIT 20
      ) t
    ), '[]'::jsonb)
  );
$$;
REVOKE EXECUTE ON FUNCTION public.bot_stats(integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.bot_stats(integer) TO service_role;

-- 8) Public bucket for broadcast/command images and PDFs (Telegram downloads
--    them by URL, so they must be public). Uploads go through an admin-only
--    server function using the service role; no client write policies.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'storage' AND table_name = 'buckets'
  ) THEN
    INSERT INTO storage.buckets (id, name, public)
    VALUES ('bot-media', 'bot-media', true)
    ON CONFLICT (id) DO NOTHING;
  END IF;
END $$;
