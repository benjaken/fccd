-- FCCD RAG upgrade (Phase 2): semantic FAQ retrieval.
--
-- Adds pgvector storage for published FAQ embeddings plus a cosine-similarity
-- search RPC. Fusion (RRF) and rerank stay in the Edge Function so they can be
-- unit tested and feature-flagged independently.

begin;

create extension if not exists vector;

-- Track whether a published FAQ has a current embedding. The content hash lets
-- the refresh job skip unchanged rows.
alter table public.customer_faqs
  add column if not exists embedding_status text not null default 'pending',
  add column if not exists content_hash text,
  add column if not exists embedding_updated_at timestamptz;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'customer_faqs_embedding_status_check'
      and conrelid = 'public.customer_faqs'::regclass
  ) then
    alter table public.customer_faqs
      add constraint customer_faqs_embedding_status_check
      check (embedding_status in ('pending', 'ready', 'failed', 'stale'));
  end if;
end;
$$;

create table if not exists public.customer_faq_embeddings (
  id uuid primary key default gen_random_uuid(),
  faq_id uuid not null references public.customer_faqs(id) on delete cascade,
  source_type text not null default 'question'
    check (source_type in ('question', 'question_answer', 'alias')),
  source_id text not null,
  embedding vector(1536) not null,
  model text not null,
  content_hash text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (faq_id, source_type, source_id)
);

create index if not exists customer_faq_embeddings_faq_idx
  on public.customer_faq_embeddings (faq_id);
create index if not exists customer_faq_embeddings_hnsw_idx
  on public.customer_faq_embeddings using hnsw (embedding vector_cosine_ops);

-- Similar questions and negative examples. V1 only reads them (negative filter
-- and alias embedding are wired in Phase 3), but the schema is stable here.
create table if not exists public.customer_faq_aliases (
  id uuid primary key default gen_random_uuid(),
  faq_id uuid not null references public.customer_faqs(id) on delete cascade,
  alias_type text not null check (alias_type in ('similar', 'negative')),
  alias_text text not null check (length(btrim(alias_text)) > 0),
  locale text not null default 'zh-HK',
  is_active boolean not null default true,
  source text not null default 'manual' check (source in ('manual', 'learned', 'imported')),
  content_hash text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (faq_id, alias_type, alias_text)
);

create index if not exists customer_faq_aliases_faq_idx
  on public.customer_faq_aliases (faq_id, alias_type)
  where is_active;

alter table public.customer_faq_embeddings enable row level security;
alter table public.customer_faq_aliases enable row level security;

revoke all on table public.customer_faq_embeddings from public, anon, authenticated;
revoke all on table public.customer_faq_aliases from public, anon, authenticated;
grant all on table public.customer_faq_embeddings to service_role;
grant all on table public.customer_faq_aliases to service_role;

-- Cosine similarity search over published FAQ embeddings. The query embedding
-- arrives as text (for example "[0.01,-0.02,...]") so PostgREST does not have
-- to resolve a vector argument type.
create or replace function public.search_published_customer_faqs_by_vector(
  p_query_embedding text,
  p_limit integer default 8,
  p_threshold double precision default 0.0
)
returns table (
  id uuid,
  category text,
  question text,
  answer text,
  score numeric
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_limit integer := least(greatest(coalesce(p_limit, 8), 1), 50);
  v_embedding vector(1536);
begin
  if btrim(coalesce(p_query_embedding, '')) = '' then
    return;
  end if;
  v_embedding := p_query_embedding::vector(1536);

  return query
  with nearest as (
    select
      e.faq_id,
      (1 - (e.embedding <=> v_embedding))::double precision as similarity
    from public.customer_faq_embeddings e
    order by e.embedding <=> v_embedding
    limit greatest(v_limit * 5, 50)
  ),
  best as (
    select distinct on (n.faq_id)
      n.faq_id, n.similarity
    from nearest n
    order by n.faq_id, n.similarity desc
  )
  select f.id, f.category, f.question, f.answer, b.similarity::numeric
  from best b
  join public.customer_faqs f on f.id = b.faq_id and f.is_published
  where b.similarity >= coalesce(p_threshold, 0)
  order by b.similarity desc, f.question
  limit v_limit;
end;
$$;

revoke all on function public.search_published_customer_faqs_by_vector(text, integer, double precision) from public, anon, authenticated;
grant execute on function public.search_published_customer_faqs_by_vector(text, integer, double precision) to service_role;

commit;
