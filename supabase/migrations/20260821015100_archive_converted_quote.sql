create or replace function private.archive_converted_quote()
returns trigger
language plpgsql
security definer
set search_path = public, private
as $$
begin
  if new.document_type = 'order' and new.source_quote_id is not null then
    update public.orders
    set quote_status = 'Done Deal',
        archived_at = coalesce(archived_at, now()),
        updated_at = now()
    where id = new.source_quote_id
      and document_type in ('quote', 'unconfirmed')
      and archived_at is null;
  end if;
  return new;
end;
$$;

drop trigger if exists archive_converted_quote_after_order_insert on public.orders;
create trigger archive_converted_quote_after_order_insert
after insert on public.orders
for each row
execute function private.archive_converted_quote();
