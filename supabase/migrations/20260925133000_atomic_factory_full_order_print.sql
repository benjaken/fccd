-- Persist a successful full-order label job atomically. The client sends the
-- exact line set used to build the QZ job, so a concurrent order change cannot
-- be incorrectly recorded as printed.
create or replace function public.mark_factory_order_printed(
  p_order_id uuid,
  p_order_line_ids uuid[]
)
returns void
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
declare
  v_expected_count integer;
  v_submitted_count integer;
begin
  if private.jwt_app_role() not in ('Super Admin', 'Admin', 'Factory') then
    raise exception 'factory_label_print_forbidden' using errcode = '42501';
  end if;

  if p_order_id is null or coalesce(cardinality(p_order_line_ids), 0) = 0 then
    raise exception 'factory_order_print_set_empty' using errcode = '22023';
  end if;

  perform 1
  from public.orders
  where id = p_order_id and document_type = 'order'
  for update;

  if not found then
    raise exception 'factory_order_not_found' using errcode = 'P0002';
  end if;

  perform public.assert_factory_order_printable(p_order_id);

  -- Lock the current rows while validating and updating the submitted set.
  perform 1
  from public.order_lines
  where order_id = p_order_id
  for update;

  select count(*) into v_expected_count
  from public.order_lines
  where order_id = p_order_id
    and not is_void
    and (
      product_id is not null
      or nullif(trim(content_snapshot), '') is not null
      or nullif(trim(product_name_snapshot), '') is not null
    );

  select count(distinct line_id) into v_submitted_count
  from unnest(p_order_line_ids) as submitted(line_id)
  where line_id is not null;

  if v_submitted_count <> cardinality(p_order_line_ids)
    or v_submitted_count <> v_expected_count
    or exists (
      select 1
      from public.order_lines
      where order_id = p_order_id
        and not is_void
        and (
          product_id is not null
          or nullif(trim(content_snapshot), '') is not null
          or nullif(trim(product_name_snapshot), '') is not null
        )
        and not (id = any(p_order_line_ids))
    )
    or exists (
      select 1
      from unnest(p_order_line_ids) as submitted(line_id)
      where not exists (
        select 1
        from public.order_lines
        where id = submitted.line_id
          and order_id = p_order_id
          and not is_void
          and (
            product_id is not null
            or nullif(trim(content_snapshot), '') is not null
            or nullif(trim(product_name_snapshot), '') is not null
          )
      )
    )
  then
    raise exception 'factory_order_print_set_changed' using errcode = '55000';
  end if;

  update public.order_lines
  set is_printed = true
  where order_id = p_order_id
    and id = any(p_order_line_ids);

  update public.factory_order_line_changes
  set resolved_at = now(), resolved_by = auth.uid()
  where order_id = p_order_id
    and order_line_id = any(p_order_line_ids)
    and resolved_at is null;

  if not exists (
    select 1
    from public.factory_order_line_changes
    where order_id = p_order_id and resolved_at is null
  ) then
    update public.orders
    set factory_print_date = now(),
        factory_reprint_required = false,
        updated_at = now()
    where id = p_order_id;
  end if;
end;
$$;

revoke all on function public.mark_factory_order_printed(uuid, uuid[]) from public;
grant execute on function public.mark_factory_order_printed(uuid, uuid[])
  to authenticated;

comment on function public.mark_factory_order_printed(uuid, uuid[]) is
  'Atomically records a full QZ order-label job after validating the exact printable line set.';
