-- Full-page office review workflow. Office reviewers can amend the complete
-- request, approve it, or return it with a reason. Every transition is audited.

create or replace function public.shop_office_review_order(
  p_request_id uuid,
  p_delivery_date date,
  p_note text,
  p_review_note text,
  p_action text,
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
  v_next_status text;
  v_event_type text;
begin
  if auth.uid() is null or not private.has_page_access('restaurant.ordering.review') then
    raise exception 'shop_order_review_forbidden' using errcode = '42501';
  end if;

  if p_action not in ('save', 'approve', 'return') then
    raise exception 'invalid_shop_review_action' using errcode = '22023';
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
  if p_delivery_date is distinct from v_request.delivery_date
    and p_delivery_date < (timezone('Asia/Hong_Kong', now()))::date then
    raise exception 'delivery_date cannot be before today' using errcode = '22007';
  end if;
  if p_action = 'return' and nullif(btrim(p_review_note), '') is null then
    raise exception 'shop_order_return_reason_required' using errcode = '22023';
  end if;
  if p_lines is null or jsonb_typeof(p_lines) <> 'array' or jsonb_array_length(p_lines) = 0 then
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

  v_next_status := case p_action
    when 'approve' then 'reviewed'
    when 'return' then 'rejected'
    else 'submitted'
  end;
  v_event_type := case p_action
    when 'approve' then 'office_approved'
    when 'return' then 'office_returned'
    else 'office_changes_saved'
  end;

  update public.shop_order_requests
  set delivery_date = p_delivery_date,
      note = nullif(btrim(p_note), ''),
      status = v_next_status
  where id = p_request_id;

  insert into public.shop_order_events (request_id, event_type, payload, actor_id)
  values (
    p_request_id,
    v_event_type,
    jsonb_build_object(
      'deliveryDate', p_delivery_date,
      'lineCount', v_line_count,
      'reviewNote', nullif(btrim(p_review_note), '')
    ),
    auth.uid()
  );
end;
$$;

create or replace function public.shop_send_reviewed_order_to_factory(p_request_id uuid)
returns void
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
declare
  v_request public.shop_order_requests%rowtype;
begin
  if auth.uid() is null
    or not private.has_page_access('restaurant.ordering.review.send_factory') then
    raise exception 'shop_order_send_forbidden' using errcode = '42501';
  end if;

  select * into v_request
  from public.shop_order_requests
  where id = p_request_id
  for update;

  if not found then
    raise exception 'shop_order_not_found' using errcode = 'P0002';
  end if;
  if v_request.channel <> 'fc_internal' or v_request.status <> 'reviewed' then
    raise exception 'shop_order_not_approved' using errcode = '55000';
  end if;

  update public.shop_order_requests
  set status = 'sent_to_factory'
  where id = p_request_id;

  insert into public.shop_order_events (request_id, event_type, payload, actor_id)
  values (p_request_id, 'sent_to_factory', '{}'::jsonb, auth.uid());
end;
$$;

revoke all on function public.shop_office_review_order(uuid, date, text, text, text, jsonb) from public;
revoke all on function public.shop_send_reviewed_order_to_factory(uuid) from public;
grant execute on function public.shop_office_review_order(uuid, date, text, text, text, jsonb) to authenticated;
grant execute on function public.shop_send_reviewed_order_to_factory(uuid) to authenticated;
