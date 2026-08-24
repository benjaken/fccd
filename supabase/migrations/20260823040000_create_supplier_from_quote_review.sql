-- Allow supplier quote reviewers to create a genuinely new supplier during confirmation.
-- Placeholder names are rejected and duplicate names are reused safely.

create or replace function public.create_supplier_from_quote_review(p_company_name text)
returns uuid
language plpgsql
security definer
set search_path = public, private
as $$
declare
  v_name text := regexp_replace(btrim(coalesce(p_company_name, '')), '\s+', ' ', 'g');
  v_normalized text;
  v_supplier_id uuid;
  v_now timestamptz := now();
begin
  if not private.has_page_access('frozen.supplier_quotes.review') then
    raise exception 'supplier_quote_review_permission_required';
  end if;

  v_normalized := lower(regexp_replace(v_name, '[._\s-]+', '', 'g'));
  if v_normalized = '' or v_normalized in (
    'na', 'n/a', 'unknown', 'unknownsupplier', '未知', '不詳', '待確認供應商'
  ) then
    raise exception 'valid_supplier_name_required';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(lower(v_name), 0));

  select supplier.id
    into v_supplier_id
  from public.suppliers supplier
  where lower(btrim(supplier.company_name)) = lower(v_name)
  order by supplier.archived_at nulls first, supplier.created_at
  limit 1;

  if v_supplier_id is not null then
    update public.suppliers
    set is_active = true,
        archived_at = null,
        updated_at = v_now,
        bubble_modified_at = v_now
    where id = v_supplier_id;
    return v_supplier_id;
  end if;

  insert into public.suppliers (
    legacy_id, company_name, is_active, bubble_created_at, bubble_modified_at,
    created_at, updated_at
  ) values (
    'quote-review-supplier-' || gen_random_uuid()::text,
    v_name,
    true,
    v_now,
    v_now,
    v_now,
    v_now
  ) returning id into v_supplier_id;

  return v_supplier_id;
end;
$$;

revoke all on function public.create_supplier_from_quote_review(text) from public, anon;
grant execute on function public.create_supplier_from_quote_review(text) to authenticated;
