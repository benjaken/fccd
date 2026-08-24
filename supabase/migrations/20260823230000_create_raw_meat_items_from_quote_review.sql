-- A reviewer can explicitly promote an unmatched PDF product into the frozen
-- goods master. Recognition itself remains read-only; this only runs inside
-- the human confirmation transaction.

create or replace function private.resolve_supplier_quote_new_items(
  p_document_id uuid,
  p_parse_run_id uuid,
  p_supplier_id uuid
)
returns integer
language plpgsql
security definer
set search_path = public, private
as $$
declare
  candidate record;
  resolved_item_id uuid;
  resolved_count integer := 0;
  item_name text;
  item_name_key text;
  item_english_name text;
  next_sort_order numeric;
begin
  for candidate in
    select line.id, line.product_name, line.product_name_zh, line.human_product_name
    from public.supplier_quote_lines as line
    where line.document_id = p_document_id
      and (p_parse_run_id is null or line.parse_run_id = p_parse_run_id)
      and line.new_item_requested
      and line.raw_meat_item_id is null
      and line.selection_status = 'unmatched'
    order by line.source_page nulls last, line.created_at, line.id
    for update
  loop
    item_name := coalesce(
      nullif(btrim(candidate.product_name_zh), ''),
      nullif(btrim(candidate.human_product_name), ''),
      nullif(btrim(candidate.product_name), '')
    );

    if item_name is null then
      raise exception 'supplier_quote_new_item_name_required';
    end if;

    item_name_key := lower(regexp_replace(item_name, '\s+', ' ', 'g'));
    item_english_name := case
      when nullif(btrim(candidate.product_name), '') is not null
        and lower(regexp_replace(btrim(candidate.product_name), '\s+', ' ', 'g')) <> item_name_key
      then btrim(candidate.product_name)
      else null
    end;

    -- Serialise equal names across different documents so concurrent reviews
    -- cannot create duplicate master rows.
    perform pg_advisory_xact_lock(
      hashtextextended('supplier-quote-new-item:' || item_name_key, 0)
    );

    select item.id
    into resolved_item_id
    from public.raw_meat_items as item
    where item.archived_at is null
      and (
        lower(regexp_replace(btrim(item.name), '\s+', ' ', 'g')) = item_name_key
        or lower(regexp_replace(btrim(coalesce(item.english_name, '')), '\s+', ' ', 'g')) = item_name_key
      )
    order by item.is_active desc, item.updated_at desc, item.id
    limit 1;

    if resolved_item_id is null then
      select coalesce(max(item.sort_order), 0) + 1
      into next_sort_order
      from public.raw_meat_items as item
      where item.archived_at is null;

      insert into public.raw_meat_items (
        legacy_id,
        sku,
        name,
        english_name,
        unit,
        sort_order,
        can_ship_directly,
        is_active,
        bubble_created_at,
        bubble_modified_at
      )
      values (
        'supplier-quote-raw-meat-' || gen_random_uuid()::text,
        null,
        item_name,
        item_english_name,
        'kg',
        next_sort_order,
        false,
        true,
        now(),
        now()
      )
      returning id into resolved_item_id;
    else
      update public.raw_meat_items
      set is_active = true,
          updated_at = now()
      where id = resolved_item_id
        and not is_active;
    end if;

    insert into public.raw_meat_item_suppliers (
      raw_meat_item_id,
      raw_meat_item_legacy_id,
      supplier_id,
      supplier_legacy_id
    )
    select item.id, item.legacy_id, supplier.id, supplier.legacy_id
    from public.raw_meat_items as item
    join public.suppliers as supplier on supplier.id = p_supplier_id
    where item.id = resolved_item_id
    on conflict (raw_meat_item_id, supplier_id) do nothing;

    update public.supplier_quote_lines
    set raw_meat_item_id = resolved_item_id,
        selection_status = 'confirmed',
        reviewed_by = auth.uid(),
        reviewed_at = now(),
        confirmed_by = auth.uid(),
        confirmed_at = now(),
        updated_at = now()
    where id = candidate.id;

    resolved_count := resolved_count + 1;
    resolved_item_id := null;
  end loop;

  return resolved_count;
end;
$$;

revoke all on function private.resolve_supplier_quote_new_items(uuid, uuid, uuid)
  from public, anon, authenticated;

comment on function private.resolve_supplier_quote_new_items(uuid, uuid, uuid) is
  'Promotes explicitly reviewed unmatched quote lines into raw meat masters and supplier links.';

create or replace function public.confirm_supplier_quote_document(
  p_document_id uuid,
  p_supplier_id uuid,
  p_quote_date date,
  p_effective_date date,
  p_is_baseline boolean,
  p_selections jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public, private
as $$
declare
  selected_count integer;
  latest_run_id uuid;
begin
  if not private.has_page_access('frozen.supplier_quotes.review') then
    raise exception 'insufficient_privilege';
  end if;
  if p_supplier_id is null or p_quote_date is null or p_effective_date is null then
    raise exception 'supplier_and_dates_required';
  end if;
  if p_effective_date < p_quote_date then
    raise exception 'effective_date_before_quote_date';
  end if;
  if jsonb_typeof(coalesce(p_selections, '[]'::jsonb)) <> 'array' then
    raise exception 'invalid_supplier_quote_selections';
  end if;

  select latest_parse_run_id into latest_run_id
  from public.supplier_quote_documents
  where id = p_document_id
  for update;
  if not found then
    raise exception 'supplier_quote_document_not_found';
  end if;

  if exists (
    select 1
    from jsonb_to_recordset(coalesce(p_selections, '[]'::jsonb)) as selection(
      line_id uuid, raw_meat_item_id text, normalized_spec_fingerprint text,
      price_unit text, new_item_requested boolean
    )
    left join public.supplier_quote_lines line on line.id = selection.line_id
    where line.id is null
       or line.document_id <> p_document_id
       or (latest_run_id is not null and line.parse_run_id is distinct from latest_run_id)
       or jsonb_array_length(coalesce(line.validation_errors, '[]'::jsonb)) > 0
       or (nullif(selection.raw_meat_item_id, '') is null and not coalesce(selection.new_item_requested, false))
       or coalesce(nullif(selection.normalized_spec_fingerprint, ''), nullif(line.normalized_spec_fingerprint, '')) is null
       or coalesce(nullif(selection.price_unit, ''), nullif(line.price_unit, '')) is null
  ) then
    raise exception 'invalid_or_unmapped_supplier_quote_selection';
  end if;

  update public.supplier_quote_lines
  set selection_status = 'skipped',
      reviewed_by = auth.uid(),
      reviewed_at = now(),
      updated_at = now()
  where document_id = p_document_id
    and selection_status in ('candidate', 'unmatched', 'skipped')
    and (latest_run_id is null or parse_run_id = latest_run_id);

  update public.supplier_quote_lines as line
  set supplier_id = p_supplier_id,
      raw_meat_item_id = nullif(selection.raw_meat_item_id, '')::uuid,
      selection_status = case
        when nullif(selection.raw_meat_item_id, '') is null then 'unmatched'
        else 'confirmed'
      end,
      normalized_spec_fingerprint = coalesce(
        nullif(selection.normalized_spec_fingerprint, ''),
        line.normalized_spec_fingerprint
      ),
      human_spec_fingerprint = nullif(selection.normalized_spec_fingerprint, ''),
      price_unit = coalesce(nullif(selection.price_unit, ''), line.price_unit),
      human_price_unit = nullif(selection.price_unit, ''),
      new_item_requested = coalesce(selection.new_item_requested, false),
      reviewed_by = auth.uid(),
      reviewed_at = now(),
      confirmed_by = auth.uid(),
      confirmed_at = now(),
      updated_at = now()
  from jsonb_to_recordset(coalesce(p_selections, '[]'::jsonb)) as selection(
    line_id uuid, raw_meat_item_id text, normalized_spec_fingerprint text,
    price_unit text, new_item_requested boolean
  )
  where line.id = selection.line_id
    and line.document_id = p_document_id;

  get diagnostics selected_count = row_count;
  if selected_count = 0 then
    raise exception 'supplier_quote_selection_required';
  end if;

  perform private.resolve_supplier_quote_new_items(
    p_document_id,
    latest_run_id,
    p_supplier_id
  );

  insert into public.supplier_quote_aliases (
    supplier_id,
    raw_meat_item_id,
    supplier_item_code,
    supplier_product_name,
    normalized_spec_fingerprint,
    confidence,
    source_line_id,
    updated_at
  )
  select p_supplier_id,
    line.raw_meat_item_id,
    line.supplier_item_code,
    coalesce(line.human_product_name, line.product_name),
    line.normalized_spec_fingerprint,
    greatest(coalesce(line.match_confidence, 0), 0.95),
    line.id,
    now()
  from public.supplier_quote_lines line
  where line.document_id = p_document_id
    and line.selection_status = 'confirmed'
    and line.raw_meat_item_id is not null
  on conflict (supplier_id, raw_meat_item_id, normalized_spec_fingerprint)
  do update set
    supplier_item_code = excluded.supplier_item_code,
    supplier_product_name = excluded.supplier_product_name,
    confidence = greatest(public.supplier_quote_aliases.confidence, excluded.confidence),
    source_line_id = excluded.source_line_id,
    updated_at = now();

  update public.supplier_quote_documents
  set supplier_id = p_supplier_id,
      quote_date = p_quote_date,
      effective_date = p_effective_date,
      is_baseline = coalesce(p_is_baseline, false),
      status = 'confirmed',
      processing_stage = 'complete',
      confirmed_by = auth.uid(),
      confirmed_at = now(),
      updated_at = now()
  where id = p_document_id;

  return p_document_id;
end;
$$;

revoke all on function public.confirm_supplier_quote_document(uuid, uuid, date, date, boolean, jsonb)
  from public, anon;
grant execute on function public.confirm_supplier_quote_document(uuid, uuid, date, date, boolean, jsonb)
  to authenticated;

comment on function public.confirm_supplier_quote_document(uuid, uuid, date, date, boolean, jsonb) is
  'Confirms the latest reviewed quote run and promotes explicitly requested new meat items.';
