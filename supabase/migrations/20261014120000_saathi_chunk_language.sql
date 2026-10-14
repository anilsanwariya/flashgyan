-- SAATHI: language per chunk, so one deck can hold the same material in Hindi
-- and English. The deck's medium stays as a label; search uses each chunk's own
-- language to prefer the one matching the student's question.

ALTER TABLE public.saathi_knowledge ADD COLUMN IF NOT EXISTS language text;

-- 'Hindi' when Devanagari letters outnumber Latin ones, 'English' otherwise,
-- NULL for chunks with too little text to tell.
CREATE OR REPLACE FUNCTION public.saathi_detect_language(t text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  WITH c AS (
    SELECT
      length(regexp_replace(coalesce(t, ''), '[^ऀ-ॿ]', '', 'g')) AS deva,
      length(regexp_replace(coalesce(t, ''), '[^A-Za-z]', '', 'g')) AS latin
  )
  SELECT CASE
    WHEN deva + latin < 20 THEN NULL
    WHEN deva >= latin THEN 'Hindi'
    ELSE 'English'
  END
  FROM c
$$;

CREATE OR REPLACE FUNCTION public.saathi_set_chunk_language()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.language := CASE
    WHEN NEW.parent_id IS NULL THEN NULL
    ELSE public.saathi_detect_language(NEW.content)
  END;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS saathi_knowledge_set_language ON public.saathi_knowledge;
CREATE TRIGGER saathi_knowledge_set_language
  BEFORE INSERT OR UPDATE OF content, parent_id ON public.saathi_knowledge
  FOR EACH ROW EXECUTE FUNCTION public.saathi_set_chunk_language();

REVOKE EXECUTE ON FUNCTION public.saathi_detect_language(text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.saathi_set_chunk_language() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.saathi_detect_language(text) TO service_role;

UPDATE public.saathi_knowledge
SET language = public.saathi_detect_language(content)
WHERE parent_id IS NOT NULL;

-- Search also returns each chunk's language (return type changes: drop and recreate).
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
  language text,
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
  select k.id, k.title, k.subject, k.topic, k.medium, k.language, k.content, k.source_file,
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

-- Health report: add how many chunks are in each language.
DROP FUNCTION IF EXISTS public.saathi_health();

CREATE FUNCTION public.saathi_health()
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
  hindi_chunks bigint,
  english_chunks bigint,
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
      count(*) filter (where c.language = 'Hindi') as hindi_chunks,
      count(*) filter (where c.language = 'English') as english_chunks,
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
    coalesce(s.hindi_chunks, 0),
    coalesce(s.english_chunks, 0),
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
