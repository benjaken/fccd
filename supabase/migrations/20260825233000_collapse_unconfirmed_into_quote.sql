begin;

update public.orders
set document_type = 'quote',
    updated_at = now()
where document_type = 'unconfirmed';

alter table public.orders
  alter column document_type set default 'quote';

alter table public.orders
  drop constraint if exists orders_document_type_check;

alter table public.orders
  add constraint orders_document_type_check
  check (document_type in ('quote', 'order'));

do $$
begin
  if exists (
    select 1 from public.orders
    where document_type not in ('quote', 'order')
  ) then
    raise exception 'orders still contain unsupported document types';
  end if;
end
$$;

commit;
