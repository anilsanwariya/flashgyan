
create extension if not exists vector;

create table public.saathi_knowledge (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  subject text not null,
  content text not null,
  embedding vector(1536),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

grant select on public.saathi_knowledge to authenticated;
grant all on public.saathi_knowledge to service_role;

alter table public.saathi_knowledge enable row level security;

create policy "Authenticated can read saathi_knowledge"
  on public.saathi_knowledge for select
  to authenticated
  using (true);

create policy "Admins can insert saathi_knowledge"
  on public.saathi_knowledge for insert
  to authenticated
  with check (public.has_role(auth.uid(), 'admin'));

create policy "Admins can update saathi_knowledge"
  on public.saathi_knowledge for update
  to authenticated
  using (public.has_role(auth.uid(), 'admin'))
  with check (public.has_role(auth.uid(), 'admin'));

create policy "Admins can delete saathi_knowledge"
  on public.saathi_knowledge for delete
  to authenticated
  using (public.has_role(auth.uid(), 'admin'));

create index saathi_knowledge_subject_idx on public.saathi_knowledge (subject);
create index saathi_knowledge_embedding_idx
  on public.saathi_knowledge using hnsw (embedding vector_cosine_ops);

create trigger saathi_knowledge_set_updated_at
  before update on public.saathi_knowledge
  for each row execute function public.set_updated_at();

create or replace function public.match_saathi_knowledge(
  query_embedding vector(1536),
  match_count int default 6,
  subject_filter text default null
)
returns table (
  id uuid,
  title text,
  subject text,
  content text,
  similarity float
)
language sql stable
set search_path = public
as $$
  select
    k.id,
    k.title,
    k.subject,
    k.content,
    1 - (k.embedding <=> query_embedding) as similarity
  from public.saathi_knowledge k
  where k.embedding is not null
    and (subject_filter is null or k.subject = subject_filter)
  order by k.embedding <=> query_embedding
  limit match_count;
$$;
