-- Enquiry Form builder, public submissions, and convert-to-quote.

alter table public.orders
  drop constraint if exists orders_source_system_check;

alter table public.orders
  add constraint orders_source_system_check
  check (source_system = any (array['bubble'::text, 'shopify'::text, 'emailmeform'::text, 'enquiry_form'::text]));

alter table public.orders
  add column if not exists enquiry_submission_id uuid;

create table if not exists public.enquiry_forms (
  id uuid primary key default gen_random_uuid(),
  internal_name text not null,
  public_title text not null,
  public_description text not null default '',
  submit_label text not null default 'Submit',
  slug text not null,
  is_default boolean not null default false,
  status text not null default 'draft'
    check (status = any (array['draft'::text, 'published'::text, 'disabled'::text])),
  success_message text not null default '',
  ack_email_subject text not null default '',
  ack_email_body text not null default '',
  asana_project_gid text not null default '',
  questions jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists enquiry_forms_slug_key on public.enquiry_forms (slug);
create unique index if not exists enquiry_forms_one_default
  on public.enquiry_forms (is_default)
  where is_default;

create table if not exists public.enquiry_submissions (
  id uuid primary key default gen_random_uuid(),
  form_id uuid not null references public.enquiry_forms(id),
  form_title text not null,
  form_snapshot jsonb not null,
  answers jsonb not null,
  original_answers jsonb not null,
  idempotency_key text not null,
  reference_code text not null,
  customer_name text,
  salutation text,
  company_name text,
  phone text,
  email text,
  shipping_address text,
  delivery_date_raw text,
  delivery_date date,
  delivery_time text,
  headcount text,
  quote_description text,
  internal_email_status text not null default 'not_sent',
  ack_email_status text not null default 'not_sent',
  asana_status text not null default 'not_created',
  asana_link text,
  converted_quote_id uuid references public.orders(id),
  source_ip text,
  user_agent text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists enquiry_submissions_idempotency_key
  on public.enquiry_submissions (idempotency_key);
create unique index if not exists enquiry_submissions_reference_code
  on public.enquiry_submissions (reference_code);
create index if not exists enquiry_submissions_pending_created_idx
  on public.enquiry_submissions (created_at desc)
  where converted_quote_id is null;

alter table public.orders
  add constraint orders_enquiry_submission_id_fkey
  foreign key (enquiry_submission_id) references public.enquiry_submissions(id);

alter table public.enquiry_forms enable row level security;
alter table public.enquiry_submissions enable row level security;

drop policy if exists "Quotes readers select enquiry forms" on public.enquiry_forms;
create policy "Quotes readers select enquiry forms"
  on public.enquiry_forms for select to authenticated
  using (private.has_page_access('quotes'));

drop policy if exists "Quotes managers write enquiry forms" on public.enquiry_forms;
create policy "Quotes managers write enquiry forms"
  on public.enquiry_forms for all to authenticated
  using (private.has_page_manage('quotes'))
  with check (private.has_page_manage('quotes'));

drop policy if exists "Quotes readers select enquiry submissions" on public.enquiry_submissions;
create policy "Quotes readers select enquiry submissions"
  on public.enquiry_submissions for select to authenticated
  using (private.has_page_access('quotes'));

drop policy if exists "Quotes managers update enquiry submissions" on public.enquiry_submissions;
create policy "Quotes managers update enquiry submissions"
  on public.enquiry_submissions for update to authenticated
  using (private.has_page_manage('quotes'))
  with check (private.has_page_manage('quotes'));

grant select, insert, update on public.enquiry_forms to authenticated;
grant select, update on public.enquiry_submissions to authenticated;

create or replace function private.enquiry_answer_text(p_value jsonb)
returns text
language sql
immutable
as $$
  select case
    when p_value is null or p_value = 'null'::jsonb then ''
    when jsonb_typeof(p_value) = 'array' then (
      select string_agg(trim(both '"' from item::text), '、' order by ordinality)
      from jsonb_array_elements(p_value) with ordinality as t(item, ordinality)
      where trim(both '"' from item::text) <> ''
    )
    when jsonb_typeof(p_value) = 'number' then trim(both '"' from p_value::text)
    else nullif(btrim(trim(both '"' from p_value::text)), '')
  end;
$$;

create or replace function public.get_published_enquiry_form(p_slug text default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_row public.enquiry_forms;
begin
  if nullif(btrim(coalesce(p_slug, '')), '') is null then
    select * into v_row
    from public.enquiry_forms
    where status = 'published' and is_default
    order by updated_at desc
    limit 1;
  else
    select * into v_row
    from public.enquiry_forms
    where status = 'published' and slug = btrim(p_slug)
    limit 1;
  end if;

  if not found then
    return null;
  end if;

  return jsonb_build_object(
    'id', v_row.id,
    'internal_name', v_row.internal_name,
    'public_title', v_row.public_title,
    'public_description', v_row.public_description,
    'submit_label', v_row.submit_label,
    'slug', v_row.slug,
    'is_default', v_row.is_default,
    'status', v_row.status,
    'success_message', v_row.success_message,
    'ack_email_subject', '',
    'ack_email_body', '',
    'asana_project_gid', '',
    'questions', v_row.questions,
    'created_at', v_row.created_at,
    'updated_at', v_row.updated_at
  );
end;
$$;

revoke all on function public.get_published_enquiry_form(text) from public;
grant execute on function public.get_published_enquiry_form(text) to anon, authenticated;

create or replace function public.submit_enquiry_form(
  p_form_id uuid,
  p_answers jsonb,
  p_idempotency_key text,
  p_honeypot text default null
)
returns table(id uuid, reference_code text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_form public.enquiry_forms;
  v_existing public.enquiry_submissions;
  v_id uuid := gen_random_uuid();
  v_code text;
  v_question jsonb;
  v_key text;
  v_field text;
  v_text text;
  v_customer_name text;
  v_salutation text;
  v_company_name text;
  v_phone text;
  v_email text;
  v_address text;
  v_delivery_raw text;
  v_delivery_date date;
  v_delivery_time text;
  v_headcount text;
  v_quote_description text;
  v_ack_status text;
begin
  if nullif(btrim(coalesce(p_honeypot, '')), '') is not null then
    return query select v_id, 'ENQ-IGNORED';
    return;
  end if;

  if nullif(btrim(coalesce(p_idempotency_key, '')), '') is null then
    raise exception 'idempotency_required' using errcode = '22023';
  end if;

  select * into v_existing
  from public.enquiry_submissions
  where idempotency_key = p_idempotency_key;
  if found then
    return query select v_existing.id, v_existing.reference_code;
    return;
  end if;

  select * into v_form
  from public.enquiry_forms
  where id = p_form_id and status = 'published';
  if not found then
    raise exception 'form_unavailable' using errcode = '22023';
  end if;

  for v_question in select * from jsonb_array_elements(coalesce(v_form.questions, '[]'::jsonb))
  loop
    v_key := v_question->>'field_key';
    v_field := nullif(v_question->>'quote_field', '');
    v_text := private.enquiry_answer_text(p_answers -> v_key);
    if v_field = 'customer_name' then v_customer_name := v_text; end if;
    if v_field = 'salutation' then v_salutation := v_text; end if;
    if v_field = 'company_name' then v_company_name := v_text; end if;
    if v_field = 'phone' then v_phone := v_text; end if;
    if v_field = 'email' then v_email := v_text; end if;
    if v_field = 'shipping_address' then v_address := v_text; end if;
    if v_field = 'delivery_date' then
      v_delivery_raw := v_text;
      begin
        if v_text ~ '^\d{4}-\d{2}-\d{2}$' then
          v_delivery_date := v_text::date;
        end if;
      exception when others then
        v_delivery_date := null;
      end;
    end if;
    if v_field = 'delivery_time' then v_delivery_time := v_text; end if;
    if v_field = 'headcount' then v_headcount := v_text; end if;
    if v_field = 'quote_description' then v_quote_description := v_text; end if;
  end loop;

  v_code := 'ENQ' || to_char(timezone('Asia/Hong_Kong', now()), 'YYYYMMDD') || '-' || substr(replace(v_id::text, '-', ''), 1, 6);
  v_ack_status := case
    when v_email ~* '^[^\s@]+@[^\s@]+\.[^\s@]+$' then 'not_sent'
    else 'no_email'
  end;

  insert into public.enquiry_submissions (
    id, form_id, form_title, form_snapshot, answers, original_answers,
    idempotency_key, reference_code, customer_name, salutation, company_name,
    phone, email, shipping_address, delivery_date_raw, delivery_date, delivery_time,
    headcount, quote_description, internal_email_status, ack_email_status, asana_status
  ) values (
    v_id, v_form.id, v_form.public_title, v_form.questions, coalesce(p_answers, '{}'::jsonb),
    coalesce(p_answers, '{}'::jsonb), p_idempotency_key, v_code,
    nullif(v_customer_name, ''), nullif(v_salutation, ''), nullif(v_company_name, ''),
    nullif(v_phone, ''), nullif(v_email, ''), nullif(v_address, ''),
    nullif(v_delivery_raw, ''), v_delivery_date, nullif(v_delivery_time, ''),
    nullif(v_headcount, ''), nullif(v_quote_description, ''),
    'not_sent', v_ack_status, 'not_created'
  );

  return query select v_id, v_code;
end;
$$;

revoke all on function public.submit_enquiry_form(uuid, jsonb, text, text) from public;
grant execute on function public.submit_enquiry_form(uuid, jsonb, text, text) to anon, authenticated;

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

  select * into v_row
  from public.enquiry_submissions
  where id = p_submission_id
  for update;
  if not found then
    raise exception 'submission_not_found' using errcode = '22023';
  end if;
  if v_row.converted_quote_id is not null then
    select o.id, o.order_number into v_quote_id, v_order_number
    from public.orders o
    where o.id = v_row.converted_quote_id;
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

  select cq.id, cq.order_number
    into v_quote_id, v_order_number
  from public.create_quote(
    p_channel_id,
    v_row.customer_name,
    v_row.company_name,
    v_row.phone,
    null,
    v_row.email,
    v_row.shipping_address,
    null,
    null,
    null,
    v_row.delivery_date,
    v_row.delivery_time,
    null,
    v_row.quote_description,
    null,
    null,
    v_remarks,
    '{}'::uuid[],
    null
  ) as cq;

  update public.orders
  set
    enquiry_submission_id = v_row.id,
    source_system = 'enquiry_form',
    asana_link = v_row.asana_link,
    quote_description_snapshot = coalesce(quote_description_snapshot, v_row.quote_description),
    updated_at = now()
  where public.orders.id = v_quote_id;

  update public.enquiry_submissions
  set converted_quote_id = v_quote_id, updated_at = now()
  where public.enquiry_submissions.id = v_row.id;

  return query select v_quote_id, v_order_number;
end;
$$;

revoke all on function public.convert_enquiry_to_quote(uuid, uuid) from public;
grant execute on function public.convert_enquiry_to_quote(uuid, uuid) to authenticated;

insert into public.enquiry_forms (
  id, internal_name, public_title, public_description, submit_label, slug,
  is_default, status, success_message, questions
) values (
  '0d427475-b85a-4f6f-97c3-0c29b3d28025',
  'FC Catering Enquiry',
  'FC Catering + Lunch Box 餐飲到會+活動策劃網上查詢',
  '榮獲ISO 9001食品到會 及 香港Q嘜優質服務認證 (since 2009)',
  'Submit',
  'quote-inquiry',
  true,
  'published',
  '我們已收到你的查詢，稍後會有專人回覆。',
  $seed$[{"field_key":"name","type":"input","title":"姓名","hint":"","required":true,"quote_field":"customer_name","input_format":"general","min_number":null,"max_number":null,"require_all_options":false,"default_value":null,"options":[]},{"field_key":"salutation","type":"radio","title":"稱謂","hint":"","required":true,"quote_field":"salutation","input_format":"general","min_number":null,"max_number":null,"require_all_options":false,"default_value":null,"options":[{"label":"先生","value":"先生","default_checked":false},{"label":"小姐","value":"小姐","default_checked":false},{"label":"女士","value":"女士","default_checked":false},{"label":"太太","value":"太太","default_checked":false}]},{"field_key":"company","type":"input","title":"公司/機構名稱","hint":"","required":false,"quote_field":"company_name","input_format":"general","min_number":null,"max_number":null,"require_all_options":false,"default_value":null,"options":[]},{"field_key":"phone","type":"input","title":"聯絡電話","hint":"","required":true,"quote_field":"phone","input_format":"phone","min_number":null,"max_number":null,"require_all_options":false,"default_value":null,"options":[]},{"field_key":"email","type":"input","title":"電郵地址","hint":"","required":true,"quote_field":"email","input_format":"email","min_number":null,"max_number":null,"require_all_options":false,"default_value":null,"options":[]},{"field_key":"address","type":"input","title":"送貨地址","hint":"","required":true,"quote_field":"shipping_address","input_format":"general","min_number":null,"max_number":null,"require_all_options":false,"default_value":null,"options":[]},{"field_key":"catering_style","type":"checkbox","title":"有興趣了解的到會形式（可選多於一項）","hint":"","required":true,"quote_field":null,"input_format":"general","min_number":null,"max_number":null,"require_all_options":false,"default_value":null,"options":[{"label":"正餐 到會  (大盤)","value":"正餐 到會  (大盤)","default_checked":false},{"label":"小食 到會 (大盤)","value":"小食 到會 (大盤)","default_checked":false},{"label":"經濟飯盒 (正餐)","value":"經濟飯盒 (正餐)","default_checked":false},{"label":"高級飯盒 (正餐)","value":"高級飯盒 (正餐)","default_checked":false},{"label":"下午茶餐盒","value":"下午茶餐盒","default_checked":false},{"label":"水果餐盒","value":"水果餐盒","default_checked":false}]},{"field_key":"event_nature","type":"checkbox","title":"活動性質（可選多於一項）","hint":"","required":false,"quote_field":null,"input_format":"general","min_number":null,"max_number":null,"require_all_options":false,"default_value":null,"options":[{"label":"朋友聚會","value":"朋友聚會","default_checked":false},{"label":"公司開幕禮","value":"公司開幕禮","default_checked":false},{"label":"產品發佈會","value":"產品發佈會","default_checked":false},{"label":"雞尾酒會","value":"雞尾酒會","default_checked":false},{"label":"生日會","value":"生日會","default_checked":false},{"label":"私人聚會","value":"私人聚會","default_checked":false},{"label":"工作坊","value":"工作坊","default_checked":false},{"label":"公司慶祝","value":"公司慶祝","default_checked":false},{"label":"商務訂餐","value":"商務訂餐","default_checked":false},{"label":"NGO院舍","value":"NGO院舍","default_checked":false},{"label":"學校團購","value":"學校團購","default_checked":false},{"label":"展會送餐","value":"展會送餐","default_checked":false},{"label":"拍攝片場","value":"拍攝片場","default_checked":false},{"label":"地盤工地","value":"地盤工地","default_checked":false}]},{"field_key":"event_audience","type":"checkbox","title":"活動對象（可選多於一項）","hint":"","required":false,"quote_field":null,"input_format":"general","min_number":null,"max_number":null,"require_all_options":false,"default_value":null,"options":[{"label":"同事","value":"同事","default_checked":false},{"label":"管理層","value":"管理層","default_checked":false},{"label":"客戶","value":"客戶","default_checked":false},{"label":"重要客戶","value":"重要客戶","default_checked":false},{"label":"朋友","value":"朋友","default_checked":false},{"label":"同學","value":"同學","default_checked":false},{"label":"院友","value":"院友","default_checked":false},{"label":"老師","value":"老師","default_checked":false},{"label":"外藉人士","value":"外藉人士","default_checked":false},{"label":"其他對象","value":"其他對象","default_checked":false}]},{"field_key":"event_venue","type":"checkbox","title":"你預計的活動地點（可選多於一項）","hint":"","required":false,"quote_field":null,"input_format":"general","min_number":null,"max_number":null,"require_all_options":false,"default_value":null,"options":[{"label":"自己公司 Company Room","value":"自己公司 Company Room","default_checked":false},{"label":"餐廳 Restaurant","value":"餐廳 Restaurant","default_checked":false},{"label":"院舍內 Inside Building","value":"院舍內 Inside Building","default_checked":false},{"label":"學校 School","value":"學校 School","default_checked":false},{"label":"酒店 Hotels","value":"酒店 Hotels","default_checked":false},{"label":"戶外場地 Outdoor","value":"戶外場地 Outdoor","default_checked":false},{"label":"其他場地 Others","value":"其他場地 Others","default_checked":false}]},{"field_key":"headcount","type":"number","title":"預算活動人數","hint":"","required":true,"quote_field":"headcount","input_format":"general","min_number":1,"max_number":10000,"require_all_options":false,"default_value":null,"options":[]},{"field_key":"event_date","type":"input","title":"預算活動日期","hint":"指定日期 / 預算月份均可","required":true,"quote_field":"delivery_date","input_format":"general","min_number":null,"max_number":null,"require_all_options":false,"default_value":null,"options":[]},{"field_key":"order_frequency","type":"checkbox","title":"活動訂餐頻率","hint":"","required":false,"quote_field":null,"input_format":"general","min_number":null,"max_number":null,"require_all_options":false,"default_value":null,"options":[{"label":"單次活動 Single Event","value":"單次活動 Single Event","default_checked":false},{"label":"連續幾天活動 a Few Days","value":"連續幾天活動 a Few Days","default_checked":false},{"label":"持續需要 Continous","value":"持續需要 Continous","default_checked":false},{"label":"不定時需要 Not Regular","value":"不定時需要 Not Regular","default_checked":false},{"label":"未知 Not yet decided","value":"未知 Not yet decided","default_checked":false}]},{"field_key":"cuisine","type":"checkbox","title":"菜式 (可選多於一項)","hint":"","required":false,"quote_field":null,"input_format":"general","min_number":null,"max_number":null,"require_all_options":false,"default_value":null,"options":[{"label":"中餐 Chinese","value":"中餐 Chinese","default_checked":false},{"label":"西餐 Western","value":"西餐 Western","default_checked":false},{"label":"港式 HK Style","value":"港式 HK Style","default_checked":false},{"label":"節慶 Festival","value":"節慶 Festival","default_checked":false},{"label":"日式 Japanese","value":"日式 Japanese","default_checked":false},{"label":"東南亞 Asian","value":"東南亞 Asian","default_checked":false},{"label":"素食 Vegetarian","value":"素食 Vegetarian","default_checked":false},{"label":"軟餐/糊餐/碎餐 Minced","value":"軟餐/糊餐/碎餐 Minced","default_checked":false},{"label":"清真  Halal","value":"清真  Halal","default_checked":false},{"label":"無所謂 Any","value":"無所謂 Any","default_checked":false},{"label":"其他要求 Others","value":"其他要求 Others","default_checked":false}]},{"field_key":"event_time","type":"radio","title":"預算活動時段","hint":"","required":true,"quote_field":"delivery_time","input_format":"general","min_number":null,"max_number":null,"require_all_options":false,"default_value":null,"options":[{"label":"平日早上(大約10-11am)","value":"平日早上(大約10-11am)","default_checked":false},{"label":"平日中午(大約11-2pm)","value":"平日中午(大約11-2pm)","default_checked":false},{"label":"平日下午(大約2-5pm)","value":"平日下午(大約2-5pm)","default_checked":false},{"label":"平日晚上(大約5-7pm)","value":"平日晚上(大約5-7pm)","default_checked":false},{"label":"平日晚上(大約7-9pm)","value":"平日晚上(大約7-9pm)","default_checked":false},{"label":"周未早上(大約10-11am)","value":"周未早上(大約10-11am)","default_checked":false},{"label":"周未中午(大約11-2pm)","value":"周未中午(大約11-2pm)","default_checked":false},{"label":"周未下午(大約2-5pm)","value":"周未下午(大約2-5pm)","default_checked":false},{"label":"周未晚上(大約5-7pm)","value":"周未晚上(大約5-7pm)","default_checked":false},{"label":"周未晚上(大約7-9pm)","value":"周未晚上(大約7-9pm)","default_checked":false},{"label":"未決定/想查詢特定時間","value":"未決定/想查詢特定時間","default_checked":false}]},{"field_key":"delivery_area","type":"radio","title":"送餐地區及方式（訂滿$2800可免地面交收運費）","hint":"","required":true,"quote_field":null,"input_format":"general","min_number":null,"max_number":null,"require_all_options":false,"default_value":null,"options":[{"label":"新界區/九龍區 地面車邊交收 (+$50)","value":"新界區/九龍區 地面車邊交收 (+$50)","default_checked":false},{"label":"港島區 地面車邊交收 (+$100)","value":"港島區 地面車邊交收 (+$100)","default_checked":false},{"label":"免費地面車邊交收送貨 (訂滿$2800)","value":"免費地面車邊交收送貨 (訂滿$2800)","default_checked":false},{"label":"新界區/九龍區 送貨上門 (+$250)","value":"新界區/九龍區 送貨上門 (+$250)","default_checked":false},{"label":"港島區 送貨上門 (+$350)","value":"港島區 送貨上門 (+$350)","default_checked":false},{"label":"侍應+食物一齊到場 ($1200/4小時)","value":"侍應+食物一齊到場 ($1200/4小時)","default_checked":false},{"label":"未確定送貨方式","value":"未確定送貨方式","default_checked":false}]},{"field_key":"manpower","type":"checkbox","title":"參與人手（可選多於一項）","hint":"","required":false,"quote_field":null,"input_format":"general","min_number":null,"max_number":null,"require_all_options":false,"default_value":null,"options":[{"label":"自有人手 Self Manpower","value":"自有人手 Self Manpower","default_checked":false},{"label":"侍應到場 Waiter on Site","value":"侍應到場 Waiter on Site","default_checked":false},{"label":"活動助理 Helper","value":"活動助理 Helper","default_checked":false},{"label":"流程主任 Rundown Supervisor","value":"流程主任 Rundown Supervisor","default_checked":false},{"label":"現場司儀 MC","value":"現場司儀 MC","default_checked":false},{"label":"遊戲節目主持 Game Host","value":"遊戲節目主持 Game Host","default_checked":false},{"label":"不定時需要 Not Regular","value":"不定時需要 Not Regular","default_checked":false},{"label":"未知 Not yet decided","value":"未知 Not yet decided","default_checked":false}]},{"field_key":"event_planning","type":"checkbox","title":"活動策劃（可選多於一項）","hint":"","required":false,"quote_field":null,"input_format":"general","min_number":null,"max_number":null,"require_all_options":false,"default_value":null,"options":[{"label":"自行安排 Self Arrangement","value":"自行安排 Self Arrangement","default_checked":false},{"label":"影相背景牆  Backdrop","value":"影相背景牆  Backdrop","default_checked":false},{"label":"現場佈置裝飾 Decoration","value":"現場佈置裝飾 Decoration","default_checked":false},{"label":"博客或媒體到場 Blogger  & Media","value":"博客或媒體到場 Blogger  & Media","default_checked":false},{"label":"活動場地選擇 Venue Advice","value":"活動場地選擇 Venue Advice","default_checked":false},{"label":"專業品酒師 Sommelier","value":"專業品酒師 Sommelier","default_checked":false},{"label":"VIP禮品 (+logo) Premium","value":"VIP禮品 (+logo) Premium","default_checked":false},{"label":"派對魔術表演 Party Magic Show","value":"派對魔術表演 Party Magic Show","default_checked":false},{"label":"現場扭氣球 Balloon Twisting","value":"現場扭氣球 Balloon Twisting","default_checked":false},{"label":"面部 / 身體彩繪 Artist","value":"面部 / 身體彩繪 Artist","default_checked":false},{"label":"不需要","value":"不需要","default_checked":false}]},{"field_key":"utensils","type":"checkbox","title":"環保餐具","hint":"","required":true,"quote_field":null,"input_format":"general","min_number":null,"max_number":null,"require_all_options":false,"default_value":null,"options":[{"label":"必須要環保餐具","value":"必須要環保餐具","default_checked":false},{"label":"外表優先, 可用塑膠","value":"外表優先, 可用塑膠","default_checked":false},{"label":"現場侍應服務, 用正式餐具","value":"現場侍應服務, 用正式餐具","default_checked":false},{"label":"無所謂, 兩款都可以","value":"無所謂, 兩款都可以","default_checked":false}]},{"field_key":"payment","type":"radio","title":"付款方式","hint":"","required":false,"quote_field":null,"input_format":"general","min_number":null,"max_number":null,"require_all_options":false,"default_value":null,"options":[{"label":"在送餐前以銀行轉帳","value":"在送餐前以銀行轉帳","default_checked":false},{"label":"在送餐前用信用卡付款 (+3%手續費)","value":"在送餐前用信用卡付款 (+3%手續費)","default_checked":false},{"label":"需要分期付款，先付6成按金確認訂單，尾數在送餐當日付款","value":"需要分期付款，先付6成按金確認訂單，尾數在送餐當日付款","default_checked":false},{"label":"需要其他方法，請與客服聯絡","value":"需要其他方法，請與客服聯絡","default_checked":false},{"label":"未確定","value":"未確定","default_checked":false}]},{"field_key":"budget_flex","type":"radio","title":"預算的彈性","hint":"","required":false,"quote_field":null,"input_format":"general","min_number":null,"max_number":null,"require_all_options":false,"default_value":null,"options":[{"label":"初步想法, 未有確定","value":"初步想法, 未有確定","default_checked":false},{"label":"必須 預算範圍內","value":"必須 預算範圍內","default_checked":false},{"label":"活動性質關係, 越平越好!","value":"活動性質關係, 越平越好!","default_checked":false},{"label":"食品質素最重要, 可要更好建議","value":"食品質素最重要, 可要更好建議","default_checked":false},{"label":"價錢佔70%以上評分 + 平衡產品品質","value":"價錢佔70%以上評分 + 平衡產品品質","default_checked":false},{"label":"私人活動, 預算有彈性","value":"私人活動, 預算有彈性","default_checked":false}]},{"field_key":"budget","type":"input","title":"初步食物到會預算 (人均/總計)（方便出報價）","hint":"Budget Idea 預算範圍 eg. $15000-20000","required":true,"quote_field":null,"input_format":"general","min_number":null,"max_number":null,"require_all_options":false,"default_value":null,"options":[]},{"field_key":"remarks","type":"textarea","title":"特別需要或留言","hint":"","required":false,"quote_field":"quote_description","input_format":"general","min_number":null,"max_number":null,"require_all_options":false,"default_value":null,"options":[]},{"field_key":"terms","type":"checkbox","title":"了解條款及政策","hint":"","required":true,"quote_field":null,"input_format":"general","min_number":null,"max_number":null,"require_all_options":true,"default_value":null,"options":[{"label":"謹此聲明活動內所有參與的人士都年滿 18 歲或以上","value":"謹此聲明活動內所有參與的人士都年滿 18 歲或以上","default_checked":true},{"label":"本人確認已經細閱、明白及同意網上購物條款及細則及私隱政策，及個人資料的收集及使用","value":"本人確認已經細閱、明白及同意網上購物條款及細則及私隱政策，及個人資料的收集及使用","default_checked":true}]}]$seed$::jsonb
)
on conflict (id) do nothing;
