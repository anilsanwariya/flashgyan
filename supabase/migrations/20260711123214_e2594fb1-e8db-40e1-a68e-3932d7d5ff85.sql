
alter table public.saathi_knowledge
  add column if not exists source_file text,
  add column if not exists chunk_index integer;

alter table public.saathi_knowledge
  add column if not exists fts_vector tsvector generated always as (to_tsvector('simple', coalesce(title,'') || ' ' || coalesce(content,''))) stored;

create index if not exists saathi_knowledge_fts_idx on public.saathi_knowledge using gin(fts_vector);

create or replace function public.match_saathi_hybrid(
  query_text text,
  query_embedding vector(1536),
  match_count int default 6,
  subject_filter text default null
)
returns table (
  id uuid,
  title text,
  subject text,
  content text,
  source_file text,
  similarity float
)
language sql stable
set search_path = public
as $$
  with vector_search as (
    select k.id, 1 - (k.embedding <=> query_embedding) as score
    from public.saathi_knowledge k
    where k.embedding is not null and (subject_filter is null or k.subject = subject_filter)
    order by k.embedding <=> query_embedding limit match_count * 2
  ),
  keyword_search as (
    select k.id, ts_rank_cd(k.fts_vector, websearch_to_tsquery('simple', query_text)) as score
    from public.saathi_knowledge k
    where k.fts_vector @@ websearch_to_tsquery('simple', query_text)
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
$$;

revoke execute on function public.match_saathi_hybrid(text, vector, int, text) from public, anon, authenticated;
