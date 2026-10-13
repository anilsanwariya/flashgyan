-- SAATHI knowledge base: topics, original source text, duplicate detection,
-- subject clean-up, language-aware search and a health report for admins.

-- 1) New columns.
--    topic: optional finer label (matches flashcard_decks.topic).
--    source_markdown: the full original text on parent rows, used to rebuild chunks.
--    content_hash: finds identical chunks across documents.
ALTER TABLE public.saathi_knowledge
  ADD COLUMN IF NOT EXISTS topic text,
  ADD COLUMN IF NOT EXISTS source_markdown text,
  ADD COLUMN IF NOT EXISTS content_hash text GENERATED ALWAYS AS (md5(content)) STORED;

CREATE INDEX IF NOT EXISTS saathi_knowledge_content_hash_idx
  ON public.saathi_knowledge (content_hash)
  WHERE parent_id IS NOT NULL;

-- 2) Merge subject spelling variants ("Polity", "polity", "Polity ") into the most
--    used spelling, so students see one entry per subject.
WITH variants AS (
  SELECT
    subject,
    lower(regexp_replace(btrim(subject), '\s+', ' ', 'g')) AS norm,
    count(*) AS uses
  FROM public.saathi_knowledge
  GROUP BY subject
),
canonical AS (
  SELECT DISTINCT ON (norm) norm, regexp_replace(btrim(subject), '\s+', ' ', 'g') AS subject
  FROM variants
  ORDER BY norm, uses DESC, subject
)
UPDATE public.saathi_knowledge k
SET subject = c.subject
FROM canonical c
WHERE lower(regexp_replace(btrim(k.subject), '\s+', ' ', 'g')) = c.norm
  AND k.subject IS DISTINCT FROM c.subject;

-- 3) Search now also returns topic and medium (medium lets callers prefer chunks in
--    the student's language). The return type changes, so drop and recreate.
DROP FUNCTION IF EXISTS public.match_saathi_chunks(text, vector, integer, text[]);

CREATE FUNCTION public.match_saathi_chunks(
  query_text text,
  query_embedding vector,
  match_count integer DEFAULT 8,
  subject_filters text[] DEFAULT NULL
)
RETURNS TABLE(
  id uuid,
  title text,
  subject text,
  topic text,
  medium text,
  content text,
  source_file text,
  vector_score double precision,
  keyword_score double precision,
  similarity double precision
)
LANGUAGE sql
STABLE
SET search_path TO 'public'
AS $function$
  with vector_search as (
    select k.id, 1 - (k.embedding <=> query_embedding) as score
    from public.saathi_knowledge k
    where k.embedding is not null
      and k.parent_id is not null
      and (subject_filters is null or k.subject = any(subject_filters))
    order by k.embedding <=> query_embedding limit match_count * 2
  ),
  keyword_search as (
    select k.id, ts_rank_cd(k.fts_vector, websearch_to_tsquery('simple', query_text)) as score
    from public.saathi_knowledge k
    where k.fts_vector @@ websearch_to_tsquery('simple', query_text)
      and k.parent_id is not null
      and (subject_filters is null or k.subject = any(subject_filters))
    order by score desc limit match_count * 2
  )
  select k.id, k.title, k.subject, k.topic, k.medium, k.content, k.source_file,
    coalesce(v.score, 0.0) as vector_score,
    coalesce(kw.score, 0.0) as keyword_score,
    coalesce(v.score, 0.0) + (coalesce(kw.score, 0.0) * 0.5) as similarity
  from public.saathi_knowledge k
  left join vector_search v on v.id = k.id
  left join keyword_search kw on kw.id = k.id
  where v.id is not null or kw.id is not null
  order by similarity desc
  limit match_count;
$function$;

REVOKE EXECUTE ON FUNCTION public.match_saathi_chunks(text, vector, integer, text[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.match_saathi_chunks(text, vector, integer, text[]) TO service_role;

-- 4) Which existing documents already contain these chunks (exact text match)?
CREATE OR REPLACE FUNCTION public.saathi_find_duplicate_chunks(
  contents text[],
  exclude_parent uuid DEFAULT NULL
)
RETURNS TABLE(parent_id uuid, title text, matches bigint)
LANGUAGE sql
STABLE
SET search_path TO 'public'
AS $function$
  select k.parent_id, p.title, count(distinct k.content_hash) as matches
  from public.saathi_knowledge k
  join public.saathi_knowledge p on p.id = k.parent_id
  where k.content_hash in (select md5(c) from unnest(contents) as c)
    and k.parent_id is distinct from exclude_parent
  group by k.parent_id, p.title
  order by matches desc;
$function$;

REVOKE EXECUTE ON FUNCTION public.saathi_find_duplicate_chunks(text[], uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.saathi_find_duplicate_chunks(text[], uuid) TO service_role;

-- 5) Per-document health report for the admin panel.
CREATE OR REPLACE FUNCTION public.saathi_health()
RETURNS TABLE(
  id uuid,
  title text,
  subject text,
  topic text,
  medium text,
  created_at timestamptz,
  is_legacy boolean,
  has_source boolean,
  chunk_count bigint,
  avg_chars integer,
  max_chars integer,
  tiny_chunks bigint,
  oversized_chunks bigint,
  missing_embeddings bigint,
  duplicate_chunks bigint
)
LANGUAGE sql
STABLE
SET search_path TO 'public'
AS $function$
  with chunk_stats as (
    select
      c.parent_id,
      count(*) as chunk_count,
      avg(length(c.content))::int as avg_chars,
      max(length(c.content)) as max_chars,
      count(*) filter (where length(c.content) < 200) as tiny_chunks,
      count(*) filter (where length(c.content) > 2500) as oversized_chunks,
      count(*) filter (where c.embedding is null) as missing_embeddings,
      count(*) filter (where exists (
        select 1 from public.saathi_knowledge o
        where o.content_hash = c.content_hash
          and o.parent_id is not null
          and o.parent_id <> c.parent_id
      )) as duplicate_chunks
    from public.saathi_knowledge c
    where c.parent_id is not null
    group by c.parent_id
  )
  select
    p.id, p.title, p.subject, p.topic, p.medium, p.created_at,
    (length(p.content) > 0) as is_legacy,
    (p.source_markdown is not null) as has_source,
    coalesce(s.chunk_count, 0),
    coalesce(s.avg_chars, 0),
    coalesce(s.max_chars, 0),
    coalesce(s.tiny_chunks, 0),
    coalesce(s.oversized_chunks, 0),
    coalesce(s.missing_embeddings, 0),
    coalesce(s.duplicate_chunks, 0)
  from public.saathi_knowledge p
  left join chunk_stats s on s.parent_id = p.id
  where p.parent_id is null
  order by p.created_at desc;
$function$;

REVOKE EXECUTE ON FUNCTION public.saathi_health() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.saathi_health() TO service_role;
