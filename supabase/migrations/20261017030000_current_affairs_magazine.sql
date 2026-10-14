-- Current affairs magazine: daily sources uploaded by admins (editorials,
-- news, PIB, DIPR/Sujas, other government releases), the news items the AI
-- extracts from them, daily and monthly issues (PDF + scheduled Telegram
-- channel post) and corrections when later sources change a fact. All tables
-- are service-role only; admins use them through the admin panel. Safe to run
-- more than once.

-- 1) Uploaded sources, one row per file or pasted text.
CREATE TABLE IF NOT EXISTS public.ca_sources (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  issue_date date NOT NULL,
  section text NOT NULL CHECK (section IN ('editorial', 'news', 'pib', 'dipr', 'other')),
  source_name text NOT NULL DEFAULT '',
  title text NOT NULL,
  content text NOT NULL CHECK (length(content) BETWEEN 1 AND 600000),
  chunks integer NOT NULL DEFAULT 1,
  chunks_done integer NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'extracting', 'done', 'error')),
  error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ca_sources_date_idx ON public.ca_sources (issue_date);

-- 2) News items. "facts" keep the exact source passage behind each fact
--    (verified = the passage was found in the source text). "content" holds the
--    bilingual magazine text written from those facts; "context" is background
--    from the SAATHI knowledge base.
CREATE TABLE IF NOT EXISTS public.ca_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  issue_date date NOT NULL,
  category text NOT NULL DEFAULT 'national',
  headline text NOT NULL,
  facts jsonb NOT NULL DEFAULT '[]',
  source_ids uuid[] NOT NULL DEFAULT '{}',
  importance smallint NOT NULL DEFAULT 2 CHECK (importance BETWEEN 1 AND 3),
  rajasthan boolean NOT NULL DEFAULT false,
  content jsonb,
  context_sources jsonb NOT NULL DEFAULT '[]',
  syllabus_topic_id text,
  unit text,
  embedding vector(1536),
  needs_enrich boolean NOT NULL DEFAULT true,
  enrich_error text,
  -- An earlier item about the same story (a follow-up or update).
  related_item_id uuid REFERENCES public.ca_items (id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'included' CHECK (status IN ('included', 'dropped')),
  position integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ca_items_date_idx ON public.ca_items (issue_date, status);

-- 3) Issues: one per day and one per month.
CREATE TABLE IF NOT EXISTS public.ca_issues (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind text NOT NULL CHECK (kind IN ('daily', 'monthly')),
  -- The day, or the first day of the month.
  period date NOT NULL,
  status text NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'scheduled', 'posting', 'posted', 'failed', 'cancelled')),
  pdf_path text,
  pdf_url text,
  item_count integer NOT NULL DEFAULT 0,
  caption text,
  scheduled_for timestamptz,
  approved_at timestamptz,
  posted_at timestamptz,
  telegram_message_id bigint,
  error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (kind, period)
);

-- 4) Corrections: a later source changed a fact in an earlier item. Approved
--    corrections are applied to the item and listed in the monthly magazine.
CREATE TABLE IF NOT EXISTS public.ca_corrections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id uuid NOT NULL REFERENCES public.ca_items (id) ON DELETE CASCADE,
  from_item_id uuid REFERENCES public.ca_items (id) ON DELETE SET NULL,
  changes jsonb NOT NULL DEFAULT '[]',
  summary_en text NOT NULL DEFAULT '',
  summary_hi text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  created_at timestamptz NOT NULL DEFAULT now(),
  decided_at timestamptz
);
CREATE INDEX IF NOT EXISTS ca_corrections_item_idx ON public.ca_corrections (item_id);

GRANT ALL ON public.ca_sources, public.ca_items, public.ca_issues, public.ca_corrections TO service_role;
ALTER TABLE public.ca_sources ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ca_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ca_issues ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ca_corrections ENABLE ROW LEVEL SECURITY;

-- 5) Items about the same story within a date range, most similar first.
CREATE OR REPLACE FUNCTION public.ca_similar_items(
  p_embedding vector,
  p_from date,
  p_to date,
  p_exclude uuid DEFAULT NULL,
  p_count integer DEFAULT 3
)
RETURNS TABLE (id uuid, issue_date date, headline text, similarity double precision)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT i.id, i.issue_date, i.headline, 1 - (i.embedding <=> p_embedding) AS similarity
  FROM public.ca_items i
  WHERE i.embedding IS NOT NULL
    AND i.status = 'included'
    AND i.issue_date BETWEEN p_from AND p_to
    AND (p_exclude IS NULL OR i.id <> p_exclude)
  ORDER BY i.embedding <=> p_embedding
  LIMIT greatest(1, least(p_count, 10))
$$;
REVOKE EXECUTE ON FUNCTION public.ca_similar_items(vector, date, date, uuid, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ca_similar_items(vector, date, date, uuid, integer) TO service_role;

-- 6) Claims the next issue that is due for posting, so two runs never post
--    the same issue twice.
CREATE OR REPLACE FUNCTION public.ca_claim_due_issue()
RETURNS SETOF public.ca_issues
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  UPDATE public.ca_issues
  SET status = 'posting', updated_at = now()
  WHERE id = (
    SELECT id FROM public.ca_issues
    WHERE status = 'scheduled' AND scheduled_for <= now() AND pdf_path IS NOT NULL
    ORDER BY scheduled_for
    LIMIT 1
    FOR UPDATE SKIP LOCKED
  )
  RETURNING *
$$;
REVOKE EXECUTE ON FUNCTION public.ca_claim_due_issue() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ca_claim_due_issue() TO service_role;

-- 7) Public bucket for the magazine PDFs and logos (they are posted publicly).
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'storage' AND table_name = 'buckets'
  ) THEN
    INSERT INTO storage.buckets (id, name, public)
    VALUES ('ca-magazines', 'ca-magazines', true)
    ON CONFLICT (id) DO NOTHING;
  END IF;
END $$;
