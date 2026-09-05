-- Allow a restaurant to amend or withdraw an FC order while it is still waiting
-- for office review. Both operations lock the request and re-check its status so
-- an office send and a restaurant action cannot silently overwrite each other.

create or replace function public.shop_order_requests_set_defaults()
returns trigger
language plpgsql
as $$
begin
  if new.request_no is null or new.request_no = '' then
    new.request_no := public.shop_order_next_request_no();
  end if;
  if tg_op = 'INSERT' then
    if new.delivery_date < (timezone('Asia/Hong_Kong', now()))::date then
      raise exception 'delivery_date cannot be before today';
    end if;
  elsif new.delivery_date is distinct from old.delivery_date
    and new.delivery_date < (timezone('Asia/Hong_Kong', now()))::date then
      raise exception 'delivery_date cannot be before today';
  end if;
  new.updated_at := now();
  return new;
end;
$$;

create or replace function public.shop_update_submitted_order(
  p_request_id uuid,
  p_delivery_date date,
  p_note text,
  p_lines jsonb
)
returns void
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
declare
  v_request public.shop_order_requests%rowtype;
  v_line_count integer;
  v_distinct_count integer;
begin
  if auth.uid() is null then
    raise exception 'authentication_required' using errcode = '42501';
  end if;

  select * into v_request
  from public.shop_order_requests
  where id = p_request_id
  for update;

  if not found then
    raise exception 'shop_order_not_found' using errcode = 'P0002';
  end if;
  if v_request.channel <> 'fc_internal' or v_request.status not in ('submitted', 'rejected') then
    raise exception 'shop_order_no_longer_editable' using errcode = '55000';
  end if;
  if not exists (
    select 1
    from public.user_profiles profile
    where profile.id = auth.uid()
      and profile.shop_restro_id = v_request.restaurant_id
  ) and not private.has_page_access('restaurant.ordering.review') then
    raise exception 'shop_order_restaurant_mismatch' using errcode = '42501';
  end if;
  if p_delivery_date < (timezone('Asia/Hong_Kong', now()))::date then
    raise exception 'delivery_date cannot be before today' using errcode = '22007';
  end if;
  if p_lines is null or jsonb_typeof(p_lines) <> 'array' then
    raise exception 'shop_order_lines_required' using errcode = '22023';
  end if;
  if jsonb_array_length(p_lines) = 0 then
    raise exception 'shop_order_lines_required' using errcode = '22023';
  end if;

  select count(*), count(distinct value->>'catalogItemId')
  into v_line_count, v_distinct_count
  from jsonb_array_elements(p_lines);

  if v_line_count <> v_distinct_count or exists (
    select 1
    from jsonb_array_elements(p_lines) line
    left join public.shop_catalog_items item
      on item.id = nullif(line.value->>'catalogItemId', '')::uuid
    where item.id is null
      or not item.is_active
      or item.channel <> v_request.channel
      or item.supplier_name <> v_request.catalog_supplier_name
      or item.fcc_supplier_id is distinct from v_request.supplier_id
      or coalesce((line.value->>'quantity')::numeric, 0) <= 0
  ) then
    raise exception 'invalid_shop_order_lines' using errcode = '22023';
  end if;

  delete from public.shop_order_lines where request_id = p_request_id;

  insert into public.shop_order_lines (
    request_id, catalog_item_id, sku, name, unit, quantity, warehouse
  )
  select
    p_request_id,
    item.id,
    item.sku,
    item.name,
    item.unit,
    (line.value->>'quantity')::numeric,
    item.warehouse
  from jsonb_array_elements(p_lines) line
  join public.shop_catalog_items item
    on item.id = (line.value->>'catalogItemId')::uuid;

  update public.shop_order_requests
  set delivery_date = p_delivery_date,
      note = nullif(btrim(p_note), ''),
      status = 'submitted'
  where id = p_request_id;

  insert into public.shop_order_events (request_id, event_type, payload, actor_id)
  values (
    p_request_id,
    'restaurant_updated',
    jsonb_build_object('deliveryDate', p_delivery_date, 'lineCount', v_line_count),
    auth.uid()
  );
end;
$$;

create or replace function public.shop_withdraw_submitted_order(p_request_id uuid)
returns void
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
declare
  v_request public.shop_order_requests%rowtype;
begin
  if auth.uid() is null then
    raise exception 'authentication_required' using errcode = '42501';
  end if;

  select * into v_request
  from public.shop_order_requests
  where id = p_request_id
  for update;

  if not found then
    raise exception 'shop_order_not_found' using errcode = 'P0002';
  end if;
  if v_request.channel <> 'fc_internal' or v_request.status not in ('submitted', 'rejected') then
    raise exception 'shop_order_no_longer_editable' using errcode = '55000';
  end if;
  if not exists (
    select 1
    from public.user_profiles profile
    where profile.id = auth.uid()
      and profile.shop_restro_id = v_request.restaurant_id
  ) and not private.has_page_access('restaurant.ordering.review') then
    raise exception 'shop_order_restaurant_mismatch' using errcode = '42501';
  end if;

  update public.shop_order_requests
  set status = 'withdrawn'
  where id = p_request_id;

  insert into public.shop_order_events (request_id, event_type, payload, actor_id)
  values (p_request_id, 'restaurant_withdrawn', '{}'::jsonb, auth.uid());
end;
$$;

create or replace function public.shop_review_order_lines(
  p_request_id uuid,
  p_lines jsonb
)
returns void
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
declare
  v_request public.shop_order_requests%rowtype;
  v_line_count integer;
  v_updated_count integer;
begin
  if auth.uid() is null or not private.has_page_access('restaurant.ordering.review') then
    raise exception 'shop_order_review_forbidden' using errcode = '42501';
  end if;

  select * into v_request
  from public.shop_order_requests
  where id = p_request_id
  for update;

  if not found then
    raise exception 'shop_order_not_found' using errcode = 'P0002';
  end if;
  if v_request.channel <> 'fc_internal' or v_request.status not in ('submitted', 'reviewed') then
    raise exception 'shop_order_no_longer_reviewable' using errcode = '55000';
  end if;
  if p_lines is null or jsonb_typeof(p_lines) <> 'array' then
    raise exception 'shop_order_lines_required' using errcode = '22023';
  end if;
  if jsonb_array_length(p_lines) = 0 then
    raise exception 'shop_order_lines_required' using errcode = '22023';
  end if;

  select count(*) into v_line_count
  from public.shop_order_lines
  where request_id = p_request_id;

  if v_line_count <> jsonb_array_length(p_lines)
    or v_line_count <> (
      select count(distinct value->>'id') from jsonb_array_elements(p_lines)
    )
    or exists (
      select 1
      from jsonb_array_elements(p_lines) line
      left join public.shop_order_lines existing
        on existing.id = nullif(line.value->>'id', '')::uuid
       and existing.request_id = p_request_id
      where existing.id is null
        or coalesce((line.value->>'quantity')::numeric, 0) <= 0
    ) then
    raise exception 'invalid_shop_order_lines' using errcode = '22023';
  end if;

  update public.shop_order_lines existing
  set quantity = (line.value->>'quantity')::numeric
  from jsonb_array_elements(p_lines) line
  where existing.id = (line.value->>'id')::uuid
    and existing.request_id = p_request_id;
  get diagnostics v_updated_count = row_count;

  if v_updated_count <> v_line_count then
    raise exception 'shop_order_lines_changed' using errcode = '55000';
  end if;

  update public.shop_order_requests
  set status = 'reviewed'
  where id = p_request_id;

  insert into public.shop_order_events (request_id, event_type, payload, actor_id)
  values (
    p_request_id,
    'office_reviewed',
    jsonb_build_object('lineCount', v_line_count),
    auth.uid()
  );
end;
$$;

revoke all on function public.shop_update_submitted_order(uuid, date, text, jsonb) from public;
revoke all on function public.shop_withdraw_submitted_order(uuid) from public;
revoke all on function public.shop_review_order_lines(uuid, jsonb) from public;
grant execute on function public.shop_update_submitted_order(uuid, date, text, jsonb) to authenticated;
grant execute on function public.shop_withdraw_submitted_order(uuid) to authenticated;
grant execute on function public.shop_review_order_lines(uuid, jsonb) to authenticated;
