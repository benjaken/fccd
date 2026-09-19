-- Mark FAQ embeddings stale when published question/answer/keywords change.

begin;

create or replace function public.customer_faqs_mark_embedding_pending()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if TG_OP = 'INSERT' then
    new.embedding_status := 'pending';
    return new;
  end if;
  if new.question is distinct from old.question
     or new.answer is distinct from old.answer
     or coalesce(new.keywords, '') is distinct from coalesce(old.keywords, '')
     or new.is_published is distinct from old.is_published then
    new.embedding_status := 'pending';
    new.content_hash := null;
    new.embedding_updated_at := null;
  end if;
  return new;
end;
$$;

drop trigger if exists customer_faqs_embedding_pending on public.customer_faqs;
create trigger customer_faqs_embedding_pending
  before insert or update on public.customer_faqs
  for each row
  execute function public.customer_faqs_mark_embedding_pending();

commit;
