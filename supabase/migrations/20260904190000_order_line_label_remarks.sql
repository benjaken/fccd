-- Store one positional remark per product label while retaining the two
-- Bubble-era columns for existing integrations.
alter table public.order_lines
  add column if not exists label_remarks text[] not null default '{}';

update public.order_lines
set label_remarks = case
  when remarks_2 is not null then array[coalesce(remarks_1, ''), remarks_2]
  when remarks_1 is not null then array[remarks_1]
  else '{}'::text[]
end
where cardinality(label_remarks) = 0
  and (remarks_1 is not null or remarks_2 is not null);

create or replace function private.sync_order_line_label_remarks()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_tail text[] := '{}'::text[];
begin
  if tg_op = 'INSERT' then
    if cardinality(new.label_remarks) = 0
       and (new.remarks_1 is not null or new.remarks_2 is not null) then
      new.label_remarks := case when new.remarks_2 is not null
        then array[coalesce(new.remarks_1, ''), new.remarks_2]
        else array[new.remarks_1] end;
    else
      new.remarks_1 := nullif(btrim(new.label_remarks[1]), '');
      new.remarks_2 := nullif(btrim(new.label_remarks[2]), '');
    end if;
    return new;
  end if;

  if new.label_remarks is distinct from old.label_remarks then
    new.remarks_1 := nullif(btrim(new.label_remarks[1]), '');
    new.remarks_2 := nullif(btrim(new.label_remarks[2]), '');
  elsif row(new.remarks_1, new.remarks_2)
        is distinct from row(old.remarks_1, old.remarks_2) then
    if cardinality(old.label_remarks) > 2 then
      v_tail := old.label_remarks[3:cardinality(old.label_remarks)];
    end if;
    new.label_remarks := array[coalesce(new.remarks_1, ''), coalesce(new.remarks_2, '')] || v_tail;
  end if;
  return new;
end;
$$;

drop trigger if exists order_lines_00_sync_label_remarks on public.order_lines;
create trigger order_lines_00_sync_label_remarks
before insert or update of remarks_1, remarks_2, label_remarks on public.order_lines
for each row execute function private.sync_order_line_label_remarks();

create or replace function public.save_order_line_label_remarks_batch(
  p_order_id uuid,
  p_lines jsonb
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if not private.has_sales_document_manage(p_order_id) then
    raise exception 'insufficient_privilege' using errcode = '42501';
  end if;
  if jsonb_typeof(coalesce(p_lines, '[]'::jsonb)) <> 'array' then
    raise exception 'invalid_batch_payload' using errcode = '22023';
  end if;
  if exists (
    select 1
    from jsonb_to_recordset(coalesce(p_lines, '[]'::jsonb))
      as item(id uuid, label_remarks jsonb)
    left join public.order_lines line
      on line.id = item.id and line.order_id = p_order_id and not line.is_void
    where line.id is null or jsonb_typeof(item.label_remarks) <> 'array'
  ) then
    raise exception 'invalid_order_line' using errcode = '22023';
  end if;

  update public.order_lines line
  set label_remarks = array(select jsonb_array_elements_text(item.label_remarks)),
      updated_at = now()
  from jsonb_to_recordset(coalesce(p_lines, '[]'::jsonb))
    as item(id uuid, label_remarks jsonb)
  where line.id = item.id and line.order_id = p_order_id and not line.is_void;
end;
$$;

revoke all on function public.save_order_line_label_remarks_batch(uuid,jsonb)
  from public, anon;
grant execute on function public.save_order_line_label_remarks_batch(uuid,jsonb)
  to authenticated;

-- Third and later remarks must invalidate printed labels and notify Factory,
-- even though the legacy triggers only watch remarks_1 and remarks_2.
create or replace function private.handle_extended_label_remark_change()
returns trigger
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
begin
  if coalesce(new.label_remarks[3:cardinality(new.label_remarks)], '{}'::text[])
     is not distinct from
     coalesce(old.label_remarks[3:cardinality(old.label_remarks)], '{}'::text[])
  then return new; end if;
  new.is_printed := false;
  update public.orders set factory_reprint_required = true
  where id = new.order_id and factory_print_date is not null;
  return new;
end;
$$;

drop trigger if exists order_lines_extended_remark_reprint on public.order_lines;
create trigger order_lines_extended_remark_reprint
before update of label_remarks on public.order_lines
for each row execute function private.handle_extended_label_remark_change();

create or replace function private.notify_extended_label_remark_change()
returns trigger
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
begin
  if coalesce(new.label_remarks[3:cardinality(new.label_remarks)], '{}'::text[])
     is distinct from
     coalesce(old.label_remarks[3:cardinality(old.label_remarks)], '{}'::text[]) then
    perform private.register_factory_change(new.order_id, 'order_line', true, false);
  end if;
  return new;
end;
$$;

drop trigger if exists notify_extended_label_remark_change on public.order_lines;
create trigger notify_extended_label_remark_change
after update of label_remarks on public.order_lines
for each row execute function private.notify_extended_label_remark_change();

create or replace function private.audit_extended_label_remark_change()
returns trigger
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
begin
  if coalesce(new.label_remarks[3:cardinality(new.label_remarks)], '{}'::text[])
     is not distinct from
     coalesce(old.label_remarks[3:cardinality(old.label_remarks)], '{}'::text[])
  then return new; end if;
  if exists (
    select 1 from public.orders where id = new.order_id
      and document_type = 'order' and coalesce(is_sent_to_factory, false)
      and factory_print_date is not null
  ) then
    insert into public.factory_order_line_changes (
      order_id, order_line_id, operation, line_name, changed_fields, changed_by
    ) values (
      new.order_id, new.id, 'update',
      coalesce(nullif(btrim(new.content_snapshot), ''),
               nullif(btrim(new.product_name_snapshot), ''),
               nullif(btrim(new.sku_snapshot), '')),
      jsonb_build_object('label_remarks',
        jsonb_build_object('before', to_jsonb(old.label_remarks),
                           'after', to_jsonb(new.label_remarks))),
      auth.uid()
    );
  end if;
  return new;
end;
$$;

drop trigger if exists audit_extended_label_remark_change on public.order_lines;
create trigger audit_extended_label_remark_change
after update of label_remarks on public.order_lines
for each row execute function private.audit_extended_label_remark_change();

create or replace function public.copy_quote_content(p_source_id uuid, p_target_id uuid)
returns void
language plpgsql
security invoker
set search_path = public
as $$
begin
  if p_source_id = p_target_id then
    raise exception 'quote_copy_same_record' using errcode = '22023';
  end if;
  if not exists (select 1 from public.orders where id = p_source_id
    and document_type in ('quote', 'unconfirmed') and archived_at is null) then
    raise exception 'source_quote_not_found' using errcode = 'P0002';
  end if;
  if not exists (select 1 from public.orders where id = p_target_id
    and document_type = 'quote' and archived_at is null) then
    raise exception 'target_quote_not_found' using errcode = 'P0002';
  end if;

  update public.orders target
  set quote_description_snapshot = source.quote_description_snapshot,
      shipping_fee = coalesce(source.shipping_fee, 0),
      discount_amount = coalesce(source.discount_amount, 0),
      cashdollar_redeemed = coalesce(source.cashdollar_redeemed, 0),
      cashdollar_purchased = coalesce(source.cashdollar_purchased, 0),
      updated_at = now()
  from public.orders source
  where source.id = p_source_id and target.id = p_target_id;

  insert into public.order_lines (
    id, legacy_id, order_id, product_id, product_legacy_id, package_id,
    package_legacy_id, sku_snapshot, product_name_snapshot, content_snapshot,
    quantity, new_quantity_text, unit_price, total_price, item_order, type_sort,
    remarks_1, remarks_2, label_remarks, delivery_at, is_addon, is_void,
    is_printed, is_sent_to_factory
  )
  select gen_random_uuid(), 'web-quote-copy-line-' || gen_random_uuid(), p_target_id,
    source.product_id, source.product_legacy_id, source.package_id,
    source.package_legacy_id, source.sku_snapshot, source.product_name_snapshot,
    source.content_snapshot, source.quantity, source.new_quantity_text,
    source.unit_price, source.total_price, source.item_order, source.type_sort,
    source.remarks_1, source.remarks_2, source.label_remarks, target.delivery_at,
    source.is_addon, false, false, false
  from public.order_lines source cross join public.orders target
  where source.order_id = p_source_id and not source.is_void
    and target.id = p_target_id;

  perform private.recalculate_quote_total(p_target_id);
end;
$$;

revoke all on function public.copy_quote_content(uuid,uuid) from public;
grant execute on function public.copy_quote_content(uuid,uuid) to authenticated;

create or replace function public.convert_quote_to_order(p_quote_id uuid)
returns table(id uuid, order_number text)
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_quote public.orders%rowtype;
  v_order_id uuid;
  v_order_number text;
begin
  select * into v_quote from public.orders
  where orders.id = p_quote_id
    and orders.document_type in ('quote', 'unconfirmed')
    and orders.archived_at is null for update;
  if not found then raise exception 'quote_not_found' using errcode = 'P0002'; end if;

  select orders.id, orders.order_number into v_order_id, v_order_number
  from public.orders where orders.source_quote_id = p_quote_id
    and orders.document_type = 'order' and orders.archived_at is null limit 1;
  if v_order_id is not null then
    return query select v_order_id, v_order_number;
    return;
  end if;

  v_order_id := gen_random_uuid();
  insert into public.orders as inserted (
    id, legacy_id, source_quote_id, customer_id, channel_id, order_number,
    document_type, delivery_status, customer_name_snapshot, company_name_snapshot,
    email_snapshot, contact_number_a_snapshot, contact_number_b_snapshot,
    shipping_address_snapshot, customer_note_snapshot, quote_description_snapshot,
    delivery_terms_snapshot, currency, discount_amount, shipping_fee,
    cashdollar_purchased, cashdollar_redeemed, grand_total, outstanding,
    delivery_at, ship_out_time, remarks, factory_packing_note,
    shipping_method_id, delivery_time, sales_partner_id, asana_link,
    is_quote_original, is_sent_to_factory
  ) values (
    v_order_id, 'web-order-' || v_order_id, p_quote_id, v_quote.customer_id,
    v_quote.channel_id, null, 'order', 'Pending', v_quote.customer_name_snapshot,
    v_quote.company_name_snapshot, v_quote.email_snapshot,
    v_quote.contact_number_a_snapshot, v_quote.contact_number_b_snapshot,
    v_quote.shipping_address_snapshot, v_quote.customer_note_snapshot,
    v_quote.quote_description_snapshot, v_quote.delivery_terms_snapshot,
    v_quote.currency, v_quote.discount_amount, v_quote.shipping_fee,
    v_quote.cashdollar_purchased, v_quote.cashdollar_redeemed,
    v_quote.grand_total, v_quote.outstanding, v_quote.delivery_at,
    v_quote.ship_out_time, v_quote.remarks, v_quote.factory_packing_note,
    v_quote.shipping_method_id, v_quote.delivery_time, v_quote.sales_partner_id,
    v_quote.asana_link, false, false
  ) returning inserted.order_number into v_order_number;

  insert into public.order_lines (
    id, legacy_id, order_id, product_id, package_id, sku_snapshot,
    product_name_snapshot, content_snapshot, quantity, new_quantity_text,
    unit_price, total_price, item_order, type_sort, remarks_1, remarks_2,
    label_remarks, delivery_at, is_addon, is_void, is_printed, is_sent_to_factory
  )
  select gen_random_uuid(), 'web-order-line-' || gen_random_uuid(), v_order_id,
    product_id, package_id, sku_snapshot, product_name_snapshot, content_snapshot,
    quantity, new_quantity_text, unit_price, total_price, item_order, type_sort,
    remarks_1, remarks_2, label_remarks, delivery_at, is_addon,
    false, false, false
  from public.order_lines where order_id = p_quote_id and is_void = false;

  insert into public.deliveries (
    id, legacy_id, order_id, district_id, shipping_method_id, delivery_at,
    delivery_time, ship_out_time, delivery_status, total_fee
  )
  select gen_random_uuid(), 'web-delivery-' || gen_random_uuid(), v_order_id,
    district_id, shipping_method_id, delivery_at, delivery_time, ship_out_time,
    'Pending', total_fee from public.deliveries where order_id = p_quote_id;

  insert into public.order_tag_assignments(order_id, order_tag_id)
  select v_order_id, order_tag_id from public.order_tag_assignments
  where order_id = p_quote_id on conflict do nothing;

  insert into public.payments (
    id, legacy_id, order_id, channel_id, payment_method_id,
    order_number_snapshot, currency, amount, payment_at, payout_at,
    paypal_reference, receipt_reference
  )
  select gen_random_uuid(), 'web-payment-' || gen_random_uuid(), v_order_id,
    channel_id, payment_method_id, v_order_number, currency, amount, payment_at,
    payout_at, paypal_reference, receipt_reference from public.payments
  where order_id = p_quote_id and voided_at is null;

  update public.orders set quote_status = 'Done Deal', archived_at = now(),
    updated_at = now() where orders.id = p_quote_id;
  return query select v_order_id, v_order_number;
end;
$$;

grant execute on function public.convert_quote_to_order(uuid) to authenticated;
