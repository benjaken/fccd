-- Frozen and dry-goods requests are one factory document. Allocate the same
-- R - YYYYMM - n number series used by the original frozen-goods orders.

create or replace function public.shop_order_next_factory_no(p_reference_date date)
returns text
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_month text := to_char(p_reference_date, 'YYYYMM');
  v_next bigint;
begin
  perform pg_advisory_xact_lock(hashtextextended('factory-order-no:' || v_month, 0));

  select coalesce(max(number_value), 0) + 1
  into v_next
  from (
    select substring(order_number from '-\s*(\d+)\s*$')::bigint as number_value
    from public.meat_orders
    where order_number ~ ('^R\s*-\s*' || v_month || '\s*-\s*\d+\s*$')
    union all
    select substring(order_no from '-\s*(\d+)\s*$')::bigint
    from public.shop_order_batches
    where order_no ~ ('^R\s*-\s*' || v_month || '\s*-\s*\d+\s*$')
    union all
    select substring(request_no from '-\s*(\d+)\s*$')::bigint
    from public.shop_order_requests
    where order_batch_id is null
      and request_no ~ ('^R\s*-\s*' || v_month || '\s*-\s*\d+\s*$')
  ) existing_numbers;

  return 'R - ' || v_month || ' - ' || v_next::text;
end;
$$;

create or replace function public.shop_order_next_request_no()
returns text
language sql
as $$
  select public.shop_order_next_factory_no((timezone('Asia/Hong_Kong', now()))::date);
$$;

alter table public.shop_order_batches alter column order_no drop default;

create or replace function public.shop_order_batches_set_number()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if new.order_no is null or btrim(new.order_no) = '' then
    new.order_no := public.shop_order_next_factory_no(new.delivery_date);
  end if;
  return new;
end;
$$;

drop trigger if exists shop_order_batches_set_number on public.shop_order_batches;
create trigger shop_order_batches_set_number
before insert on public.shop_order_batches
for each row execute function public.shop_order_batches_set_number();

create or replace function public.shop_order_requests_set_defaults()
returns trigger
language plpgsql
as $$
begin
  if new.request_no is null or new.request_no = '' then
    new.request_no := case
      when new.order_batch_id is not null then 'SREQ-' || new.id::text
      else public.shop_order_next_factory_no(new.delivery_date)
    end;
  end if;
  if new.delivery_date < (timezone('Asia/Hong_Kong', now()))::date then
    raise exception 'delivery_date cannot be before today';
  end if;
  new.updated_at := now();
  return new;
end;
$$;

do $$
declare
  row_record record;
begin
  for row_record in
    select id, delivery_date
    from public.shop_order_batches
    where order_no !~ '^R\s*-\s*\d{6}\s*-\s*\d+\s*$'
    order by created_at, id
  loop
    update public.shop_order_batches
    set order_no = public.shop_order_next_factory_no(row_record.delivery_date)
    where id = row_record.id;
  end loop;

  for row_record in
    select id, delivery_date
    from public.shop_order_requests
    where order_batch_id is null
      and request_no !~ '^R\s*-\s*\d{6}\s*-\s*\d+\s*$'
    order by created_at, id
  loop
    update public.shop_order_requests
    set request_no = public.shop_order_next_factory_no(row_record.delivery_date)
    where id = row_record.id;
  end loop;
end;
$$;

revoke all on function public.shop_order_next_factory_no(date) from public, anon;
grant execute on function public.shop_order_next_factory_no(date) to authenticated;
