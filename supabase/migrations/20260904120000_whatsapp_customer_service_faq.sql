-- WhatsApp customer-service FAQ, bot switch, inbound audit, and quote source.
-- Bot defaults off. Does not alter wati_notification_controls.

create extension if not exists pg_trgm;

alter table public.orders drop constraint if exists orders_source_system_check;
alter table public.orders
  add constraint orders_source_system_check
  check (source_system = any (array[
    'bubble'::text,
    'shopify'::text,
    'emailmeform'::text,
    'enquiry_form'::text,
    'whatsapp'::text
  ]));

create table if not exists public.customer_service_controls (
  id text primary key default 'global' check (id = 'global'),
  bot_enabled boolean not null default false,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null
);

insert into public.customer_service_controls (id)
values ('global')
on conflict (id) do nothing;

create table if not exists public.customer_faqs (
  id uuid primary key default gen_random_uuid(),
  category text not null check (length(btrim(category)) > 0),
  question text not null check (length(btrim(question)) > 0),
  answer text not null check (length(btrim(answer)) > 0),
  keywords text not null default '',
  locale text not null default 'zh-HK',
  is_published boolean not null default false,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists customer_faqs_category_sort_idx
  on public.customer_faqs (category, sort_order, question);
create index if not exists customer_faqs_question_trgm_idx
  on public.customer_faqs using gin (question gin_trgm_ops);
create index if not exists customer_faqs_keywords_trgm_idx
  on public.customer_faqs using gin (keywords gin_trgm_ops);
create index if not exists customer_faqs_published_sort_idx
  on public.customer_faqs (is_published, sort_order)
  where is_published;
create unique index if not exists customer_faqs_locale_question_uidx
  on public.customer_faqs (locale, question);

create table if not exists public.customer_service_inbound_events (
  id uuid primary key default gen_random_uuid(),
  provider_message_id text not null unique,
  phone_normalized text not null,
  body text not null default '',
  received_at timestamptz not null default now()
);

create table if not exists public.customer_service_conversations (
  phone_normalized text primary key,
  state text not null default 'identifying'
    check (state in ('identifying', 'picking_order', 'collecting', 'human_owned')),
  selected_order_id uuid,
  handoff_at timestamptz,
  updated_at timestamptz not null default now()
);

alter table public.customer_service_controls enable row level security;
alter table public.customer_faqs enable row level security;
alter table public.customer_service_inbound_events enable row level security;
alter table public.customer_service_conversations enable row level security;

revoke all on table public.customer_service_controls from public, anon, authenticated;
revoke all on table public.customer_faqs from public, anon;
revoke all on table public.customer_service_inbound_events from public, anon, authenticated;
revoke all on table public.customer_service_conversations from public, anon, authenticated;

grant select on table public.customer_faqs to authenticated;
grant insert, update on table public.customer_faqs to authenticated;
grant all on table public.customer_service_controls to service_role;
grant all on table public.customer_service_inbound_events to service_role;
grant all on table public.customer_service_conversations to service_role;

drop policy if exists "Customer FAQ readers select" on public.customer_faqs;
create policy "Customer FAQ readers select"
on public.customer_faqs
for select to authenticated
using (private.has_page_access('settings.customer_faq'));

drop policy if exists "Customer FAQ editors insert" on public.customer_faqs;
create policy "Customer FAQ editors insert"
on public.customer_faqs
for insert to authenticated
with check (private.has_page_access('settings.customer_faq.edit'));

drop policy if exists "Customer FAQ editors update" on public.customer_faqs;
create policy "Customer FAQ editors update"
on public.customer_faqs
for update to authenticated
using (private.has_page_access('settings.customer_faq.edit'))
with check (private.has_page_access('settings.customer_faq.edit'));

insert into public.app_pages (
  page_key, display_name, route, sort_order, is_high_risk, parent_page_key, page_kind
)
values
  (
    'settings.customer_faq',
    'WhatsApp 客服 FAQ',
    '/settings/customer-faq',
    127,
    false,
    'settings',
    'subpage'
  ),
  (
    'settings.customer_faq.edit',
    '編輯客服 FAQ',
    '/settings/customer-faq/actions/edit',
    1271,
    true,
    'settings.customer_faq',
    'action'
  )
on conflict (page_key) do update
set
  display_name = excluded.display_name,
  route = excluded.route,
  sort_order = excluded.sort_order,
  is_high_risk = excluded.is_high_risk,
  parent_page_key = excluded.parent_page_key,
  page_kind = excluded.page_kind,
  updated_at = now();

with roles(role) as (
  values
    ('Super Admin'),
    ('Admin'),
    ('Accounting'),
    ('Factory'),
    ('Shop manager'),
    ('Customer_Main'),
    ('Customer_Sub')
)
insert into public.role_page_permissions (role, page_key, can_access, can_manage)
select
  roles.role,
  page.page_key,
  roles.role in ('Super Admin', 'Admin'),
  case
    when page.page_key = 'settings.customer_faq.edit'
      then roles.role in ('Super Admin', 'Admin')
    else roles.role in ('Super Admin', 'Admin')
  end
from roles
cross join (
  values
    ('settings.customer_faq'),
    ('settings.customer_faq.edit')
) as page(page_key)
on conflict (role, page_key) do nothing;

-- A preview environment may already have a newer controls RPC from an earlier
-- partial deploy. PostgreSQL cannot change an OUT-parameter row type with
-- CREATE OR REPLACE, so remove both signatures before recreating this version.
drop function if exists public.customer_service_controls_set(boolean);
drop function if exists public.customer_service_controls_get();

create or replace function public.customer_service_controls_get()
returns table (
  bot_enabled boolean,
  updated_at timestamptz
)
language plpgsql
stable
security definer
set search_path = public, private
as $$
begin
  if not private.has_page_access('settings.customer_faq') then
    raise exception 'page_access_required' using errcode = '42501';
  end if;
  return query
  select controls.bot_enabled, controls.updated_at
  from public.customer_service_controls controls
  where controls.id = 'global';
end;
$$;

create or replace function public.customer_service_controls_set(p_bot_enabled boolean)
returns table (
  bot_enabled boolean,
  updated_at timestamptz
)
language plpgsql
security definer
set search_path = public, private
as $$
begin
  if not private.has_page_access('settings.customer_faq.edit') then
    raise exception 'page_access_required' using errcode = '42501';
  end if;
  update public.customer_service_controls
  set
    bot_enabled = p_bot_enabled,
    updated_at = now(),
    updated_by = auth.uid()
  where id = 'global';
  return query select * from public.customer_service_controls_get();
end;
$$;

create or replace function public.search_published_customer_faqs(
  p_query text,
  p_limit integer default 5
)
returns table (
  id uuid,
  category text,
  question text,
  answer text,
  score numeric
)
language plpgsql
stable
security definer
set search_path = public
as $$
#variable_conflict use_column
declare
  v_query text := btrim(coalesce(p_query, ''));
  v_limit integer := least(greatest(coalesce(p_limit, 5), 1), 20);
begin
  if v_query = '' then
    return;
  end if;

  return query
  select
    faq.id,
    faq.category,
    faq.question,
    faq.answer,
    greatest(
      similarity(faq.question, v_query),
      similarity(faq.keywords, v_query),
      similarity(faq.answer, v_query)
    )::numeric as score
  from public.customer_faqs faq
  where faq.is_published
    and (
      faq.question ilike '%' || v_query || '%'
      or faq.keywords ilike '%' || v_query || '%'
      or faq.answer ilike '%' || v_query || '%'
      or similarity(faq.question, v_query) >= 0.12
      or similarity(faq.keywords, v_query) >= 0.12
    )
  order by
    greatest(
      similarity(faq.question, v_query),
      similarity(faq.keywords, v_query),
      similarity(faq.answer, v_query)
    ) desc,
    faq.sort_order,
    faq.question
  limit v_limit;
end;
$$;

revoke all on function public.customer_service_controls_get() from public, anon;
revoke all on function public.customer_service_controls_set(boolean) from public, anon;
revoke all on function public.search_published_customer_faqs(text, integer) from public, anon;
grant execute on function public.customer_service_controls_get() to authenticated;
grant execute on function public.customer_service_controls_set(boolean) to authenticated;
grant execute on function public.search_published_customer_faqs(text, integer) to authenticated, service_role;

-- published seed (FAQ Logic v1 allowlist; HK Traditional Chinese)
insert into public.customer_faqs (
  category, question, answer, keywords, locale, is_published, sort_order
)
values
  (
    'ordering',
    $faq$點樣喺網站落單？$faq$,
    $faq$你好。請喺我哋網站揀餐單同送貨資料，跟住結帳步驟完成落單。WhatsApp 唔會代你落正式訂單。如果未開過帳戶，可以先登記再落。越早落單越好，因為每日有配額。結帳頁見到積分或優惠碼已扣減，先至付款，否則之後無法退回。$faq$,
    $faq$落單,網站,網上訂,點樣訂,how to order$faq$,
    'zh-HK',
    true,
    10
  ),
  (
    'ordering',
    $faq$Express 即日到會點落單？$faq$,
    $faq$你好。即日到會請用 FC Express 網站落單。Express 只限地面交收，運費同 FCC Catering 主表唔同。如果網站顯示當日已滿，請改第二日，或者留低到會意見，同事會跟進。$faq$,
    $faq$express,即日,即日到會,same day$faq$,
    'zh-HK',
    true,
    20
  ),
  (
    'menu',
    $faq$食物係即食定要加熱？$faq$,
    $faq$你好。大部分到會食物係即煮即送，收貨後可以即食；有部分菜式適合翻熱。盒蓋會有菜名貼紙方便核對。實際加熱方式以盒上或網站說明為準。$faq$,
    $faq$即食,加熱,翻熱,ready to eat,heat$faq$,
    'zh-HK',
    true,
    30
  ),
  (
    'menu',
    $faq$餐具有啲咩？$faq$,
    $faq$你好。一般到會會跟基本餐具同加厚鋁盒。我哋唔提供侍應或者擺盤服務。如果要加購餐具，請喺網站結帳選擇，價錢以結帳頁為準。$faq$,
    $faq$餐具,刀叉,筷子,cutlery,鋁盒$faq$,
    'zh-HK',
    true,
    40
  ),
  (
    'menu',
    $faq$有冇早餐？$faq$,
    $faq$唔好意思，我哋暫時無早餐供應。最早送貨時段大約係 11:00 至 12:00。$faq$,
    $faq$早餐,breakfast,最早,上午$faq$,
    'zh-HK',
    true,
    50
  ),
  (
    'menu',
    $faq$素食或者走蔥蒜得唔得？$faq$,
    $faq$你好。素食同走蔥蒜請喺落單備註註明。我哋有植物肉 OMNI 選擇。如果係特別飲食要求，建議留低到會意見，同事會跟進。$faq$,
    $faq$素食,走蒜,走蔥,vegetarian,omni,植物肉$faq$,
    'zh-HK',
    true,
    60
  ),
  (
    'menu',
    $faq$有冇廚師上門？$faq$,
    $faq$唔好意思，廚師上門而家暫停。食物由自家工場準備，再送到指定地點。$faq$,
    $faq$廚師上門,chef,上門煮$faq$,
    'zh-HK',
    true,
    70
  ),
  (
    'menu',
    $faq$有冇侍應或者擺盤？$faq$,
    $faq$唔好意思，我哋唔提供侍應或者擺盤服務。食物用加厚鋁盒盛載，方便地面交收或者自取。$faq$,
    $faq$侍應,擺盤,waiter,plating$faq$,
    'zh-HK',
    true,
    80
  ),
  (
    'menu',
    $faq$有冇食物相片或者餐牌？$faq$,
    $faq$你好。網站有餐牌同部分食物相片。餐牌大致包括到會套餐、單點同即日 Express。實際供應以網站當日顯示為準。$faq$,
    $faq$相片,餐牌,menu,圖片$faq$,
    'zh-HK',
    true,
    90
  ),
  (
    'delivery',
    $faq$可唔可以荃灣自取？$faq$,
    $faq$你好。可以喺荃灣工場自取。詳細地址同自取時段請睇網站結帳頁，或者留低資料等同事確認。$faq$,
    $faq$荃灣,自取,pickup,工場$faq$,
    'zh-HK',
    true,
    100
  ),
  (
    'delivery',
    $faq$地面交收係咩意思？$faq$,
    $faq$你好。地面交收係指司機喺你地址附近最近可以免費停車嘅位置交收。司機通常會先致電同你夾交收點。$faq$,
    $faq$地面交收,停車,司機,ground collection$faq$,
    'zh-HK',
    true,
    110
  ),
  (
    'delivery',
    $faq$運費幾多？$faq$,
    $faq$你好。運費係按品牌同交收方式計。

FCC Catering／福滿樓／HK Lunch Box／HK Party Food：
地面交收：新界 HK$50、九龍 HK$50、港島 HK$100、偏遠 HK$180、機場 HK$250。
送貨上門：新界 HK$250、九龍 HK$250、港島 HK$350；偏遠同機場唔適用上門。
訂滿 HK$2800，地面交收免費（唔包括偏遠同機場）。

FC Express 即日到會：只限地面交收，新界／九龍／港島一律 HK$200。

地面交收係指司機喺你地址附近最近可以免費停車嘅位置交收。如果未講品牌，我哋會先按 FCC Catering 主表回覆；Express 即日到會收費唔同。同事可以再幫你核對實際地區。$faq$,
    $faq$運費,送貨費,shipping,delivery fee,免運,2800,express 200$faq$,
    'zh-HK',
    true,
    120
  ),
  (
    'delivery',
    $faq$打風落雨會唔會送？$faq$,
    $faq$你好。如果天文台發出 8 號或以上熱帶氣旋警告，或者黑色暴雨警告，我哋可能會暫停送貨。警告除下之後大約兩小時先再安排。已落嘅單可以改期，最多保留 60 日；呢類天氣情況不設取消退款。最終安排以客服同事回覆為準。$faq$,
    $faq$打風,8號,黑雨,天氣,改期,60日,typhoon$faq$,
    'zh-HK',
    true,
    130
  ),
  (
    'payment',
    $faq$接受咩付款方式？$faq$,
    $faq$你好。網站接受信用卡、支付寶、微信支付同轉數快等常見電子付款。訂單要預先支付，唔接受貨到現金。$faq$,
    $faq$付款,信用卡,支付寶,微信支付,轉數快,payment$faq$,
    'zh-HK',
    true,
    140
  ),
  (
    'payment',
    $faq$可唔可以貨到付款？$faq$,
    $faq$唔好意思，所有訂單都要預先支付，唔接受貨到現金。$faq$,
    $faq$貨到付款,現金,cod,先付款$faq$,
    'zh-HK',
    true,
    150
  ),
  (
    'payment',
    $faq$點攞收據或者發票？$faq$,
    $faq$你好。收據同發票請用自助頁 https://www.foodchannels-delivery.com/self_service_search ，輸入落單電話同電郵就可以下載。如果搵唔到，同事可以再指引你。$faq$,
    $faq$收據,發票,invoice,receipt,自助$faq$,
    'zh-HK',
    true,
    160
  ),
  (
    'membership',
    $faq$點樣用購物積分？$faq$,
    $faq$你好。購物積分要喺結帳頁見到已扣減，先至付款。如果未見到扣減就付款，之後無法退回。$faq$,
    $faq$積分,loyalty,優惠碼,points$faq$,
    'zh-HK',
    true,
    170
  ),
  (
    'membership',
    $faq$生日禮遇點用？$faq$,
    $faq$你好。生日禮遇係按你登記嘅生日月份計算，當月首單先適用。詳情以網站會員頁同結帳顯示為準。$faq$,
    $faq$生日,birthday,禮遇$faq$,
    'zh-HK',
    true,
    180
  ),
  (
    'membership',
    $faq$點樣註冊會員？$faq$,
    $faq$你好。請喺網站登記新會員。如果已經有帳戶但忘記密碼，可以用網站重設。改個人資料亦請喺會員頁更新。$faq$,
    $faq$註冊,登記,會員,register,忘記密碼$faq$,
    'zh-HK',
    true,
    190
  )
on conflict (locale, question) do nothing;

-- unpublished blocked seed (playbook prices, tokens, dated codes, refund SOP)
insert into public.customer_faqs (
  category, question, answer, keywords, locale, is_published, sort_order
)
values
  (
    'payment',
    $faq$最低消費係幾多？$faq$,
    $faq$內部備註：最低消費約 HK$800／HK$1500，第一版不自動回答。$faq$,
    $faq$最低消費,800,1500$faq$,
    'zh-HK',
    false,
    900
  ),
  (
    'menu',
    $faq$加熱爐幾錢？$faq$,
    $faq$內部備註：加熱爐加購約 HK$30，第一版不自動報死價。$faq$,
    $faq$加熱爐,30,heater$faq$,
    'zh-HK',
    false,
    910
  ),
  (
    'membership',
    $faq$HSBC2024 優惠碼仲用唔用得？$faq$,
    $faq$內部備註：HSBC2024 等有期限優惠碼不進已發布 FAQ。$faq$,
    $faq$HSBC2024,優惠碼$faq$,
    'zh-HK',
    false,
    920
  ),
  (
    'payment',
    $faq$銀行轉帳戶口係幾號？$faq$,
    $faq$內部備註：戶口 747-221000 同 PayMe／八達通 token 不進 bot。$faq$,
    $faq$銀行,戶口,747-221000,payme$faq$,
    'zh-HK',
    false,
    930
  ),
  (
    'ordering',
    $faq$點樣取消訂單或者退款？$faq$,
    $faq$內部備註：取消／退款步驟轉真人，不自動辦理。$faq$,
    $faq$取消,退款,cancel,refund$faq$,
    'zh-HK',
    false,
    940
  )
on conflict (locale, question) do nothing;
