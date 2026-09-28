-- Persist the exact full-order label job and reject stale submissions.
--
-- The previous RPC only validated the submitted line id set, so a page loaded
-- before an order edit could still have its stale labels recorded as the latest
-- print and clear the reprint requirement. The client now submits the snapshot
-- it actually printed; the function verifies it against the current rows, stores
-- a print record (FILE-05) and only then updates the factory print state.

create table if not exists public.factory_label_print_records (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  order_line_id uuid not null,
  order_number_snapshot text,
  label_names text[] not null default '{}',
  quantity numeric,
  item_order integer,
  remarks text[] not null default '{}',
  printed_at timestamptz not null default now(),
  printed_by uuid references auth.users(id) on delete set null
);

create index if not exists factory_label_print_records_order_idx
  on public.factory_label_print_records(order_id, printed_at desc);

create index if not exists factory_label_print_records_line_idx
  on public.factory_label_print_records(order_line_id);

alter table public.factory_label_print_records enable row level security;

grant select on public.factory_label_print_records to authenticated;

drop policy if exists factory_label_print_records_read
  on public.factory_label_print_records;
create policy factory_label_print_records_read
on public.factory_label_print_records
for select
to authenticated
using (
  nullif((select auth.jwt()) -> 'app_metadata' ->> 'role', '')
    in ('Super Admin', 'Admin', 'Factory')
);

-- Replace the id-only signature with a snapshot-carrying one.
drop function if exists public.mark_factory_order_printed(uuid, uuid[]);

create or replace function public.mark_factory_order_printed(
  p_order_id uuid,
  p_lines jsonb
)
returns void
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
declare
  v_expected_count integer;
  v_submitted_count integer;
  v_order_number text;
begin
  if private.jwt_app_role() not in ('Super Admin', 'Admin', 'Factory') then
    raise exception 'factory_label_print_forbidden' using errcode = '42501';
  end if;

  if p_order_id is null
    or p_lines is null
    or jsonb_typeof(p_lines) <> 'array'
    or jsonb_array_length(p_lines) = 0 then
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

  select order_number into v_order_number
  from public.orders
  where id = p_order_id;

  select count(distinct line_id) into v_submitted_count
  from jsonb_to_recordset(p_lines) as submitted(line_id uuid)
  where line_id is not null;

  select count(*) into v_expected_count
  from public.order_lines
  where order_id = p_order_id
    and not is_void
    and (
      product_id is not null
      or package_id is not null
      or nullif(trim(content_snapshot), '') is not null
      or nullif(trim(product_name_snapshot), '') is not null
    );

  if v_submitted_count <> jsonb_array_length(p_lines)
    or v_submitted_count <> v_expected_count
    or exists (
      select 1
      from public.order_lines
      where order_id = p_order_id
        and not is_void
        and (
          product_id is not null
          or package_id is not null
          or nullif(trim(content_snapshot), '') is not null
          or nullif(trim(product_name_snapshot), '') is not null
        )
        and id not in (
          select line_id from jsonb_to_recordset(p_lines) as submitted(line_id uuid)
        )
    )
    or exists (
      select 1
      from jsonb_to_recordset(p_lines) as submitted(line_id uuid)
      where not exists (
        select 1
        from public.order_lines
        where id = submitted.line_id
          and order_id = p_order_id
          and not is_void
          and (
            product_id is not null
            or package_id is not null
            or nullif(trim(content_snapshot), '') is not null
            or nullif(trim(product_name_snapshot), '') is not null
          )
      )
    )
  then
    raise exception 'factory_order_print_set_changed' using errcode = '55000';
  end if;

  -- Reject the job when the submitted snapshot no longer matches the current
  -- order line, so a label set printed from stale data can never be recorded as
  -- the latest print and clear the reprint requirement.
  if exists (
    select 1
    from jsonb_to_recordset(p_lines) as submitted(
      line_id uuid,
      product_id uuid,
      package_id uuid,
      product_name_snapshot text,
      content_snapshot text,
      quantity numeric,
      new_quantity_text text,
      remarks_1 text,
      remarks_2 text,
      label_remarks text[],
      is_addon boolean
    )
    join public.order_lines line on line.id = submitted.line_id
    where line.order_id = p_order_id
      and not line.is_void
      and (
        line.product_id is distinct from submitted.product_id
        or line.package_id is distinct from submitted.package_id
        or line.product_name_snapshot is distinct from submitted.product_name_snapshot
        or line.content_snapshot is distinct from submitted.content_snapshot
        or line.quantity is distinct from submitted.quantity
        or line.new_quantity_text is distinct from submitted.new_quantity_text
        or line.remarks_1 is distinct from submitted.remarks_1
        or line.remarks_2 is distinct from submitted.remarks_2
        or line.label_remarks is distinct from submitted.label_remarks
        or line.is_addon is distinct from submitted.is_addon
      )
  ) then
    raise exception 'factory_order_print_stale' using errcode = '55000';
  end if;

  insert into public.factory_label_print_records (
    order_id,
    order_line_id,
    order_number_snapshot,
    label_names,
    quantity,
    item_order,
    remarks,
    printed_by
  )
  select
    p_order_id,
    submitted.line_id,
    v_order_number,
    coalesce(submitted.label_names, '{}'),
    submitted.quantity,
    submitted.item_order,
    coalesce(submitted.remarks, '{}'),
    auth.uid()
  from jsonb_to_recordset(p_lines) as submitted(
    line_id uuid,
    label_names text[],
    quantity numeric,
    item_order integer,
    remarks text[]
  );

  update public.order_lines
  set is_printed = true
  where order_id = p_order_id
    and id in (
      select line_id from jsonb_to_recordset(p_lines) as submitted(line_id uuid)
    );

  update public.factory_order_line_changes
  set resolved_at = now(), resolved_by = auth.uid()
  where order_id = p_order_id
    and order_line_id in (
      select line_id from jsonb_to_recordset(p_lines) as submitted(line_id uuid)
    )
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

revoke all on function public.mark_factory_order_printed(uuid, jsonb) from public;
grant execute on function public.mark_factory_order_printed(uuid, jsonb)
  to authenticated;

comment on table public.factory_label_print_records is
  'Append-only record of every full-order factory label job, with the line content and label details that were printed (FILE-05).';

comment on function public.mark_factory_order_printed(uuid, jsonb) is
  'Atomically records a full QZ order-label job and its line snapshots after validating the exact printable set and content freshness.';
