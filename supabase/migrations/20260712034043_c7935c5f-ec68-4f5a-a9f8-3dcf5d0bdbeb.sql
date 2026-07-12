ALTER TABLE public.saathi_knowledge
  ADD COLUMN IF NOT EXISTS parent_id uuid REFERENCES public.saathi_knowledge(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS saathi_knowledge_parent_id_idx ON public.saathi_knowledge(parent_id);

CREATE OR REPLACE FUNCTION public.match_saathi_hybrid(
  query_text text,
  query_embedding vector,
  match_count integer DEFAULT 6,
  subject_filter text DEFAULT NULL::text
)
RETURNS TABLE(id uuid, title text, subject text, content text, source_file text, similarity double precision)
LANGUAGE sql
STABLE
SET search_path TO 'public'
AS $function$
  with vector_search as (
    select k.id, 1 - (k.embedding <=> query_embedding) as score
    from public.saathi_knowledge k
    where k.embedding is not null
      and k.parent_id is not null
      and (subject_filter is null or k.subject = subject_filter)
    order by k.embedding <=> query_embedding limit match_count * 2
  ),
  keyword_search as (
    select k.id, ts_rank_cd(k.fts_vector, websearch_to_tsquery('simple', query_text)) as score
    from public.saathi_knowledge k
    where k.fts_vector @@ websearch_to_tsquery('simple', query_text)
      and k.parent_id is not null
      and (subject_filter is null or k.subject = subject_filter)
    order by score desc limit match_count * 2
  )
  select distinct on (k.id)
    k.id, k.title, k.subject, k.content, k.source_file,
    coalesce(v.score, 0.0) + (coalesce(kw.score, 0.0) * 0.5) as similarity
  from public.saathi_knowledge k
  left join vector_search v on v.id = k.id
  left join keyword_search kw on kw.id = k.id
  where v.id is not null or kw.id is not null
  order by k.id, similarity desc
  limit match_count;
$function$;

REVOKE EXECUTE ON FUNCTION public.match_saathi_hybrid(text, vector, integer, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.match_saathi_hybrid(text, vector, integer, text) TO service_role;