
create table if not exists public.saathi_chat_history (
  id uuid primary key default gen_random_uuid(),
  user_id text not null,
  role text not null,
  content text not null,
  created_at timestamptz not null default now()
);

grant all on public.saathi_chat_history to service_role;
alter table public.saathi_chat_history enable row level security;

create index if not exists idx_saathi_chat_history_user_created
  on public.saathi_chat_history (user_id, created_at desc);

create table if not exists public.saathi_knowledge_gaps (
  id uuid primary key default gen_random_uuid(),
  question text not null unique,
  ask_count int not null default 1,
  last_asked_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

grant all on public.saathi_knowledge_gaps to service_role;
alter table public.saathi_knowledge_gaps enable row level security;

create or replace function public.increment_knowledge_gap(gap_question text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.saathi_knowledge_gaps (question, ask_count, last_asked_at)
  values (gap_question, 1, now())
  on conflict (question)
  do update set
    ask_count = public.saathi_knowledge_gaps.ask_count + 1,
    last_asked_at = now();
end;
$$;
