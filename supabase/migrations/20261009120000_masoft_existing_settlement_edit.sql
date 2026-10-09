-- Existing settlements can contain historical mixed-brand payment links.
-- Editing their metadata must preserve those links and their recorded gross.
-- Patch the implementation in place: production can still have the legacy
-- role-guarded RPC, while other environments have a page-permission wrapper.
-- Keeping each installed function's definition preserves its authorization,
-- grants, material-write locks and existing payment-selection validation.
do $migration$
declare
  v_function record;
  v_definition text;
  v_updated text;
  v_count integer := 0;
  v_anchor text := E'(if coalesce\\(array_length\\(p_payment_ids, 1\\), 0\\) = 0 then[[:space:]]*raise exception ''at least one payment is required'';[[:space:]]*end if;)';
  v_metadata_path text := $path$

  -- masoft_existing_payment_metadata: only bypass selection validation when
  -- the requested payment set is exactly the currently linked payment set.
  if not exists (
    (select distinct unnest(p_payment_ids)
     except
     select payment_id from public.payment_settlement_payments
     where payment_settlement_id = p_settlement_id)
    union all
    (select payment_id from public.payment_settlement_payments
     where payment_settlement_id = p_settlement_id
     except
     select distinct unnest(p_payment_ids))
  ) then
    if v_gross_amount - p_charges < 0 then
      raise exception 'net amount cannot be negative';
    end if;
    update public.payment_settlements
    set invoice_number = nullif(trim(p_invoice_number), ''),
        receipt_number = nullif(trim(p_receipt_number), ''),
        payout_at = p_payout_at::timestamp at time zone 'Asia/Hong_Kong',
        charges = p_charges,
        net_amount = v_gross_amount - p_charges
    where id = p_settlement_id;
    update public.payments
    set payout_at = p_payout_at::timestamp at time zone 'Asia/Hong_Kong',
        updated_at = now()
    where id = any(p_payment_ids);
    return;
  end if;
$path$;
begin
  for v_function in
    select procedure.oid
    from pg_proc procedure
    join pg_namespace namespace on namespace.oid = procedure.pronamespace
    where namespace.nspname = 'public'
      and procedure.proname in ('update_payment_settlement', 'update_payment_settlement_permission_impl')
      and pg_get_function_identity_arguments(procedure.oid) =
        'p_settlement_id uuid, p_invoice_number text, p_receipt_number text, p_payout_at date, p_charges numeric, p_payment_ids uuid[], p_preserve_payment_amount boolean'
  loop
    v_definition := pg_get_functiondef(v_function.oid);
    if position('masoft_existing_payment_metadata' in v_definition) > 0 then
      v_count := v_count + 1;
      continue;
    end if;
    -- Permission-only wrappers have no payment-array validation to patch.
    if position('at least one payment is required' in v_definition) = 0 then
      continue;
    end if;
    v_updated := regexp_replace(v_definition, v_anchor, E'\\1' || v_metadata_path);
    if v_updated = v_definition then
      raise exception 'unexpected settlement implementation; metadata patch not applied';
    end if;
    execute v_updated;
    v_count := v_count + 1;
  end loop;
  if v_count = 0 then
    raise exception 'settlement implementation not found; metadata patch not applied';
  end if;
end;
$migration$;
