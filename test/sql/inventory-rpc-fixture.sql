-- Dependency contract for executing the actual sales-document RPC in isolation.
alter table orders add column shipping_fee numeric, add column discount_amount numeric,
  add column cashdollar_redeemed numeric, add column cashdollar_purchased numeric,
  add column do_not_send_to_factory boolean, add column updated_at timestamptz,
  add column factory_reprint_required boolean, add column factory_print_date timestamptz,
  add column source_quote_id uuid;
alter table order_lines add column unit_price numeric, add column total_price numeric,
  add column label_remarks text[], add column remarks_1 text, add column remarks_2 text,
  add column updated_at timestamptz, add column is_printed boolean;
create table payments(id uuid primary key, legacy_id text, order_id uuid, channel_id uuid,
  payment_method_id uuid, order_number_snapshot text, currency text, amount numeric,
  payment_at timestamptz, receipt_reference text, voided_at timestamptz);
create table factory_change_tasks(id uuid);
create table private.customer_self_service_sessions(id uuid);
create table customer_self_service_addon_checkouts(id uuid);
create table enquiry_submissions(id uuid);
create function private.has_sales_document_manage(uuid) returns boolean language sql as $$ select private.has_page_manage('orders') $$;
-- Totals recalculation is outside the inventory/locking test boundary.
create function private.recalculate_quote_total(uuid) returns void language sql as $$ select pg_sleep(0) $$;
grant usage on schema private to authenticated;
grant select, update on orders to authenticated;
-- API dependencies retain the production restrictive material-consumption FK.
create function auth.jwt() returns jsonb language sql as $$
  select jsonb_build_object('app_metadata',jsonb_build_object('role',coalesce(current_setting('test.jwt_role',true),'Admin')))
$$;
create table delivery_surcharges(id uuid primary key default gen_random_uuid(), delivery_id uuid references deliveries);
alter table deliveries add column basic_fee numeric default 0, add column total_fee numeric default 0;
-- Actual create_quote executes these columns in the lock-order regression.
alter table orders add column legacy_id text, add column channel_id uuid, add column quote_status text,
  add column customer_name_snapshot text, add column company_name_snapshot text, add column email_snapshot text,
  add column contact_number_a_snapshot text, add column contact_number_b_snapshot text,
  add column shipping_address_snapshot text, add column customer_note_snapshot text, add column shipping_method_id uuid,
  add column delivery_time text, add column ship_out_time text, add column factory_packing_note text,
  add column sales_partner_id uuid, add column remarks text, add column grand_total numeric, add column outstanding numeric,
  add column is_quote_original boolean;
create table order_tag_assignments(order_id uuid,order_tag_id uuid,unique(order_id,order_tag_id));
