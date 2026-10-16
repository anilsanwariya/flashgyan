-- SAATHI: who published each deck (NCERT, IGNOU, RBSE…), shown with the book's
-- name wherever SAATHI, the Telegram bot or the magazine cites the notes. It
-- lives on the deck row; search returns it for each chunk from its deck.
-- Safe to run more than once.

ALTER TABLE public.saathi_knowledge ADD COLUMN IF NOT EXISTS source text;

-- Decks uploaded so far are NCERT books; the magazine's own issues are
-- FlashGyan's current affairs.
UPDATE public.saathi_knowledge
SET source = CASE WHEN subject = 'Current Affairs' THEN 'FlashGyan Current Affairs' ELSE 'NCERT' END
WHERE parent_id IS NULL AND source IS NULL;

-- Search also returns each chunk's deck source (return type changes: drop and recreate).
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
  source text,
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
    p.source,
    coalesce(v.score, 0.0) as vector_score,
    coalesce(kw.score, 0.0) as keyword_score,
    coalesce(v.score, 0.0) + (coalesce(kw.score, 0.0) * 0.5) as similarity
  from public.saathi_knowledge k
  left join public.saathi_knowledge p on p.id = k.parent_id
  left join vector_search v on v.id = k.id
  left join keyword_search kw on kw.id = k.id
  where v.id is not null or kw.id is not null
  order by similarity desc
  limit match_count;
$function$;

REVOKE EXECUTE ON FUNCTION public.match_saathi_chunks(text, vector, integer, text[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.match_saathi_chunks(text, vector, integer, text[]) TO service_role;
