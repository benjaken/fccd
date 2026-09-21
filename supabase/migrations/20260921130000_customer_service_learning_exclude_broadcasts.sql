-- Seasonal WATI broadcast campaigns (marketing blasts) are not customer
-- conversations, so they must never inflate the learning import summary or be
-- fed into the daily learning / history replay. They carry an outbound event
-- type and are stored as `assistant`, so mark them explicitly.

alter table public.customer_service_learning_import_messages
  add column if not exists is_broadcast boolean not null default false;

-- Backfill existing rows: an outbound message whose identical, non-trivial text
-- reached many distinct recipients is a broadcast blast. This catches the
-- seasonal promo sends (2,855 and 269 recipients) while leaving one-to-one
-- order-confirmation templates untouched.
with blasts as (
  select message_text
  from public.customer_service_learning_import_messages
  where role = 'assistant'
    and length(btrim(message_text)) > 40
  group by message_text
  having count(distinct phone_normalized) >= 20
)
update public.customer_service_learning_import_messages messages
set is_broadcast = true
where messages.role = 'assistant'
  and messages.message_text in (select message_text from blasts);

create index if not exists customer_service_learning_import_messages_broadcast_idx
  on public.customer_service_learning_import_messages (environment, is_broadcast, created_at);

drop function if exists public.customer_service_learning_import_summary(integer);

create function public.customer_service_learning_import_summary(
  p_limit integer default 90
)
returns table (
  import_date date,
  message_count bigint,
  human_count bigint,
  customer_count bigint,
  broadcast_count bigint
)
language plpgsql
stable
security definer
set search_path = public, private
as $$
begin
  if not private.has_page_access('settings.customer_faq') then
    raise exception 'page_access_required' using errcode = '42501';
  end if;
  return query
    select
      (messages.created_at at time zone 'Asia/Hong_Kong')::date as import_date,
      count(*) filter (where not messages.is_broadcast) as message_count,
      count(*) filter (where not messages.is_broadcast and messages.role = 'human') as human_count,
      count(*) filter (where not messages.is_broadcast and messages.role = 'customer') as customer_count,
      count(*) filter (where messages.is_broadcast) as broadcast_count
    from public.customer_service_learning_import_messages messages
    where messages.phone_normalized not in ('8613828747224', '13828747224')
    group by 1
    order by 1 desc
    limit greatest(1, least(coalesce(p_limit, 90), 365));
end;
$$;

revoke all on function public.customer_service_learning_import_summary(integer)
  from public, anon;
grant execute on function public.customer_service_learning_import_summary(integer)
  to authenticated;
