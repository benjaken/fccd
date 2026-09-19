-- FCCD RAG upgrade (Phase 2b): switch FAQ embeddings to the Doubao dimension.
--
-- The initial semantic-retrieval migration sized the column for OpenAI
-- text-embedding-3-small (1536). The chosen provider is Doubao
-- doubao-embedding-vision-251215, which we call at 1024 dimensions. No backfill
-- has run yet, so existing embeddings are cleared and marked stale.

begin;

delete from public.customer_faq_embeddings;
update public.customer_faqs
  set embedding_status = 'pending',
      content_hash = null,
      embedding_updated_at = null
  where embedding_status <> 'pending'
     or content_hash is not null
     or embedding_updated_at is not null;

drop index if exists public.customer_faq_embeddings_hnsw_idx;

alter table public.customer_faq_embeddings
  alter column embedding type vector(1024) using embedding::vector(1024);

create index if not exists customer_faq_embeddings_hnsw_idx
  on public.customer_faq_embeddings using hnsw (embedding vector_cosine_ops);

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
  v_embedding vector(1024);
begin
  if btrim(coalesce(p_query_embedding, '')) = '' then
    return;
  end if;
  v_embedding := p_query_embedding::vector(1024);

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
