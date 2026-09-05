-- Restore dependencies missing from drifted environments, remove PL/pgSQL
-- ambiguities reported by `supabase db lint`, and keep customer replies UTF-8.

create table if not exists public.order_email_notification_addresses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.user_profiles(id) on delete cascade,
  email text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint order_email_notification_addresses_email_present
    check (nullif(btrim(email), '') is not null),
  constraint order_email_notification_addresses_email_shape
    check (email ~* '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$')
);

create unique index if not exists order_email_notification_addresses_user_email_key
  on public.order_email_notification_addresses (user_id, lower(btrim(email)));

alter table public.order_email_notification_addresses enable row level security;
revoke all on table public.order_email_notification_addresses from public, anon, authenticated;
grant all on table public.order_email_notification_addresses to service_role;

create or replace function private.order_email_notification_recipients()
returns table (
  user_id uuid,
  recipient_key text,
  recipient_name text,
  recipient_address text
)
language sql
stable
security definer
set search_path = public, private, auth, pg_temp
as $$
  select profile.id,
    profile.id::text,
    coalesce(nullif(btrim(profile.user_name), ''), btrim(profile.email)),
    btrim(profile.email)
  from public.user_profiles profile
  join auth.users auth_user on auth_user.id = profile.id
  where profile.email_noti
    and profile.login_enabled
    and auth_user.deleted_at is null
    and (auth_user.banned_until is null or auth_user.banned_until <= now())
    and nullif(btrim(profile.email), '') is not null

  union all

  select profile.id,
    profile.id::text || ':extra:' || address.id::text,
    coalesce(nullif(btrim(profile.user_name), ''), btrim(profile.email)),
    btrim(address.email)
  from public.user_profiles profile
  join auth.users auth_user on auth_user.id = profile.id
  join public.order_email_notification_addresses address on address.user_id = profile.id
  where profile.email_noti
    and profile.login_enabled
    and auth_user.deleted_at is null
    and (auth_user.banned_until is null or auth_user.banned_until <= now())
    and lower(btrim(address.email)) <> lower(btrim(coalesce(profile.email, '')));
$$;

revoke all on function private.order_email_notification_recipients()
  from public, anon, authenticated;

create or replace function private.refresh_monthly_meat_prices(
  p_raw_meat_item_id uuid,
  p_movement_at timestamptz
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  month_start timestamptz;
  month_end timestamptz;
  version_count integer;
  avg_room numeric(14, 4);
  avg_shop numeric(14, 4);
  shop_rows integer := 0;
  room_rows integer := 0;
  v_raw_legacy_id text;
begin
  if p_raw_meat_item_id is null or p_movement_at is null then
    return jsonb_build_object('status', 'skipped_missing_keys');
  end if;

  month_start := date_trunc('month', p_movement_at at time zone 'Asia/Hong_Kong')
    at time zone 'Asia/Hong_Kong';
  month_end := (date_trunc('month', p_movement_at at time zone 'Asia/Hong_Kong')
    + interval '1 month') at time zone 'Asia/Hong_Kong';

  with outbound as (
    select movement.id, movement.outbound_quantity_kg,
      movement.applied_seasoning_per_kg,
      coalesce(movement.applied_variation_rate, 0) as variation_rate,
      coalesce(movement.applied_markup_rate, 0) as markup_rate
    from public.raw_meat_stock_movements as movement
    where movement.raw_meat_item_id = p_raw_meat_item_id
      and movement.outbound_quantity_kg > 0
      and movement.movement_at >= month_start
      and movement.movement_at < month_end
  ),
  inbound_price as (
    select rel.movement_id, avg(inbound.inbound_unit_price) as inbound_unit_price
    from public.raw_meat_stock_relations as rel
    join public.raw_meat_stock_movements as inbound on inbound.id = rel.inbound_movement_id
    join outbound on outbound.id = rel.movement_id
    where inbound.inbound_unit_price is not null
    group by rel.movement_id
  ),
  yield as (
    select src.raw_stock_movement_id as movement_id,
      sum(prep.inbound_packages * item.kg_per_package) as yield_kg
    from public.prepared_meat_stock_raw_sources as src
    join public.prepared_meat_stock_movements as prep on prep.id = src.prepared_movement_id
    join public.prepared_meat_items as item on item.id = prep.prepared_meat_item_id
    join outbound on outbound.id = src.raw_stock_movement_id
    where prep.inbound_packages > 0 and item.kg_per_package > 0
    group by src.raw_stock_movement_id
  ),
  unit_prices as (
    select
      ((outbound.outbound_quantity_kg * inbound_price.inbound_unit_price
        + outbound.outbound_quantity_kg * coalesce(outbound.applied_seasoning_per_kg, 0))
        * (1 + outbound.variation_rate) / yield.yield_kg) as room_price,
      ((outbound.outbound_quantity_kg * inbound_price.inbound_unit_price
        + outbound.outbound_quantity_kg * coalesce(outbound.applied_seasoning_per_kg, 0))
        * (1 + outbound.variation_rate) / yield.yield_kg)
        * (1 + outbound.markup_rate) as shop_price
    from outbound
    join inbound_price on inbound_price.movement_id = outbound.id
    join yield on yield.movement_id = outbound.id
    where yield.yield_kg > 0
  )
  select round(avg(unit_prices.room_price), 4), round(avg(unit_prices.shop_price), 4)
  into avg_room, avg_shop
  from unit_prices;

  if avg_room is null or avg_shop is null then
    return jsonb_build_object('status', 'skipped_no_computable_rows', 'month_start', month_start);
  end if;

  select count(*) into version_count
  from public.meat_price_versions as price
  where price.raw_meat_item_id = p_raw_meat_item_id
    and price.month_at >= month_start and price.month_at < month_end;

  if version_count = 0 then
    select item.legacy_id into v_raw_legacy_id
    from public.raw_meat_items as item where item.id = p_raw_meat_item_id;

    insert into public.meat_price_versions (
      legacy_id, raw_meat_item_id, raw_meat_item_legacy_id, month_at,
      shop_price, room_price, bubble_created_at, bubble_modified_at
    ) values
      ('web-monthly-meat-price-shop-' || pg_catalog.gen_random_uuid()::text,
       p_raw_meat_item_id, v_raw_legacy_id, month_start, avg_shop, null, now(), now()),
      ('web-monthly-meat-price-room-' || pg_catalog.gen_random_uuid()::text,
       p_raw_meat_item_id, v_raw_legacy_id, month_start, null, avg_room, now(), now());

    return jsonb_build_object(
      'status', 'updated', 'month_start', month_start,
      'shop_price', avg_shop, 'room_price', avg_room,
      'shop_rows', 1, 'room_rows', 1, 'version_count', 2
    );
  end if;

  update public.meat_price_versions as price
  set shop_price = avg_shop, bubble_modified_at = now()
  where price.raw_meat_item_id = p_raw_meat_item_id
    and price.month_at >= month_start and price.month_at < month_end
    and price.shop_price is not null;
  get diagnostics shop_rows = row_count;

  update public.meat_price_versions as price
  set room_price = avg_room, bubble_modified_at = now()
  where price.raw_meat_item_id = p_raw_meat_item_id
    and price.month_at >= month_start and price.month_at < month_end
    and price.room_price is not null;
  get diagnostics room_rows = row_count;

  return jsonb_build_object(
    'status', 'updated', 'month_start', month_start,
    'shop_price', avg_shop, 'room_price', avg_room,
    'shop_rows', shop_rows, 'room_rows', room_rows,
    'version_count', version_count
  );
end;
$$;

revoke all on function private.refresh_monthly_meat_prices(uuid, timestamptz)
  from public, anon, authenticated;
grant execute on function private.refresh_monthly_meat_prices(uuid, timestamptz)
  to service_role;

create or replace function public.save_delivery_fleet_fee(
  p_fleet_id uuid,
  p_district_id uuid,
  p_fee numeric
)
returns table (
  fee_id uuid,
  district_id uuid,
  fleet_id uuid,
  fleet_name text,
  district_name text,
  fee numeric
)
language plpgsql
security definer
set search_path = public, private
as $$
declare
  v_fee_id uuid;
begin
  if not private.has_page_manage('delivery.fleets') then
    raise exception 'page_manage_required' using errcode = '42501';
  end if;
  if p_fee is null or p_fee < 0 then
    raise exception 'fee_invalid' using errcode = '22023';
  end if;
  if not exists (
    select 1 from public.delivery_teams team
    where team.id = p_fleet_id and team.archived_at is null
  ) or not exists (
    select 1 from public.delivery_districts district
    where district.id = p_district_id
      and district.driver_team_id is null and district.archived_at is null
  ) then
    raise exception 'fleet_district_not_found' using errcode = 'P0002';
  end if;

  insert into public.delivery_fleet_district_fees as price (
    delivery_team_id, district_id, fee
  ) values (p_fleet_id, p_district_id, p_fee)
  on conflict on constraint delivery_fleet_district_fees_delivery_team_id_district_id_key
  do update set fee = excluded.fee, updated_at = now()
  returning price.id into v_fee_id;

  return query
  select price.id, district.id, team.id, team.name, district.name, price.fee
  from public.delivery_fleet_district_fees as price
  join public.delivery_teams as team on team.id = price.delivery_team_id
  join public.delivery_districts as district on district.id = price.district_id
  where price.id = v_fee_id;
end;
$$;

revoke all on function public.save_delivery_fleet_fee(uuid, uuid, numeric) from public, anon;
grant execute on function public.save_delivery_fleet_fee(uuid, uuid, numeric) to authenticated;

create or replace function public.enquiry_internal_email_recipients()
returns table (recipient_name text, recipient_address text)
language sql
stable
security definer
set search_path = public, auth, pg_temp
as $$
  select distinct recipients.recipient_name, recipients.recipient_address
  from (
    select coalesce(nullif(btrim(profile.user_name), ''), btrim(profile.email)) as recipient_name,
      btrim(profile.email) as recipient_address
    from public.user_profiles profile
    join auth.users auth_user on auth_user.id = profile.id
    where profile.email_noti and profile.login_enabled
      and auth_user.deleted_at is null
      and (auth_user.banned_until is null or auth_user.banned_until <= now())
      and nullif(btrim(profile.email), '') is not null

    union all

    select coalesce(nullif(btrim(profile.user_name), ''), btrim(profile.email)),
      btrim(address.email)
    from public.user_profiles profile
    join auth.users auth_user on auth_user.id = profile.id
    join public.order_email_notification_addresses address on address.user_id = profile.id
    where profile.email_noti and profile.login_enabled
      and auth_user.deleted_at is null
      and (auth_user.banned_until is null or auth_user.banned_until <= now())
      and nullif(btrim(address.email), '') is not null
  ) recipients;
$$;

revoke all on function public.enquiry_internal_email_recipients()
  from public, anon, authenticated;
grant execute on function public.enquiry_internal_email_recipients() to service_role;

create or replace function public.save_order_email_notification_address(
  p_user_id uuid,
  p_email text
)
returns table (id uuid, user_id uuid, email text)
language plpgsql
security definer
set search_path = public, private, auth, pg_temp
as $$
#variable_conflict use_column
declare
  v_email text := lower(btrim(coalesce(p_email, '')));
begin
  if not private.has_page_manage('orders.settings.email_notifications') then
    raise exception 'page_manage_required' using errcode = '42501';
  end if;
  if v_email !~* '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then
    raise exception 'invalid_email' using errcode = '22023';
  end if;
  if not exists (
    select 1
    from public.user_profiles profile
    join auth.users auth_user on auth_user.id = profile.id
    where profile.id = p_user_id
      and profile.login_enabled
      and auth_user.deleted_at is null
      and (auth_user.banned_until is null or auth_user.banned_until <= now())
  ) then
    raise exception 'notification_user_not_login_enabled' using errcode = 'P0002';
  end if;
  if exists (
    select 1 from public.user_profiles profile
    where profile.id = p_user_id
      and lower(btrim(coalesce(profile.email, ''))) = v_email
  ) then
    raise exception 'notification_email_already_primary' using errcode = '23505';
  end if;

  return query
  insert into public.order_email_notification_addresses as address (user_id, email)
  values (p_user_id, v_email)
  on conflict (user_id, lower(btrim(email))) do update
    set updated_at = now()
  returning address.id, address.user_id, btrim(address.email);
end;
$$;

revoke all on function public.save_order_email_notification_address(uuid, text)
  from public, anon;
grant execute on function public.save_order_email_notification_address(uuid, text)
  to authenticated;

create or replace function public.convert_enquiry_to_quote(
  p_submission_id uuid,
  p_channel_id uuid
)
returns table(id uuid, order_number text)
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_row public.enquiry_submissions;
  v_quote_id uuid;
  v_order_number text;
  v_remarks text;
begin
  if not private.has_page_manage('quotes') then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if p_channel_id is null then
    raise exception 'channel_required' using errcode = '22023';
  end if;

  select submissions.* into v_row
  from public.enquiry_submissions submissions
  where submissions.id = p_submission_id
  for update;
  if not found then
    raise exception 'submission_not_found' using errcode = '22023';
  end if;
  if v_row.converted_quote_id is not null then
    select orders.id, orders.order_number into v_quote_id, v_order_number
    from public.orders orders where orders.id = v_row.converted_quote_id;
    return query select v_quote_id, v_order_number;
    return;
  end if;

  if nullif(btrim(coalesce(v_row.customer_name, '')), '') is null then
    raise exception 'customer_required' using errcode = '22023';
  end if;
  if nullif(btrim(coalesce(v_row.email, '')), '') is null
     and nullif(btrim(coalesce(v_row.phone, '')), '') is null then
    raise exception 'contact_required' using errcode = '22023';
  end if;

  v_remarks := case
    when nullif(btrim(coalesce(v_row.headcount, '')), '') is not null
      then '人數：' || btrim(v_row.headcount)
    else null
  end;

  select quote.id, quote.order_number into v_quote_id, v_order_number
  from public.create_quote(
    p_channel_id, v_row.customer_name, v_row.company_name, v_row.phone,
    null, v_row.email, v_row.shipping_address, null, null, null,
    v_row.delivery_date, v_row.delivery_time, null, v_row.quote_description,
    null, null, v_remarks, '{}'::uuid[], null
  ) as quote;

  update public.orders orders
  set enquiry_submission_id = v_row.id,
    source_system = 'enquiry_form',
    asana_link = v_row.asana_link,
    quote_description_snapshot = coalesce(orders.quote_description_snapshot, v_row.quote_description),
    updated_at = now()
  where orders.id = v_quote_id;

  update public.enquiry_submissions submissions
  set converted_quote_id = v_quote_id, updated_at = now()
  where submissions.id = v_row.id;

  return query select v_quote_id, v_order_number;
end;
$$;

revoke all on function public.convert_enquiry_to_quote(uuid, uuid) from public;
grant execute on function public.convert_enquiry_to_quote(uuid, uuid) to authenticated;

create or replace function public.customer_service_learning_suggestion_review(
  p_id uuid,
  p_status text
)
returns table (
  suggestion_id uuid,
  suggestion_status text,
  target_faq_id uuid
)
language plpgsql
security definer
set search_path = public, private
as $$
declare
  v_suggestion public.customer_service_learning_suggestions%rowtype;
  v_question text;
  v_answer text;
  v_category text;
  v_keywords text;
  v_faq_id uuid;
begin
  if not private.has_page_access('settings.customer_faq.edit') then
    raise exception 'page_access_required' using errcode = '42501';
  end if;
  if p_status not in ('approved', 'rejected') then
    raise exception 'invalid_suggestion_status' using errcode = '22023';
  end if;

  select suggestions.* into v_suggestion
  from public.customer_service_learning_suggestions suggestions
  where suggestions.id = p_id
  for update;
  if not found then
    raise exception 'suggestion_not_found' using errcode = 'P0002';
  end if;
  if v_suggestion.status <> 'draft' then
    raise exception 'suggestion_already_reviewed' using errcode = '55000';
  end if;

  if p_status = 'approved' and v_suggestion.suggestion_type = 'faq' then
    v_question := btrim(coalesce(v_suggestion.proposed_content->>'question', ''));
    v_answer := btrim(coalesce(v_suggestion.proposed_content->>'answer', ''));
    v_category := btrim(coalesce(v_suggestion.proposed_content->>'category', 'ordering'));
    v_keywords := btrim(coalesce(v_suggestion.proposed_content->>'keywords', ''));
    if v_category not in ('ordering', 'delivery', 'payment', 'membership', 'menu') then
      v_category := 'ordering';
    end if;
    if v_question <> '' and v_answer <> '' then
      insert into public.customer_faqs (
        category, question, answer, keywords, locale, is_published, sort_order
      ) values (v_category, v_question, v_answer, v_keywords, 'zh-HK', false, 0)
      on conflict (locale, question) do nothing
      returning customer_faqs.id into v_faq_id;
      if v_faq_id is null then
        select faqs.id into v_faq_id
        from public.customer_faqs faqs
        where faqs.locale = 'zh-HK' and faqs.question = v_question
        limit 1;
      end if;
    end if;
  end if;

  update public.customer_service_learning_suggestions suggestions
  set status = p_status,
    target_faq_id = coalesce(v_faq_id, suggestions.target_faq_id),
    reviewed_by = auth.uid(), reviewed_at = now(), updated_at = now()
  where suggestions.id = p_id;

  return query select p_id, p_status, coalesce(v_faq_id, v_suggestion.target_faq_id);
end;
$$;

revoke all on function public.customer_service_learning_suggestion_review(uuid, text)
  from public, anon;
grant execute on function public.customer_service_learning_suggestion_review(uuid, text)
  to authenticated;

insert into public.customer_service_reply_templates (
  template_key, display_name, content, locale, enabled
)
values
  ('help', '歡迎訊息', '你好，我可以幫你查訂單、記低到會查詢，或者答公司已公布嘅問題（例如運費）。直接講你想問咩就得。', 'zh-HK', true),
  ('handoff', '轉人工', '唔好意思，呢單要同事跟進。我已經幫你交俾同事，稍後會有人回覆你。', 'zh-HK', true),
  ('collect_prompt', '收集到會資料', '你好。未搵到用呢個 WhatsApp 號碼嘅正式訂單。如果你想查到會，請話我知活動日期或者人數，同事會跟進。', 'zh-HK', true),
  ('collect_more', '補充到會資料', '收到。麻煩再提供活動日期或者人數其中一項，我就可以交俾同事跟進。', 'zh-HK', true),
  ('collect_done', '到會資料完成', '已經幫你記低，同事會跟進。唔使再喺 WhatsApp 補電郵。', 'zh-HK', true),
  ('no_faq', '找不到答案', '唔好意思，呢條我未搵到已公布嘅答案。你可以再講多少少，或者等同事協助。', 'zh-HK', true),
  ('refuse', '拒絕非客服問題', '唔好意思，我哋呢度只可以幫你查訂單、到會查詢，或者公司已公布嘅政策。如果需要其他協助，請等同事上線。', 'zh-HK', true)
on conflict (template_key) do update
set display_name = excluded.display_name,
    content = excluded.content,
    locale = excluded.locale,
    enabled = excluded.enabled,
    updated_at = now();
