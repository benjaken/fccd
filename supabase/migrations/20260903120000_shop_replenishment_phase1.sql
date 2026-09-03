-- Phase 1 shop replenishment: catalog, contacts, requests, page permissions.
-- Shop HR is out of scope.

create sequence if not exists public.shop_order_request_no_seq;

create table if not exists public.shop_catalog_items (
  id uuid primary key default gen_random_uuid(),
  sku text,
  name text not null,
  unit text not null,
  supplier_name text not null,
  channel text not null check (channel in ('external', 'fc_internal')),
  warehouse text check (warehouse in ('frozen', 'dry')),
  fcc_supplier_id uuid references public.suppliers (id),
  sort_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists shop_catalog_items_supplier_name_uidx
  on public.shop_catalog_items (supplier_name, name, (coalesce(sku, '')));

create table if not exists public.shop_supplier_contacts (
  id uuid primary key default gen_random_uuid(),
  supplier_id uuid not null references public.suppliers (id),
  name text,
  phone text not null,
  note text,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.shop_order_requests (
  id uuid primary key default gen_random_uuid(),
  request_no text not null unique,
  restaurant_id uuid not null references public.restaurants (id),
  channel text not null check (channel in ('external', 'fc_internal')),
  supplier_id uuid references public.suppliers (id),
  catalog_supplier_name text not null,
  delivery_date date not null,
  status text not null,
  note text,
  contact_id uuid references public.shop_supplier_contacts (id),
  contact_phone text,
  whatsapp_call_status text,
  whatsapp_called_at timestamptz,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.shop_order_lines (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.shop_order_requests (id) on delete cascade,
  catalog_item_id uuid references public.shop_catalog_items (id),
  sku text,
  name text not null,
  unit text not null,
  quantity numeric not null check (quantity > 0),
  note text,
  warehouse text check (warehouse in ('frozen', 'dry')),
  created_at timestamptz not null default now()
);

create table if not exists public.shop_order_events (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.shop_order_requests (id) on delete cascade,
  event_type text not null,
  payload jsonb not null default '{}'::jsonb,
  actor_id uuid,
  created_at timestamptz not null default now()
);

create or replace function public.shop_order_next_request_no()
returns text
language sql
as $$
  select 'SO-' || to_char(timezone('Asia/Hong_Kong', now()), 'YYYYMMDD') || '-' ||
    lpad(nextval('public.shop_order_request_no_seq')::text, 4, '0');
$$;

create or replace function public.shop_order_requests_set_defaults()
returns trigger
language plpgsql
as $$
begin
  if new.request_no is null or new.request_no = '' then
    new.request_no := public.shop_order_next_request_no();
  end if;
  if new.delivery_date < (timezone('Asia/Hong_Kong', now()))::date then
    raise exception 'delivery_date cannot be before today';
  end if;
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists shop_order_requests_set_defaults on public.shop_order_requests;
create trigger shop_order_requests_set_defaults
before insert or update on public.shop_order_requests
for each row execute function public.shop_order_requests_set_defaults();

insert into public.shop_catalog_items (
  sku, name, unit, supplier_name, channel, warehouse, fcc_supplier_id, sort_order
)
select *
from (
  values
  (null, $$有皮22片裝厚方包$$, $$條$$, $$鳳香園麵飽有限公司$$, $$external$$, null, $$56e1237a-b85f-41e7-807c-bc7515269645$$::uuid, 1),
  ($$FCR001$$, $$滷水牛展片 # 每訂6包牛展片要跟1包牛展頭$$, $$2kg / 包$$, $$FC_凍肉$$, $$fc_internal$$, $$frozen$$, $$87bcc50f-5613-4d0c-8bbc-d859459b2842$$::uuid, 2),
  ($$FCR011$$, $$滷水牛展頭$$, $$2kg / 包$$, $$FC_凍肉$$, $$fc_internal$$, $$frozen$$, $$87bcc50f-5613-4d0c-8bbc-d859459b2842$$::uuid, 3),
  ($$FCR003$$, $$滷水牛肚$$, $$2kg / 包$$, $$FC_凍肉$$, $$fc_internal$$, $$frozen$$, $$87bcc50f-5613-4d0c-8bbc-d859459b2842$$::uuid, 4),
  ($$FCR002$$, $$滷水牛腩$$, $$2kg / 包$$, $$FC_凍肉$$, $$fc_internal$$, $$frozen$$, $$87bcc50f-5613-4d0c-8bbc-d859459b2842$$::uuid, 5),
  ($$FCR013$$, $$滷水牛筋$$, $$2kg / 包$$, $$FC_凍肉$$, $$fc_internal$$, $$frozen$$, $$87bcc50f-5613-4d0c-8bbc-d859459b2842$$::uuid, 6),
  ($$FCR004$$, $$燜豬肚$$, $$2kg / 包$$, $$FC_凍肉$$, $$fc_internal$$, $$frozen$$, $$87bcc50f-5613-4d0c-8bbc-d859459b2842$$::uuid, 7),
  ($$FCR021$$, $$香菇滷肉$$, $$2kg / 包$$, $$FC_凍肉$$, $$fc_internal$$, $$frozen$$, $$87bcc50f-5613-4d0c-8bbc-d859459b2842$$::uuid, 8),
  ($$FCR006-B$$, $$醃有骨豬扒$$, $$3kg / 包$$, $$FC_凍肉$$, $$fc_internal$$, $$frozen$$, $$87bcc50f-5613-4d0c-8bbc-d859459b2842$$::uuid, 9),
  ($$FCR007-C$$, $$醃雞扒$$, $$3kg / 包$$, $$FC_凍肉$$, $$fc_internal$$, $$frozen$$, $$87bcc50f-5613-4d0c-8bbc-d859459b2842$$::uuid, 10),
  ($$LKO043$$, $$麻辣醬$$, $$6KG/桶$$, $$FC_凍肉$$, $$fc_internal$$, $$frozen$$, $$87bcc50f-5613-4d0c-8bbc-d859459b2842$$::uuid, 11),
  ($$LKO044$$, $$29號蒜味炸漿粉$$, $$2份/包$$, $$FC_凍肉$$, $$fc_internal$$, $$frozen$$, $$87bcc50f-5613-4d0c-8bbc-d859459b2842$$::uuid, 12),
  ($$FCR022$$, $$扁食肉餡 (500克)$$, $$包$$, $$FC_凍肉$$, $$fc_internal$$, $$frozen$$, $$87bcc50f-5613-4d0c-8bbc-d859459b2842$$::uuid, 13),
  (null, $$綠豆沙$$, $$包$$, $$FC_凍肉$$, $$fc_internal$$, $$frozen$$, $$87bcc50f-5613-4d0c-8bbc-d859459b2842$$::uuid, 14),
  (null, $$甜酸咕嚕汁$$, $$包$$, $$FC_凍肉$$, $$fc_internal$$, $$frozen$$, $$87bcc50f-5613-4d0c-8bbc-d859459b2842$$::uuid, 15),
  ($$LKO028$$, $$牛肉湯粉$$, $$600g/包$$, $$FC_乾貨$$, $$fc_internal$$, $$dry$$, $$87bcc50f-5613-4d0c-8bbc-d859459b2842$$::uuid, 16),
  ($$LKO031$$, $$藥膳包$$, $$460/包$$, $$FC_乾貨$$, $$fc_internal$$, $$dry$$, $$87bcc50f-5613-4d0c-8bbc-d859459b2842$$::uuid, 17),
  ($$LKO024$$, $$21號炸粉$$, $$2kg/包$$, $$FC_乾貨$$, $$fc_internal$$, $$dry$$, $$87bcc50f-5613-4d0c-8bbc-d859459b2842$$::uuid, 18),
  ($$LKJ012-C$$, $$酸菜$$, $$3KG/包$$, $$FC_乾貨$$, $$fc_internal$$, $$dry$$, $$87bcc50f-5613-4d0c-8bbc-d859459b2842$$::uuid, 19),
  ($$LKJ004-B$$, $$蟲草花$$, $$500g/包$$, $$FC_乾貨$$, $$fc_internal$$, $$dry$$, $$87bcc50f-5613-4d0c-8bbc-d859459b2842$$::uuid, 20),
  ($$LKJ005$$, $$雲耳$$, $$500g/包$$, $$FC_乾貨$$, $$fc_internal$$, $$dry$$, $$87bcc50f-5613-4d0c-8bbc-d859459b2842$$::uuid, 21),
  ($$LKJ006$$, $$紅棗片$$, $$500g/包$$, $$FC_乾貨$$, $$fc_internal$$, $$dry$$, $$87bcc50f-5613-4d0c-8bbc-d859459b2842$$::uuid, 22),
  ($$LKJ008$$, $$龍眼乾$$, $$500g/包$$, $$FC_乾貨$$, $$fc_internal$$, $$dry$$, $$87bcc50f-5613-4d0c-8bbc-d859459b2842$$::uuid, 23),
  ($$LKJ007$$, $$杞子$$, $$500g/包$$, $$FC_乾貨$$, $$fc_internal$$, $$dry$$, $$87bcc50f-5613-4d0c-8bbc-d859459b2842$$::uuid, 24),
  ($$LKI041$$, $$芋頭麻糬 (6粒)/包$$, $$包$$, $$FC_乾貨$$, $$fc_internal$$, $$dry$$, $$87bcc50f-5613-4d0c-8bbc-d859459b2842$$::uuid, 25),
  ($$LKA042$$, $$白桃烏龍茶包$$, $$6g x 30個$$, $$FC_乾貨$$, $$fc_internal$$, $$dry$$, $$87bcc50f-5613-4d0c-8bbc-d859459b2842$$::uuid, 26),
  ($$LKA003-D$$, $$天使茉香綠茶$$, $$(500G)$$, $$FC_乾貨$$, $$fc_internal$$, $$dry$$, $$87bcc50f-5613-4d0c-8bbc-d859459b2842$$::uuid, 27),
  ($$LKA004-C$$, $$伯爵紅茶$$, $$30包/箱$$, $$FC_乾貨$$, $$fc_internal$$, $$dry$$, $$87bcc50f-5613-4d0c-8bbc-d859459b2842$$::uuid, 28),
  ($$LKA009-A$$, $$天使蜜香紅茶$$, $$600g X 24包$$, $$FC_乾貨$$, $$fc_internal$$, $$dry$$, $$87bcc50f-5613-4d0c-8bbc-d859459b2842$$::uuid, 29),
  ($$LKA036$$, $$桂花烏龍茶包$$, $$6g x 40個$$, $$FC_乾貨$$, $$fc_internal$$, $$dry$$, $$87bcc50f-5613-4d0c-8bbc-d859459b2842$$::uuid, 30),
  ($$LKA046$$, $$山茶花烏龍茶$$, $$500g*30包$$, $$FC_乾貨$$, $$fc_internal$$, $$dry$$, $$87bcc50f-5613-4d0c-8bbc-d859459b2842$$::uuid, 31),
  (null, $$雀巢咖啡粉$$, $$500g/罐$$, $$FC_乾貨$$, $$fc_internal$$, $$dry$$, $$87bcc50f-5613-4d0c-8bbc-d859459b2842$$::uuid, 32),
  ($$LKA041-B$$, $$麥茶$$, $$(6g x 30個)$$, $$FC_乾貨$$, $$fc_internal$$, $$dry$$, $$87bcc50f-5613-4d0c-8bbc-d859459b2842$$::uuid, 33),
  ($$LKJ011$$, $$胎菊$$, $$500克/包$$, $$FC_乾貨$$, $$fc_internal$$, $$dry$$, $$87bcc50f-5613-4d0c-8bbc-d859459b2842$$::uuid, 34),
  ($$LKB028$$, $$蜜桃濃縮汁$$, $$2.5kg x 6瓶/箱$$, $$FC_乾貨$$, $$fc_internal$$, $$dry$$, $$87bcc50f-5613-4d0c-8bbc-d859459b2842$$::uuid, 35),
  ($$LKB001$$, $$芒果濃縮汁$$, $$2.5kg x 6瓶/箱$$, $$FC_乾貨$$, $$fc_internal$$, $$dry$$, $$87bcc50f-5613-4d0c-8bbc-d859459b2842$$::uuid, 36),
  ($$LKB002$$, $$百香果濃縮汁$$, $$2.5kg x 6瓶/箱$$, $$FC_乾貨$$, $$fc_internal$$, $$dry$$, $$87bcc50f-5613-4d0c-8bbc-d859459b2842$$::uuid, 37),
  ($$LKB004$$, $$荔枝濃縮汁$$, $$2.4kg x 6瓶/箱$$, $$FC_乾貨$$, $$fc_internal$$, $$dry$$, $$87bcc50f-5613-4d0c-8bbc-d859459b2842$$::uuid, 38),
  ($$LKB0$$, $$檸檬原汁$$, $$950ml x 12瓶/箱$$, $$FC_乾貨$$, $$fc_internal$$, $$dry$$, $$87bcc50f-5613-4d0c-8bbc-d859459b2842$$::uuid, 39),
  ($$LKB012$$, $$芋香粉$$, $$6瓶/箱$$, $$FC_乾貨$$, $$fc_internal$$, $$dry$$, $$87bcc50f-5613-4d0c-8bbc-d859459b2842$$::uuid, 40),
  ($$LKI010$$, $$果糖$$, $$6kg x 3包/箱$$, $$FC_乾貨$$, $$fc_internal$$, $$dry$$, $$87bcc50f-5613-4d0c-8bbc-d859459b2842$$::uuid, 41),
  ($$LKF036$$, $$原蔗糖漿$$, $$6kg x 4包/箱 [原箱訂]$$, $$FC_乾貨$$, $$fc_internal$$, $$dry$$, $$87bcc50f-5613-4d0c-8bbc-d859459b2842$$::uuid, 42),
  ($$LKB031$$, $$黑糖漿$$, $$2.5kg x 6瓶/箱$$, $$FC_乾貨$$, $$fc_internal$$, $$dry$$, $$87bcc50f-5613-4d0c-8bbc-d859459b2842$$::uuid, 43),
  ($$LKB023$$, $$冬瓜糖露(2.5KG)$$, $$2.5kg$$, $$FC_乾貨$$, $$fc_internal$$, $$dry$$, $$87bcc50f-5613-4d0c-8bbc-d859459b2842$$::uuid, 44),
  ($$LKB032-B$$, $$韓國生薑茶$$, $$樽$$, $$FC_乾貨$$, $$fc_internal$$, $$dry$$, $$87bcc50f-5613-4d0c-8bbc-d859459b2842$$::uuid, 45),
  ($$LKD002$$, $$黃金可可粉$$, $$1kg x 20包/箱$$, $$FC_乾貨$$, $$fc_internal$$, $$dry$$, $$87bcc50f-5613-4d0c-8bbc-d859459b2842$$::uuid, 46),
  ($$LKD011-D$$, $$60N奶精粉 (1kg/包)$$, $$1kg x 20包/箱$$, $$FC_乾貨$$, $$fc_internal$$, $$dry$$, $$87bcc50f-5613-4d0c-8bbc-d859459b2842$$::uuid, 47),
  ($$LKD013-B$$, $$純雪-生乳起司奶蓋粉$$, $$1kg$$, $$FC_乾貨$$, $$fc_internal$$, $$dry$$, $$87bcc50f-5613-4d0c-8bbc-d859459b2842$$::uuid, 48),
  ($$LKI029$$, $$牛奶 (12包/箱)$$, $$1L x 12包/箱 [原箱訂]$$, $$FC_乾貨$$, $$fc_internal$$, $$dry$$, $$87bcc50f-5613-4d0c-8bbc-d859459b2842$$::uuid, 49),
  (null, $$愛護牌啡奶$$, $$包$$, $$FC_乾貨$$, $$fc_internal$$, $$dry$$, $$87bcc50f-5613-4d0c-8bbc-d859459b2842$$::uuid, 50),
  ($$LKB016-B$$, $$調和蜂蜜糖漿$$, $$罐$$, $$FC_乾貨$$, $$fc_internal$$, $$dry$$, $$87bcc50f-5613-4d0c-8bbc-d859459b2842$$::uuid, 51),
  ($$LKE004$$, $$荔枝椰果$$, $$3.3kg x 6罐/箱$$, $$FC_乾貨$$, $$fc_internal$$, $$dry$$, $$87bcc50f-5613-4d0c-8bbc-d859459b2842$$::uuid, 52),
  ($$LKE008-C$$, $$蜂蜜蘆薈$$, $$4kg x 4瓶/箱$$, $$FC_乾貨$$, $$fc_internal$$, $$dry$$, $$87bcc50f-5613-4d0c-8bbc-d859459b2842$$::uuid, 53),
  ($$LKE011$$, $$巧克力碎片$$, $$3.1kg x 6罐/箱$$, $$FC_乾貨$$, $$fc_internal$$, $$dry$$, $$87bcc50f-5613-4d0c-8bbc-d859459b2842$$::uuid, 54),
  ($$LKE001-B$$, $$珍珠$$, $$454g x 12包/箱$$, $$FC_乾貨$$, $$fc_internal$$, $$dry$$, $$87bcc50f-5613-4d0c-8bbc-d859459b2842$$::uuid, 55),
  ($$LKE010-C$$, $$仙草凍$$, $$3kg x 6包/箱$$, $$FC_乾貨$$, $$fc_internal$$, $$dry$$, $$87bcc50f-5613-4d0c-8bbc-d859459b2842$$::uuid, 56),
  ($$LKE007$$, $$寒天晶球$$, $$6罐/箱$$, $$FC_乾貨$$, $$fc_internal$$, $$dry$$, $$87bcc50f-5613-4d0c-8bbc-d859459b2842$$::uuid, 57),
  ($$LKJ008$$, $$龍眼乾$$, $$30包/箱$$, $$FC_乾貨$$, $$fc_internal$$, $$dry$$, $$87bcc50f-5613-4d0c-8bbc-d859459b2842$$::uuid, 58),
  ($$LKJ007$$, $$杞子$$, $$500g/包$$, $$FC_乾貨$$, $$fc_internal$$, $$dry$$, $$87bcc50f-5613-4d0c-8bbc-d859459b2842$$::uuid, 59),
  ($$LKJ006$$, $$紅棗$$, $$500g/包$$, $$FC_乾貨$$, $$fc_internal$$, $$dry$$, $$87bcc50f-5613-4d0c-8bbc-d859459b2842$$::uuid, 60),
  ($$LKD014$$, $$麻糬粉$$, $$500克$$, $$FC_乾貨$$, $$fc_internal$$, $$dry$$, $$87bcc50f-5613-4d0c-8bbc-d859459b2842$$::uuid, 61),
  (null, $$堅果碎$$, $$包$$, $$FC_乾貨$$, $$fc_internal$$, $$dry$$, $$87bcc50f-5613-4d0c-8bbc-d859459b2842$$::uuid, 62),
  (null, $$CROP'S急凍芒果$$, $$包$$, $$FC_乾貨$$, $$fc_internal$$, $$dry$$, $$87bcc50f-5613-4d0c-8bbc-d859459b2842$$::uuid, 63),
  (null, $$急凍火龍果粒$$, $$包$$, $$FC_乾貨$$, $$fc_internal$$, $$dry$$, $$87bcc50f-5613-4d0c-8bbc-d859459b2842$$::uuid, 64),
  ($$LKF037$$, $$M.桂花糖漿$$, $$樽$$, $$FC_乾貨$$, $$fc_internal$$, $$dry$$, $$87bcc50f-5613-4d0c-8bbc-d859459b2842$$::uuid, 65),
  (null, $$紙杯套(空白)$$, $$條$$, $$FC_乾貨$$, $$fc_internal$$, $$dry$$, $$87bcc50f-5613-4d0c-8bbc-d859459b2842$$::uuid, 66),
  (null, $$(c*) 幸福茶研社 16oz PP杯$$, $$條$$, $$FC_乾貨$$, $$fc_internal$$, $$dry$$, $$87bcc50f-5613-4d0c-8bbc-d859459b2842$$::uuid, 67),
  ($$LKG105$$, $$100% Fresh 12oz PP杯子 (25pcs*20pack) (幸福茶研社)$$, $$條$$, $$FC_乾貨$$, $$fc_internal$$, $$dry$$, $$87bcc50f-5613-4d0c-8bbc-d859459b2842$$::uuid, 68),
  ($$LKG080$$, $$90mm PP 蓋$$, $$6瓶/箱$$, $$FC_乾貨$$, $$fc_internal$$, $$dry$$, $$87bcc50f-5613-4d0c-8bbc-d859459b2842$$::uuid, 69),
  ($$CMK018$$, $$16oz 熱杯 (幸福良晨 )$$, $$條$$, $$FC_乾貨$$, $$fc_internal$$, $$dry$$, $$87bcc50f-5613-4d0c-8bbc-d859459b2842$$::uuid, 70),
  ($$LKG016$$, $$熱杯蓋$$, $$條$$, $$FC_乾貨$$, $$fc_internal$$, $$dry$$, $$87bcc50f-5613-4d0c-8bbc-d859459b2842$$::uuid, 71),
  ($$CMK016$$, $$18oz 外賣紙碗 (幸福良晨 )$$, $$(25隻*20條/箱)$$, $$FC_乾貨$$, $$fc_internal$$, $$dry$$, $$87bcc50f-5613-4d0c-8bbc-d859459b2842$$::uuid, 72),
  ($$BBC016$$, $$18oz 外賣膠碗蓋$$, $$25個 x 20條/箱$$, $$FC_乾貨$$, $$fc_internal$$, $$dry$$, $$87bcc50f-5613-4d0c-8bbc-d859459b2842$$::uuid, 73),
  ($$BBC016-B$$, $$18oz 外賣紙碗蓋$$, $$50隻/條$$, $$FC_乾貨$$, $$fc_internal$$, $$dry$$, $$87bcc50f-5613-4d0c-8bbc-d859459b2842$$::uuid, 74),
  ($$CMK017$$, $$28oz 外賣紙碗 (幸福良晨 )$$, $$50個 x 20條/箱$$, $$FC_乾貨$$, $$fc_internal$$, $$dry$$, $$87bcc50f-5613-4d0c-8bbc-d859459b2842$$::uuid, 75),
  ($$BBC018$$, $$28oz 外賣膠碗蓋$$, $$20條/箱$$, $$FC_乾貨$$, $$fc_internal$$, $$dry$$, $$87bcc50f-5613-4d0c-8bbc-d859459b2842$$::uuid, 76),
  ($$BBC018-B$$, $$28oz 外賣紙碗蓋$$, $$50個 x 20條/箱$$, $$FC_乾貨$$, $$fc_internal$$, $$dry$$, $$87bcc50f-5613-4d0c-8bbc-d859459b2842$$::uuid, 77),
  ($$BBC012-B$$, $$幸福良晨 膠袋 - 小$$, $$50個 x 20條/箱$$, $$FC_乾貨$$, $$fc_internal$$, $$dry$$, $$87bcc50f-5613-4d0c-8bbc-d859459b2842$$::uuid, 78),
  ($$BBC013-B$$, $$幸福良晨 膠袋 - 中$$, $$50個 x 20條/箱$$, $$FC_乾貨$$, $$fc_internal$$, $$dry$$, $$87bcc50f-5613-4d0c-8bbc-d859459b2842$$::uuid, 79),
  ($$BBC014-B$$, $$幸福良晨 膠袋 - 大$$, $$50個 x 10條/箱$$, $$FC_乾貨$$, $$fc_internal$$, $$dry$$, $$87bcc50f-5613-4d0c-8bbc-d859459b2842$$::uuid, 80),
  ($$BBC025$$, $$幸福良晨 膠袋 - 特大$$, $$50個 x 20條/箱$$, $$FC_乾貨$$, $$fc_internal$$, $$dry$$, $$87bcc50f-5613-4d0c-8bbc-d859459b2842$$::uuid, 81),
  ($$BBC031$$, $$9oz 杯$$, $$50個 x 20條/箱$$, $$FC_乾貨$$, $$fc_internal$$, $$dry$$, $$87bcc50f-5613-4d0c-8bbc-d859459b2842$$::uuid, 82),
  (null, $$五格便當盒 (50個/條)$$, null, $$FC_乾貨$$, $$fc_internal$$, $$dry$$, $$87bcc50f-5613-4d0c-8bbc-d859459b2842$$::uuid, 83),
  ($$LKI011$$, $$M. 糖漿泵 (細唧嘴)$$, $$100個/扎$$, $$FC_乾貨$$, $$fc_internal$$, $$dry$$, $$87bcc50f-5613-4d0c-8bbc-d859459b2842$$::uuid, 84),
  ($$LKI012$$, $$M. 糖漿泵 (大唧嘴)$$, $$100個/扎$$, $$FC_乾貨$$, $$fc_internal$$, $$dry$$, $$87bcc50f-5613-4d0c-8bbc-d859459b2842$$::uuid, 85),
  (null, $$普通白色濾芯$$, $$50個 x 20條/箱$$, $$FC_乾貨$$, $$fc_internal$$, $$dry$$, $$87bcc50f-5613-4d0c-8bbc-d859459b2842$$::uuid, 86),
  ($$LKI005$$, $$前置白色濾芯(普通濾芯)$$, $$50個x6條/箱$$, $$FC_乾貨$$, $$fc_internal$$, $$dry$$, $$87bcc50f-5613-4d0c-8bbc-d859459b2842$$::uuid, 87),
  ($$LKR011$$, $$MH 濾芯(咖啡機,煮茶機用)$$, $$個$$, $$FC_乾貨$$, $$fc_internal$$, $$dry$$, $$87bcc50f-5613-4d0c-8bbc-d859459b2842$$::uuid, 88),
  ($$LKR012$$, $$MC 濾芯 (制冰機用)$$, $$個$$, $$FC_乾貨$$, $$fc_internal$$, $$dry$$, $$87bcc50f-5613-4d0c-8bbc-d859459b2842$$::uuid, 89),
  ($$LKQ122$$, $$10oz 馬克杯 (多色)$$, $$個$$, $$FC_乾貨$$, $$fc_internal$$, $$dry$$, $$87bcc50f-5613-4d0c-8bbc-d859459b2842$$::uuid, 90),
  ($$LKQ123$$, $$12oz 有耳透明亞克力膠杯$$, $$1000g$$, $$FC_乾貨$$, $$fc_internal$$, $$dry$$, $$87bcc50f-5613-4d0c-8bbc-d859459b2842$$::uuid, 91),
  ($$LKQ124$$, $$16oz 透明亞克力膠杯$$, $$個$$, $$FC_乾貨$$, $$fc_internal$$, $$dry$$, $$87bcc50f-5613-4d0c-8bbc-d859459b2842$$::uuid, 92),
  ($$CMK008$$, $$水果茶長匙 (cafe mikoo)$$, $$50條=箱$$, $$FC_乾貨$$, $$fc_internal$$, $$dry$$, $$87bcc50f-5613-4d0c-8bbc-d859459b2842$$::uuid, 93),
  (null, $$員工杯$$, $$條$$, $$FC_乾貨$$, $$fc_internal$$, $$dry$$, $$87bcc50f-5613-4d0c-8bbc-d859459b2842$$::uuid, 94),
  (null, $$酒精膏 (8包/箱)$$, $$箱$$, $$FC_乾貨$$, $$fc_internal$$, $$dry$$, $$87bcc50f-5613-4d0c-8bbc-d859459b2842$$::uuid, 95),
  ($$LKO047$$, $$肉粽甜辣醬$$, $$個$$, $$FC_乾貨$$, $$fc_internal$$, $$dry$$, $$87bcc50f-5613-4d0c-8bbc-d859459b2842$$::uuid, 96),
  ($$LKI009$$, $$POS感熱紙$$, $$50卷/箱$$, $$FC_乾貨$$, $$fc_internal$$, $$dry$$, $$87bcc50f-5613-4d0c-8bbc-d859459b2842$$::uuid, 97),
  ($$LKI035$$, $$57x40mm熱感紙$$, $$個$$, $$FC_乾貨$$, $$fc_internal$$, $$dry$$, $$87bcc50f-5613-4d0c-8bbc-d859459b2842$$::uuid, 98),
  ($$CMK019$$, $$牙簽筒$$, $$個$$, $$FC_乾貨$$, $$fc_internal$$, $$dry$$, $$87bcc50f-5613-4d0c-8bbc-d859459b2842$$::uuid, 99),
  (null, $$立得抹手紙$$, $$20包/箱$$, $$FC_乾貨$$, $$fc_internal$$, $$dry$$, $$87bcc50f-5613-4d0c-8bbc-d859459b2842$$::uuid, 100),
  (null, $$三格膠碟$$, $$個$$, $$FC_乾貨$$, $$fc_internal$$, $$dry$$, $$87bcc50f-5613-4d0c-8bbc-d859459b2842$$::uuid, 101),
  ($$LKQ125$$, $$3.8吋藍邊膠汁碟$$, $$1箱=12包$$, $$FC_乾貨$$, $$fc_internal$$, $$dry$$, $$87bcc50f-5613-4d0c-8bbc-d859459b2842$$::uuid, 102),
  ($$LKQ126$$, $$4.5吋藍邊膠碗$$, $$個$$, $$FC_乾貨$$, $$fc_internal$$, $$dry$$, $$87bcc50f-5613-4d0c-8bbc-d859459b2842$$::uuid, 103),
  ($$LKQ130$$, $$5吋藍邊膠碟$$, $$1箱=50卷$$, $$FC_乾貨$$, $$fc_internal$$, $$dry$$, $$87bcc50f-5613-4d0c-8bbc-d859459b2842$$::uuid, 104),
  ($$LKQ106$$, $$5 3/4" 藍色條紋碗$$, $$個$$, $$FC_乾貨$$, $$fc_internal$$, $$dry$$, $$87bcc50f-5613-4d0c-8bbc-d859459b2842$$::uuid, 105),
  ($$LKQ118$$, $$7吋藍紋碟$$, $$個$$, $$FC_乾貨$$, $$fc_internal$$, $$dry$$, $$87bcc50f-5613-4d0c-8bbc-d859459b2842$$::uuid, 106),
  ($$LKQ115$$, $$8吋藍紋麵碗$$, $$個$$, $$FC_乾貨$$, $$fc_internal$$, $$dry$$, $$87bcc50f-5613-4d0c-8bbc-d859459b2842$$::uuid, 107),
  ($$LKQ117$$, $$10吋藍紋麵碗$$, $$個$$, $$FC_乾貨$$, $$fc_internal$$, $$dry$$, $$87bcc50f-5613-4d0c-8bbc-d859459b2842$$::uuid, 108),
  ($$LKQ128$$, $$193x55 圓形黑色鋁鍋 連蓋$$, $$個$$, $$FC_乾貨$$, $$fc_internal$$, $$dry$$, $$87bcc50f-5613-4d0c-8bbc-d859459b2842$$::uuid, 109),
  ($$LKQ133$$, $$172x45 圓形黑色鋁鍋 連蓋$$, $$個$$, $$FC_乾貨$$, $$fc_internal$$, $$dry$$, $$87bcc50f-5613-4d0c-8bbc-d859459b2842$$::uuid, 110),
  ($$LKQ127$$, $$400ml 黑色炖盅$$, $$個$$, $$FC_乾貨$$, $$fc_internal$$, $$dry$$, $$87bcc50f-5613-4d0c-8bbc-d859459b2842$$::uuid, 111),
  ($$LKR018$$, $$黑柄麵喱(蘺)$$, $$個$$, $$FC_乾貨$$, $$fc_internal$$, $$dry$$, $$87bcc50f-5613-4d0c-8bbc-d859459b2842$$::uuid, 112),
  ($$LKG109$$, $$一次性頭套 (200個)$$, $$個$$, $$FC_乾貨$$, $$fc_internal$$, $$dry$$, $$87bcc50f-5613-4d0c-8bbc-d859459b2842$$::uuid, 113),
  ($$CMK010$$, $$幸福良晨 T-shirt XXXL$$, $$個$$, $$FC_乾貨$$, $$fc_internal$$, $$dry$$, $$87bcc50f-5613-4d0c-8bbc-d859459b2842$$::uuid, 114),
  ($$CMK011$$, $$幸福良晨 T-shirt XXL$$, $$個$$, $$FC_乾貨$$, $$fc_internal$$, $$dry$$, $$87bcc50f-5613-4d0c-8bbc-d859459b2842$$::uuid, 115),
  ($$CMK012$$, $$幸福良晨 T-shirt XL$$, $$個$$, $$FC_乾貨$$, $$fc_internal$$, $$dry$$, $$87bcc50f-5613-4d0c-8bbc-d859459b2842$$::uuid, 116),
  ($$CMK013$$, $$幸福良晨 T-shirt L$$, $$個$$, $$FC_乾貨$$, $$fc_internal$$, $$dry$$, $$87bcc50f-5613-4d0c-8bbc-d859459b2842$$::uuid, 117),
  ($$CMK014$$, $$幸福良晨 T-shirt M$$, $$個$$, $$FC_乾貨$$, $$fc_internal$$, $$dry$$, $$87bcc50f-5613-4d0c-8bbc-d859459b2842$$::uuid, 118),
  ($$CMK015$$, $$幸福良晨 T-shirt S$$, $$個$$, $$FC_乾貨$$, $$fc_internal$$, $$dry$$, $$87bcc50f-5613-4d0c-8bbc-d859459b2842$$::uuid, 119),
  ($$CMK023$$, $$幸福良晨 外套 - 3XL$$, $$包$$, $$FC_乾貨$$, $$fc_internal$$, $$dry$$, $$87bcc50f-5613-4d0c-8bbc-d859459b2842$$::uuid, 120),
  ($$CMK024$$, $$幸福良晨 外套 - 2XL$$, null, $$FC_乾貨$$, $$fc_internal$$, $$dry$$, $$87bcc50f-5613-4d0c-8bbc-d859459b2842$$::uuid, 121),
  ($$CMK022$$, $$幸福良晨 外套 - XL$$, null, $$FC_乾貨$$, $$fc_internal$$, $$dry$$, $$87bcc50f-5613-4d0c-8bbc-d859459b2842$$::uuid, 122),
  ($$CMK021$$, $$幸福良晨 外套 - L$$, null, $$FC_乾貨$$, $$fc_internal$$, $$dry$$, $$87bcc50f-5613-4d0c-8bbc-d859459b2842$$::uuid, 123),
  ($$CMK020$$, $$幸福良晨 外套 - M$$, null, $$FC_乾貨$$, $$fc_internal$$, $$dry$$, $$87bcc50f-5613-4d0c-8bbc-d859459b2842$$::uuid, 124),
  ($$LKH049$$, $$黑色全身雙吊帶圍裙$$, null, $$FC_乾貨$$, $$fc_internal$$, $$dry$$, $$87bcc50f-5613-4d0c-8bbc-d859459b2842$$::uuid, 125),
  (null, $$半身圍裙$$, null, $$FC_乾貨$$, $$fc_internal$$, $$dry$$, $$87bcc50f-5613-4d0c-8bbc-d859459b2842$$::uuid, 126),
  ($$LKQ133$$, $$172x45 圓形黑色鋁鍋 連蓋$$, null, $$FC_乾貨$$, $$fc_internal$$, $$dry$$, $$87bcc50f-5613-4d0c-8bbc-d859459b2842$$::uuid, 127),
  ($$LKQ128$$, $$193x55 圓形黑色鋁鍋 連蓋$$, null, $$FC_乾貨$$, $$fc_internal$$, $$dry$$, $$87bcc50f-5613-4d0c-8bbc-d859459b2842$$::uuid, 128),
  ($$LKQ127$$, $$400ml 黑色炖盅$$, null, $$FC_乾貨$$, $$fc_internal$$, $$dry$$, $$87bcc50f-5613-4d0c-8bbc-d859459b2842$$::uuid, 129),
  (null, $$筷子 (對)$$, null, $$FC_乾貨$$, $$fc_internal$$, $$dry$$, $$87bcc50f-5613-4d0c-8bbc-d859459b2842$$::uuid, 130),
  (null, $$銀色餐刀$$, null, $$FC_乾貨$$, $$fc_internal$$, $$dry$$, $$87bcc50f-5613-4d0c-8bbc-d859459b2842$$::uuid, 131),
  (null, $$14" 木托盤$$, null, $$FC_乾貨$$, $$fc_internal$$, $$dry$$, $$87bcc50f-5613-4d0c-8bbc-d859459b2842$$::uuid, 132),
  (null, $$飯桶$$, null, $$FC_乾貨$$, $$fc_internal$$, $$dry$$, $$87bcc50f-5613-4d0c-8bbc-d859459b2842$$::uuid, 133),
  (null, $$食鉗彈簧$$, null, $$FC_乾貨$$, $$fc_internal$$, $$dry$$, $$87bcc50f-5613-4d0c-8bbc-d859459b2842$$::uuid, 134),
  (null, $$手動打蛋器$$, null, $$FC_乾貨$$, $$fc_internal$$, $$dry$$, $$87bcc50f-5613-4d0c-8bbc-d859459b2842$$::uuid, 135),
  (null, $$500ml 甜品杯$$, null, $$FC_乾貨$$, $$fc_internal$$, $$dry$$, $$87bcc50f-5613-4d0c-8bbc-d859459b2842$$::uuid, 136),
  (null, $$18cm 銀湯匙$$, null, $$FC_乾貨$$, $$fc_internal$$, $$dry$$, $$87bcc50f-5613-4d0c-8bbc-d859459b2842$$::uuid, 137),
  (null, $$8" 黑色長柄湯匙$$, null, $$FC_乾貨$$, $$fc_internal$$, $$dry$$, $$87bcc50f-5613-4d0c-8bbc-d859459b2842$$::uuid, 138),
  (null, $$食鉗彈簧$$, null, $$FC_乾貨$$, $$fc_internal$$, $$dry$$, $$87bcc50f-5613-4d0c-8bbc-d859459b2842$$::uuid, 139),
  (null, $$手動打蛋器$$, null, $$FC_乾貨$$, $$fc_internal$$, $$dry$$, $$87bcc50f-5613-4d0c-8bbc-d859459b2842$$::uuid, 140),
  (null, $$500ml 甜品杯$$, null, $$FC_乾貨$$, $$fc_internal$$, $$dry$$, $$87bcc50f-5613-4d0c-8bbc-d859459b2842$$::uuid, 141),
  (null, $$18cm 銀湯匙$$, null, $$FC_乾貨$$, $$fc_internal$$, $$dry$$, $$87bcc50f-5613-4d0c-8bbc-d859459b2842$$::uuid, 142),
  (null, $$8" 黑色長柄湯匙$$, null, $$FC_乾貨$$, $$fc_internal$$, $$dry$$, $$87bcc50f-5613-4d0c-8bbc-d859459b2842$$::uuid, 143),
  (null, $$8" 黑色長柄湯匙$$, null, $$FC_乾貨$$, $$fc_internal$$, $$dry$$, $$87bcc50f-5613-4d0c-8bbc-d859459b2842$$::uuid, 144),
  (null, $$火鍋爐$$, null, $$FC_乾貨$$, $$fc_internal$$, $$dry$$, $$87bcc50f-5613-4d0c-8bbc-d859459b2842$$::uuid, 145),
  (null, $$POS感熱紙$$, $$箱$$, $$FC_乾貨$$, $$fc_internal$$, $$dry$$, $$87bcc50f-5613-4d0c-8bbc-d859459b2842$$::uuid, 146),
  (null, $$台灣幼麵$$, $$斤$$, $$三潤麵皇食品有限公司$$, $$external$$, null, $$68b2af9b-0496-45da-9929-c207bc3ab034$$::uuid, 147),
  (null, $$鮮過橋米線$$, $$斤$$, $$三潤麵皇食品有限公司$$, $$external$$, null, $$68b2af9b-0496-45da-9929-c207bc3ab034$$::uuid, 148),
  (null, $$白方皮 (3吋x3吋)$$, $$斤$$, $$三潤麵皇食品有限公司$$, $$external$$, null, $$68b2af9b-0496-45da-9929-c207bc3ab034$$::uuid, 149),
  (null, $$唐生菜$$, $$KG$$, $$日鮮食品有限公司$$, $$external$$, null, $$4628dbc3-d8f4-4c6f-9bf9-fac499342394$$::uuid, 150),
  (null, $$娃娃菜$$, $$包$$, $$日鮮食品有限公司$$, $$external$$, null, $$4628dbc3-d8f4-4c6f-9bf9-fac499342394$$::uuid, 151),
  (null, $$番茄$$, $$KG$$, $$日鮮食品有限公司$$, $$external$$, null, $$4628dbc3-d8f4-4c6f-9bf9-fac499342394$$::uuid, 152),
  (null, $$BB 菜心$$, $$KG$$, $$日鮮食品有限公司$$, $$external$$, null, $$4628dbc3-d8f4-4c6f-9bf9-fac499342394$$::uuid, 153),
  (null, $$椰菜$$, $$KG$$, $$日鮮食品有限公司$$, $$external$$, null, $$4628dbc3-d8f4-4c6f-9bf9-fac499342394$$::uuid, 154),
  (null, $$北京椰菜$$, $$KG$$, $$日鮮食品有限公司$$, $$external$$, null, $$4628dbc3-d8f4-4c6f-9bf9-fac499342394$$::uuid, 155),
  (null, $$合掌瓜$$, $$KG$$, $$日鮮食品有限公司$$, $$external$$, null, $$4628dbc3-d8f4-4c6f-9bf9-fac499342394$$::uuid, 156),
  (null, $$栗子肉(淨肉)$$, $$KG$$, $$日鮮食品有限公司$$, $$external$$, null, $$4628dbc3-d8f4-4c6f-9bf9-fac499342394$$::uuid, 157),
  (null, $$紅尖椒$$, $$KG$$, $$日鮮食品有限公司$$, $$external$$, null, $$4628dbc3-d8f4-4c6f-9bf9-fac499342394$$::uuid, 158),
  (null, $$青瓜$$, $$KG$$, $$日鮮食品有限公司$$, $$external$$, null, $$4628dbc3-d8f4-4c6f-9bf9-fac499342394$$::uuid, 159),
  (null, $$茄瓜/茄子$$, $$KG$$, $$日鮮食品有限公司$$, $$external$$, null, $$4628dbc3-d8f4-4c6f-9bf9-fac499342394$$::uuid, 160),
  (null, $$苦瓜$$, $$KG$$, $$日鮮食品有限公司$$, $$external$$, null, $$4628dbc3-d8f4-4c6f-9bf9-fac499342394$$::uuid, 161),
  (null, $$冬瓜$$, $$KG$$, $$日鮮食品有限公司$$, $$external$$, null, $$4628dbc3-d8f4-4c6f-9bf9-fac499342394$$::uuid, 162),
  (null, $$老黃瓜$$, $$KG$$, $$日鮮食品有限公司$$, $$external$$, null, $$4628dbc3-d8f4-4c6f-9bf9-fac499342394$$::uuid, 163),
  (null, $$指天椒$$, $$KG$$, $$日鮮食品有限公司$$, $$external$$, null, $$4628dbc3-d8f4-4c6f-9bf9-fac499342394$$::uuid, 164),
  (null, $$螺絲椒$$, $$KG$$, $$日鮮食品有限公司$$, $$external$$, null, $$4628dbc3-d8f4-4c6f-9bf9-fac499342394$$::uuid, 165),
  (null, $$青木瓜$$, $$KG$$, $$日鮮食品有限公司$$, $$external$$, null, $$4628dbc3-d8f4-4c6f-9bf9-fac499342394$$::uuid, 166),
  (null, $$青木瓜肉$$, $$KG$$, $$日鮮食品有限公司$$, $$external$$, null, $$4628dbc3-d8f4-4c6f-9bf9-fac499342394$$::uuid, 167),
  (null, $$粟米$$, $$條$$, $$日鮮食品有限公司$$, $$external$$, null, $$4628dbc3-d8f4-4c6f-9bf9-fac499342394$$::uuid, 168),
  (null, $$粟米肉$$, $$條$$, $$日鮮食品有限公司$$, $$external$$, null, $$4628dbc3-d8f4-4c6f-9bf9-fac499342394$$::uuid, 169),
  (null, $$白果肉(包裝)$$, $$包$$, $$日鮮食品有限公司$$, $$external$$, null, $$4628dbc3-d8f4-4c6f-9bf9-fac499342394$$::uuid, 170),
  (null, $$有剌青瓜$$, $$KG$$, $$日鮮食品有限公司$$, $$external$$, null, $$4628dbc3-d8f4-4c6f-9bf9-fac499342394$$::uuid, 171),
  (null, $$淮山$$, $$KG$$, $$日鮮食品有限公司$$, $$external$$, null, $$4628dbc3-d8f4-4c6f-9bf9-fac499342394$$::uuid, 172),
  (null, $$淮山肉$$, $$KG$$, $$日鮮食品有限公司$$, $$external$$, null, $$4628dbc3-d8f4-4c6f-9bf9-fac499342394$$::uuid, 173),
  (null, $$甘筍肉$$, $$KG$$, $$日鮮食品有限公司$$, $$external$$, null, $$4628dbc3-d8f4-4c6f-9bf9-fac499342394$$::uuid, 174),
  (null, $$甘筍肉切(骨牌)$$, $$KG$$, $$日鮮食品有限公司$$, $$external$$, null, $$4628dbc3-d8f4-4c6f-9bf9-fac499342394$$::uuid, 175),
  (null, $$白蘿蔔肉切(骨牌)$$, $$KG$$, $$日鮮食品有限公司$$, $$external$$, null, $$4628dbc3-d8f4-4c6f-9bf9-fac499342394$$::uuid, 176),
  (null, $$唐芹/中芹$$, $$KG$$, $$日鮮食品有限公司$$, $$external$$, null, $$4628dbc3-d8f4-4c6f-9bf9-fac499342394$$::uuid, 177),
  (null, $$西芹$$, $$KG$$, $$日鮮食品有限公司$$, $$external$$, null, $$4628dbc3-d8f4-4c6f-9bf9-fac499342394$$::uuid, 178),
  (null, $$粉葛$$, $$KG$$, $$日鮮食品有限公司$$, $$external$$, null, $$4628dbc3-d8f4-4c6f-9bf9-fac499342394$$::uuid, 179),
  (null, $$粉葛肉$$, $$KG$$, $$日鮮食品有限公司$$, $$external$$, null, $$4628dbc3-d8f4-4c6f-9bf9-fac499342394$$::uuid, 180),
  (null, $$蓮藕$$, $$KG$$, $$日鮮食品有限公司$$, $$external$$, null, $$4628dbc3-d8f4-4c6f-9bf9-fac499342394$$::uuid, 181),
  (null, $$蓮藕肉$$, $$KG$$, $$日鮮食品有限公司$$, $$external$$, null, $$4628dbc3-d8f4-4c6f-9bf9-fac499342394$$::uuid, 182),
  (null, $$洋蔥$$, $$KG$$, $$日鮮食品有限公司$$, $$external$$, null, $$4628dbc3-d8f4-4c6f-9bf9-fac499342394$$::uuid, 183),
  (null, $$洋蔥肉$$, $$KG$$, $$日鮮食品有限公司$$, $$external$$, null, $$4628dbc3-d8f4-4c6f-9bf9-fac499342394$$::uuid, 184),
  (null, $$青蘿蔔肉$$, $$KG$$, $$日鮮食品有限公司$$, $$external$$, null, $$4628dbc3-d8f4-4c6f-9bf9-fac499342394$$::uuid, 185),
  (null, $$白蘿蔔肉$$, $$KG$$, $$日鮮食品有限公司$$, $$external$$, null, $$4628dbc3-d8f4-4c6f-9bf9-fac499342394$$::uuid, 186),
  (null, $$蒜蓉$$, $$KG$$, $$日鮮食品有限公司$$, $$external$$, null, $$4628dbc3-d8f4-4c6f-9bf9-fac499342394$$::uuid, 187),
  (null, $$薑蓉$$, $$KG$$, $$日鮮食品有限公司$$, $$external$$, null, $$4628dbc3-d8f4-4c6f-9bf9-fac499342394$$::uuid, 188),
  (null, $$韭菜$$, $$KG$$, $$日鮮食品有限公司$$, $$external$$, null, $$4628dbc3-d8f4-4c6f-9bf9-fac499342394$$::uuid, 189),
  (null, $$蒜肉$$, $$KG$$, $$日鮮食品有限公司$$, $$external$$, null, $$4628dbc3-d8f4-4c6f-9bf9-fac499342394$$::uuid, 190),
  (null, $$薑/有皮姜$$, $$KG$$, $$日鮮食品有限公司$$, $$external$$, null, $$4628dbc3-d8f4-4c6f-9bf9-fac499342394$$::uuid, 191),
  (null, $$薄荷葉$$, $$KG$$, $$日鮮食品有限公司$$, $$external$$, null, $$4628dbc3-d8f4-4c6f-9bf9-fac499342394$$::uuid, 192),
  (null, $$青蔥肉$$, $$KG$$, $$日鮮食品有限公司$$, $$external$$, null, $$4628dbc3-d8f4-4c6f-9bf9-fac499342394$$::uuid, 193),
  (null, $$芫茜$$, $$KG$$, $$日鮮食品有限公司$$, $$external$$, null, $$4628dbc3-d8f4-4c6f-9bf9-fac499342394$$::uuid, 194),
  (null, $$切乾蔥肉絲$$, $$KG$$, $$日鮮食品有限公司$$, $$external$$, null, $$4628dbc3-d8f4-4c6f-9bf9-fac499342394$$::uuid, 195),
  (null, $$乾蔥肉$$, $$KG$$, $$日鮮食品有限公司$$, $$external$$, null, $$4628dbc3-d8f4-4c6f-9bf9-fac499342394$$::uuid, 196),
  (null, $$金不換(老虎牌)$$, $$包$$, $$日鮮食品有限公司$$, $$external$$, null, $$4628dbc3-d8f4-4c6f-9bf9-fac499342394$$::uuid, 197),
  (null, $$九層塔(金不換)$$, $$KG$$, $$日鮮食品有限公司$$, $$external$$, null, $$4628dbc3-d8f4-4c6f-9bf9-fac499342394$$::uuid, 198),
  (null, $$香茅(泰國)$$, $$KG$$, $$日鮮食品有限公司$$, $$external$$, null, $$4628dbc3-d8f4-4c6f-9bf9-fac499342394$$::uuid, 199),
  (null, $$鮮冬菇$$, $$KG$$, $$日鮮食品有限公司$$, $$external$$, null, $$4628dbc3-d8f4-4c6f-9bf9-fac499342394$$::uuid, 200),
  (null, $$鮮冬菇(去蒂)$$, $$KG$$, $$日鮮食品有限公司$$, $$external$$, null, $$4628dbc3-d8f4-4c6f-9bf9-fac499342394$$::uuid, 201),
  (null, $$靈芝菇$$, $$包$$, $$日鮮食品有限公司$$, $$external$$, null, $$4628dbc3-d8f4-4c6f-9bf9-fac499342394$$::uuid, 202),
  (null, $$銀芽$$, $$KG$$, $$日鮮食品有限公司$$, $$external$$, null, $$4628dbc3-d8f4-4c6f-9bf9-fac499342394$$::uuid, 203),
  (null, $$白豆腐乾$$, $$件$$, $$日鮮食品有限公司$$, $$external$$, null, $$4628dbc3-d8f4-4c6f-9bf9-fac499342394$$::uuid, 204),
  (null, $$青波椒$$, $$KG$$, $$日鮮食品有限公司$$, $$external$$, null, $$4628dbc3-d8f4-4c6f-9bf9-fac499342394$$::uuid, 205),
  (null, $$紅圓椒$$, $$KG$$, $$日鮮食品有限公司$$, $$external$$, null, $$4628dbc3-d8f4-4c6f-9bf9-fac499342394$$::uuid, 206),
  (null, $$黃圓椒$$, $$KG$$, $$日鮮食品有限公司$$, $$external$$, null, $$4628dbc3-d8f4-4c6f-9bf9-fac499342394$$::uuid, 207),
  (null, $$味菜$$, $$KG$$, $$日鮮食品有限公司$$, $$external$$, null, $$4628dbc3-d8f4-4c6f-9bf9-fac499342394$$::uuid, 208),
  (null, $$採青菜$$, $$扎$$, $$日鮮食品有限公司$$, $$external$$, null, $$4628dbc3-d8f4-4c6f-9bf9-fac499342394$$::uuid, 209),
  (null, $$雞蛋(泰國)$$, $$排$$, $$日鮮食品有限公司$$, $$external$$, null, $$4628dbc3-d8f4-4c6f-9bf9-fac499342394$$::uuid, 210),
  (null, $$紅蘋果$$, $$個$$, $$日鮮食品有限公司$$, $$external$$, null, $$4628dbc3-d8f4-4c6f-9bf9-fac499342394$$::uuid, 211),
  (null, $$椰子肉$$, $$個$$, $$日鮮食品有限公司$$, $$external$$, null, $$4628dbc3-d8f4-4c6f-9bf9-fac499342394$$::uuid, 212),
  (null, $$雪梨 (天津梨)$$, $$個$$, $$日鮮食品有限公司$$, $$external$$, null, $$4628dbc3-d8f4-4c6f-9bf9-fac499342394$$::uuid, 213),
  (null, $$木瓜仔$$, $$KG$$, $$日鮮食品有限公司$$, $$external$$, null, $$4628dbc3-d8f4-4c6f-9bf9-fac499342394$$::uuid, 214),
  (null, $$白菜豬肉餃 (20個/包)(12包/箱)$$, $$箱$$, $$金福華食物(香港)有限公司$$, $$external$$, null, $$d8d625aa-a1dc-4a38-8f54-ae65767b6f55$$::uuid, 215),
  (null, $$傳統香菇肉燥 (8包/箱)$$, $$箱$$, $$金福華食物(香港)有限公司$$, $$external$$, null, $$d8d625aa-a1dc-4a38-8f54-ae65767b6f55$$::uuid, 216),
  (null, $$特級花枝丸(藍色) (3KG*6包/箱)$$, $$箱$$, $$金福華食物(香港)有限公司$$, $$external$$, null, $$d8d625aa-a1dc-4a38-8f54-ae65767b6f55$$::uuid, 217),
  (null, $$花枝丸(特級) (6包/箱)$$, $$包$$, $$金福華食物(香港)有限公司$$, $$external$$, null, $$d8d625aa-a1dc-4a38-8f54-ae65767b6f55$$::uuid, 218),
  (null, $$A級花枝丸(3kg) (6包/箱)$$, $$包$$, $$金福華食物(香港)有限公司$$, $$external$$, null, $$d8d625aa-a1dc-4a38-8f54-ae65767b6f55$$::uuid, 219),
  (null, $$蒜味台灣香腸$$, $$包$$, $$金福華食物(香港)有限公司$$, $$external$$, null, $$d8d625aa-a1dc-4a38-8f54-ae65767b6f55$$::uuid, 220),
  (null, $$水林地瓜條$$, $$箱$$, $$金福華食物(香港)有限公司$$, $$external$$, null, $$d8d625aa-a1dc-4a38-8f54-ae65767b6f55$$::uuid, 221),
  (null, $$脆皮地瓜條 3kg x 6包 (14mm)$$, $$包$$, $$金福華食物(香港)有限公司$$, $$external$$, null, $$d8d625aa-a1dc-4a38-8f54-ae65767b6f55$$::uuid, 222),
  (null, $$蛋餅$$, $$包$$, $$金福華食物(香港)有限公司$$, $$external$$, null, $$d8d625aa-a1dc-4a38-8f54-ae65767b6f55$$::uuid, 223),
  (null, $$甜不辣$$, $$包$$, $$金福華食物(香港)有限公司$$, $$external$$, null, $$d8d625aa-a1dc-4a38-8f54-ae65767b6f55$$::uuid, 224),
  (null, $$高慶泉甜辣醬$$, $$桶$$, $$金福華食物(香港)有限公司$$, $$external$$, null, $$d8d625aa-a1dc-4a38-8f54-ae65767b6f55$$::uuid, 225),
  (null, $$檸檬原汁$$, $$瓶$$, $$金福華食物(香港)有限公司$$, $$external$$, null, $$d8d625aa-a1dc-4a38-8f54-ae65767b6f55$$::uuid, 226),
  (null, $$檸檬原汁$$, $$瓶$$, $$金福華食物(香港)有限公司$$, $$external$$, null, $$d8d625aa-a1dc-4a38-8f54-ae65767b6f55$$::uuid, 227),
  (null, $$福華牌雞汁$$, $$箱$$, $$金福華食物(香港)有限公司$$, $$external$$, null, $$d8d625aa-a1dc-4a38-8f54-ae65767b6f55$$::uuid, 228),
  (null, $$急凍小芋圓 1kg/包$$, $$包$$, $$金福華食物(香港)有限公司$$, $$external$$, null, $$d8d625aa-a1dc-4a38-8f54-ae65767b6f55$$::uuid, 229),
  (null, $$厚切黑魚片(250g/包) (50包/箱)$$, $$包$$, $$長明國際(香港)集團有限公司$$, $$external$$, null, $$0480893b-af08-4ad1-80d9-74fa84d6de2a$$::uuid, 230),
  (null, $$金湯包(1kg/包) (12包/箱)$$, $$包$$, $$長明國際(香港)集團有限公司$$, $$external$$, null, $$0480893b-af08-4ad1-80d9-74fa84d6de2a$$::uuid, 231),
  (null, $$海的炒制酸菜(1kg/包)(10包/箱)$$, $$包$$, $$長明國際(香港)集團有限公司$$, $$external$$, null, $$0480893b-af08-4ad1-80d9-74fa84d6de2a$$::uuid, 232),
  (null, $$丁晴藍無粉手套 (100隻)$$, $$盒$$, $$浚峰企業有限公司$$, $$external$$, null, $$67e495d4-dff1-40f8-ad56-3e56a1abb6d4$$::uuid, 233),
  (null, $$丁晴藍無粉手套 (100隻)$$, $$盒$$, $$浚峰企業有限公司$$, $$external$$, null, $$67e495d4-dff1-40f8-ad56-3e56a1abb6d4$$::uuid, 234),
  (null, $$VIRJOY 餐巾紙$$, $$盒$$, $$浚峰企業有限公司$$, $$external$$, null, $$67e495d4-dff1-40f8-ad56-3e56a1abb6d4$$::uuid, 235),
  (null, $$餐飲專用不掉毛清潔抹布(5條/包)$$, $$包$$, $$浚峰企業有限公司$$, $$external$$, null, $$67e495d4-dff1-40f8-ad56-3e56a1abb6d4$$::uuid, 236),
  (null, $$益力多 (五支裝)$$, $$排$$, $$益力多公司$$, $$external$$, null, $$35ce4a0d-bb23-49bb-aaff-553aa14c7add$$::uuid, 237),
  (null, $$360(3A蛋) 360/盒 or 12排/盒$$, $$箱$$, $$強記蛋行$$, $$external$$, null, $$ee0986bb-db19-45f0-968d-808b87a4959e$$::uuid, 238),
  (null, $$檸檬(原庄)$$, $$箱$$, $$強記蛋行$$, $$external$$, null, $$ee0986bb-db19-45f0-968d-808b87a4959e$$::uuid, 239),
  (null, $$淘大沙嗲醬$$, $$罐$$, $$淘大$$, $$external$$, null, $$7e0d1992-86d9-4131-8f28-8484558bf5ff$$::uuid, 240),
  (null, $$幼吸管 (長)$$, $$包$$, $$意華$$, $$external$$, null, $$ad4fc765-3452-4aff-9047-d050aa40fb20$$::uuid, 241),
  (null, $$珍珠吸管 (長)$$, $$包$$, $$意華$$, $$external$$, null, $$ad4fc765-3452-4aff-9047-d050aa40fb20$$::uuid, 242),
  (null, $$紙杯套 (空白)$$, $$包$$, $$意華$$, $$external$$, null, $$ad4fc765-3452-4aff-9047-d050aa40fb20$$::uuid, 243),
  (null, $$7" 熱飲攪拌棒$$, $$包$$, $$意華$$, $$external$$, null, $$ad4fc765-3452-4aff-9047-d050aa40fb20$$::uuid, 244),
  (null, $$26oz透明外賣盒底$$, $$箱$$, $$意華$$, $$external$$, null, $$ad4fc765-3452-4aff-9047-d050aa40fb20$$::uuid, 245),
  (null, $$26oz透明外賣盒蓋$$, $$箱$$, $$意華$$, $$external$$, null, $$ad4fc765-3452-4aff-9047-d050aa40fb20$$::uuid, 246),
  (null, $$餐具包 - 中式$$, $$包$$, $$意華$$, $$external$$, null, $$ad4fc765-3452-4aff-9047-d050aa40fb20$$::uuid, 247),
  (null, $$餐具包 - 西式$$, $$包$$, $$意華$$, $$external$$, null, $$ad4fc765-3452-4aff-9047-d050aa40fb20$$::uuid, 248),
  (null, $$6oz 熱杯 (無logo)$$, $$條$$, $$意華$$, $$external$$, null, $$ad4fc765-3452-4aff-9047-d050aa40fb20$$::uuid, 249),
  (null, $$24oz PP 膠杯 (700ml) (500個/箱)$$, $$箱$$, $$意華$$, $$external$$, null, $$ad4fc765-3452-4aff-9047-d050aa40fb20$$::uuid, 250),
  (null, $$24oz PP 膠杯 (70ml) 磨沙$$, $$箱$$, $$意華$$, $$external$$, null, $$ad4fc765-3452-4aff-9047-d050aa40fb20$$::uuid, 251),
  (null, $$紙吸管_幼(6mm x230mm)(5000支)$$, $$箱$$, $$意華$$, $$external$$, null, $$ad4fc765-3452-4aff-9047-d050aa40fb20$$::uuid, 252),
  (null, $$(平底無孔)8oz 微波爐碗連防漏蓋 (240套)$$, $$箱$$, $$意華$$, $$external$$, null, $$ad4fc765-3452-4aff-9047-d050aa40fb20$$::uuid, 253),
  (null, $$單格微波爐盒_不連蓋(黑色)(250個/箱)$$, $$箱$$, $$意華$$, $$external$$, null, $$ad4fc765-3452-4aff-9047-d050aa40fb20$$::uuid, 254),
  (null, $$單格微波爐盒膠蓋 (透明)(250個/箱)$$, $$箱$$, $$意華$$, $$external$$, null, $$ad4fc765-3452-4aff-9047-d050aa40fb20$$::uuid, 255),
  (null, $$4杯杯裝外賣盒(啡色)(200個/箱)$$, $$箱$$, $$意華$$, $$external$$, null, $$ad4fc765-3452-4aff-9047-d050aa40fb20$$::uuid, 256),
  (null, $$5格黑色日式盒連蓋 (300個/箱)$$, $$箱$$, $$意華$$, $$external$$, null, $$ad4fc765-3452-4aff-9047-d050aa40fb20$$::uuid, 257),
  (null, $$2-3oz 透明膠杯蓋 (2,000個/箱)$$, $$箱$$, $$意華$$, $$external$$, null, $$ad4fc765-3452-4aff-9047-d050aa40fb20$$::uuid, 258),
  (null, $$3oz 透邊明膠杯 (2,000個/箱)$$, $$箱$$, $$意華$$, $$external$$, null, $$ad4fc765-3452-4aff-9047-d050aa40fb20$$::uuid, 259),
  (null, $$4"木甜品更$$, $$包$$, $$意華$$, $$external$$, null, $$ad4fc765-3452-4aff-9047-d050aa40fb20$$::uuid, 260),
  (null, $$2.5oz試飲杯(白色)$$, $$箱$$, $$意華$$, $$external$$, null, $$ad4fc765-3452-4aff-9047-d050aa40fb20$$::uuid, 261),
  (null, $$豬肉眼絲$$, $$磅$$, $$新豐凍肉食品市埸$$, $$external$$, null, $$40c55969-f54e-4fc7-8858-861ad463bca2$$::uuid, 262),
  (null, $$牛湯骨$$, $$磅$$, $$新豐凍肉食品市埸$$, $$external$$, null, $$40c55969-f54e-4fc7-8858-861ad463bca2$$::uuid, 263),
  (null, $$豬湯骨$$, $$磅$$, $$新豐凍肉食品市埸$$, $$external$$, null, $$40c55969-f54e-4fc7-8858-861ad463bca2$$::uuid, 264),
  (null, $$豬腩肉片$$, $$磅$$, $$新豐凍肉食品市埸$$, $$external$$, null, $$40c55969-f54e-4fc7-8858-861ad463bca2$$::uuid, 265),
  (null, $$雞中翼 (巴西)$$, $$磅$$, $$新豐凍肉食品市埸$$, $$external$$, null, $$40c55969-f54e-4fc7-8858-861ad463bca2$$::uuid, 266),
  (null, $$冰鮮雞$$, $$隻$$, $$新豐凍肉食品市埸$$, $$external$$, null, $$40c55969-f54e-4fc7-8858-861ad463bca2$$::uuid, 267),
  (null, $$切雞髀$$, $$磅$$, $$新豐凍肉食品市埸$$, $$external$$, null, $$40c55969-f54e-4fc7-8858-861ad463bca2$$::uuid, 268),
  (null, $$去皮雞扒(上脾肉)$$, $$KG$$, $$新豐凍肉食品市埸$$, $$external$$, null, $$40c55969-f54e-4fc7-8858-861ad463bca2$$::uuid, 269),
  (null, $$美樂火腿片$$, $$包$$, $$新豐凍肉食品市埸$$, $$external$$, null, $$40c55969-f54e-4fc7-8858-861ad463bca2$$::uuid, 270),
  (null, $$豬梅肉片$$, $$包$$, $$新豐凍肉食品市埸$$, $$external$$, null, $$40c55969-f54e-4fc7-8858-861ad463bca2$$::uuid, 271),
  (null, $$肥牛片$$, $$包$$, $$新豐凍肉食品市埸$$, $$external$$, null, $$40c55969-f54e-4fc7-8858-861ad463bca2$$::uuid, 272),
  (null, $$71/90蝦仁$$, $$磅$$, $$新豐凍肉食品市埸$$, $$external$$, null, $$40c55969-f54e-4fc7-8858-861ad463bca2$$::uuid, 273),
  (null, $$豬頸肉$$, $$磅$$, $$新豐凍肉食品市埸$$, $$external$$, null, $$40c55969-f54e-4fc7-8858-861ad463bca2$$::uuid, 274),
  (null, $$台式鹵水包 (川式) (半斤裝)$$, $$斤$$, $$源興$$, $$external$$, null, $$36c1ff72-5f6c-4615-86fe-e500bc878b86$$::uuid, 275),
  (null, $$四川青麻椒$$, $$包$$, $$源興$$, $$external$$, null, $$36c1ff72-5f6c-4615-86fe-e500bc878b86$$::uuid, 276),
  (null, $$八角$$, $$包$$, $$源興$$, $$external$$, null, $$36c1ff72-5f6c-4615-86fe-e500bc878b86$$::uuid, 277),
  (null, $$土花椒$$, $$包$$, $$源興$$, $$external$$, null, $$36c1ff72-5f6c-4615-86fe-e500bc878b86$$::uuid, 278),
  (null, $$新豐江西米線 2kg x 12/箱$$, $$箱$$, $$鴻發號糧油食品有限公司$$, $$external$$, null, $$6f94774e-4768-4722-9469-7067cda4c048$$::uuid, 279),
  (null, $$坑紋通粉 (意粉叔叔)花通粉 7lb/包$$, $$包$$, $$鴻發號糧油食品有限公司$$, $$external$$, null, $$6f94774e-4768-4722-9469-7067cda4c048$$::uuid, 280),
  (null, $$出前一丁 原味 100g x 30/箱$$, $$箱$$, $$鴻發號糧油食品有限公司$$, $$external$$, null, $$6f94774e-4768-4722-9469-7067cda4c048$$::uuid, 281),
  (null, $$辛辣麵 120g x 40/箱$$, $$箱$$, $$鴻發號糧油食品有限公司$$, $$external$$, null, $$6f94774e-4768-4722-9469-7067cda4c048$$::uuid, 282),
  (null, $$櫻城牌珍珠米$$, $$包$$, $$鴻發號糧油食品有限公司$$, $$external$$, null, $$6f94774e-4768-4722-9469-7067cda4c048$$::uuid, 283),
  (null, $$德國生粉 (時價)$$, $$斤$$, $$鴻發號糧油食品有限公司$$, $$external$$, null, $$6f94774e-4768-4722-9469-7067cda4c048$$::uuid, 284),
  (null, $$三象粘米粉 (600g/包)$$, $$包$$, $$鴻發號糧油食品有限公司$$, $$external$$, null, $$6f94774e-4768-4722-9469-7067cda4c048$$::uuid, 285),
  (null, $$斧頭牌食粉$$, $$盒$$, $$鴻發號糧油食品有限公司$$, $$external$$, null, $$6f94774e-4768-4722-9469-7067cda4c048$$::uuid, 286),
  (null, $$天龍牌麵包糠 1kg/包$$, $$包$$, $$鴻發號糧油食品有限公司$$, $$external$$, null, $$6f94774e-4768-4722-9469-7067cda4c048$$::uuid, 287),
  (null, $$(紅蓋)美膳坊24斤生油 24斤/罐 (時價)$$, $$罐$$, $$鴻發號糧油食品有限公司$$, $$external$$, null, $$6f94774e-4768-4722-9469-7067cda4c048$$::uuid, 288),
  (null, $$(金湖)24斤生油 24斤/罐$$, $$罐$$, $$鴻發號糧油食品有限公司$$, $$external$$, null, $$6f94774e-4768-4722-9469-7067cda4c048$$::uuid, 289),
  (null, $$芝士碎 (FFP馬蘇里拉)$$, $$包$$, $$鴻發號糧油食品有限公司$$, $$external$$, null, $$6f94774e-4768-4722-9469-7067cda4c048$$::uuid, 290),
  (null, $$芝士碎 (Anchor Mozzarella) (2kg/包)$$, $$包$$, $$鴻發號糧油食品有限公司$$, $$external$$, null, $$6f94774e-4768-4722-9469-7067cda4c048$$::uuid, 291),
  (null, $$韓國幼砂糖 (時價)$$, $$斤$$, $$鴻發號糧油食品有限公司$$, $$external$$, null, $$6f94774e-4768-4722-9469-7067cda4c048$$::uuid, 292),
  (null, $$冰糖碎$$, $$斤$$, $$鴻發號糧油食品有限公司$$, $$external$$, null, $$6f94774e-4768-4722-9469-7067cda4c048$$::uuid, 293),
  (null, $$黃糖 600g/包$$, $$包$$, $$鴻發號糧油食品有限公司$$, $$external$$, null, $$6f94774e-4768-4722-9469-7067cda4c048$$::uuid, 294),
  (null, $$桂花糖 250g/樽$$, $$樽$$, $$鴻發號糧油食品有限公司$$, $$external$$, null, $$6f94774e-4768-4722-9469-7067cda4c048$$::uuid, 295),
  (null, $$幼鹽 5斤/包$$, $$斤$$, $$鴻發號糧油食品有限公司$$, $$external$$, null, $$6f94774e-4768-4722-9469-7067cda4c048$$::uuid, 296),
  (null, $$味椒鹽 80g/樽$$, $$樽$$, $$鴻發號糧油食品有限公司$$, $$external$$, null, $$6f94774e-4768-4722-9469-7067cda4c048$$::uuid, 297),
  (null, $$家樂牌 調味雞粉(補充) 1kgx12/箱$$, $$箱$$, $$鴻發號糧油食品有限公司$$, $$external$$, null, $$6f94774e-4768-4722-9469-7067cda4c048$$::uuid, 298),
  (null, $$家樂牌 調味雞粉(補充) 1KG$$, $$包$$, $$鴻發號糧油食品有限公司$$, $$external$$, null, $$6f94774e-4768-4722-9469-7067cda4c048$$::uuid, 299),
  (null, $$家樂牌港式忌廉雞湯粉 900g/罐$$, $$罐$$, $$鴻發號糧油食品有限公司$$, $$external$$, null, $$6f94774e-4768-4722-9469-7067cda4c048$$::uuid, 300),
  (null, $$家樂牌日式豬骨湯粉 850g/罐$$, $$罐$$, $$鴻發號糧油食品有限公司$$, $$external$$, null, $$6f94774e-4768-4722-9469-7067cda4c048$$::uuid, 301),
  (null, $$1.8L 珠江橋牌 生抽王$$, $$箱$$, $$鴻發號糧油食品有限公司$$, $$external$$, null, $$6f94774e-4768-4722-9469-7067cda4c048$$::uuid, 302),
  (null, $$萬字豉油(日本)1.8L/支$$, $$支$$, $$鴻發號糧油食品有限公司$$, $$external$$, null, $$6f94774e-4768-4722-9469-7067cda4c048$$::uuid, 303),
  (null, $$1.8L 珠江橋牌金標老抽王$$, $$箱$$, $$鴻發號糧油食品有限公司$$, $$external$$, null, $$6f94774e-4768-4722-9469-7067cda4c048$$::uuid, 304),
  (null, $$美極鮮醬油 - 5號  600ml/支$$, $$支$$, $$鴻發號糧油食品有限公司$$, $$external$$, null, $$6f94774e-4768-4722-9469-7067cda4c048$$::uuid, 305),
  (null, $$大豐麻油 600ml/支$$, $$支$$, $$鴻發號糧油食品有限公司$$, $$external$$, null, $$6f94774e-4768-4722-9469-7067cda4c048$$::uuid, 306),
  (null, $$李錦記照燒汁  2.2kg/桶$$, $$桶$$, $$鴻發號糧油食品有限公司$$, $$external$$, null, $$6f94774e-4768-4722-9469-7067cda4c048$$::uuid, 307),
  (null, $$錦珍記豆瓣醬 7kg/桶$$, $$桶$$, $$鴻發號糧油食品有限公司$$, $$external$$, null, $$6f94774e-4768-4722-9469-7067cda4c048$$::uuid, 308),
  (null, $$泰國皇冠牌魚露 750ml/支$$, $$支$$, $$鴻發號糧油食品有限公司$$, $$external$$, null, $$6f94774e-4768-4722-9469-7067cda4c048$$::uuid, 309),
  (null, $$家樂牌 雙蠔蠔油 2.3kg/桶$$, $$桶$$, $$鴻發號糧油食品有限公司$$, $$external$$, null, $$6f94774e-4768-4722-9469-7067cda4c048$$::uuid, 310),
  (null, $$汕頭米醋 600ml/支$$, $$支$$, $$鴻發號糧油食品有限公司$$, $$external$$, null, $$6f94774e-4768-4722-9469-7067cda4c048$$::uuid, 311),
  (null, $$海天5度白醋1.9/l 桶$$, $$桶$$, $$鴻發號糧油食品有限公司$$, $$external$$, null, $$6f94774e-4768-4722-9469-7067cda4c048$$::uuid, 312),
  (null, $$金梅牌 鎮江香醋 550ml/支$$, $$支$$, $$鴻發號糧油食品有限公司$$, $$external$$, null, $$6f94774e-4768-4722-9469-7067cda4c048$$::uuid, 313),
  (null, $$頂好牌粗粒花生醬 48oz/樽$$, $$樽$$, $$鴻發號糧油食品有限公司$$, $$external$$, null, $$6f94774e-4768-4722-9469-7067cda4c048$$::uuid, 314),
  (null, $$天龍牌 幼滑花生醬 1kg/罐$$, $$罐$$, $$鴻發號糧油食品有限公司$$, $$external$$, null, $$6f94774e-4768-4722-9469-7067cda4c048$$::uuid, 315),
  (null, $$天龍牌 粗花生醬 1kg/罐$$, $$罐$$, $$鴻發號糧油食品有限公司$$, $$external$$, null, $$6f94774e-4768-4722-9469-7067cda4c048$$::uuid, 316),
  (null, $$茄汁 (地捫牌) 3kg x 9/箱$$, $$罐$$, $$鴻發號糧油食品有限公司$$, $$external$$, null, $$6f94774e-4768-4722-9469-7067cda4c048$$::uuid, 317),
  (null, $$茄汁 (地捫牌) 3kg x 9/箱$$, $$罐$$, $$鴻發號糧油食品有限公司$$, $$external$$, null, $$6f94774e-4768-4722-9469-7067cda4c048$$::uuid, 318),
  (null, $$TGO 罐裝茄汁 3kg x 6/箱$$, $$箱$$, $$鴻發號糧油食品有限公司$$, $$external$$, null, $$6f94774e-4768-4722-9469-7067cda4c048$$::uuid, 319),
  (null, $$TGO 罐裝茄汁 3kg x 6/箱$$, $$罐$$, $$鴻發號糧油食品有限公司$$, $$external$$, null, $$6f94774e-4768-4722-9469-7067cda4c048$$::uuid, 320),
  (null, $$TGO (袋裝)茄汁 1kg x 6/箱$$, $$罐$$, $$鴻發號糧油食品有限公司$$, $$external$$, null, $$6f94774e-4768-4722-9469-7067cda4c048$$::uuid, 321),
  (null, $$地門茄糕 2.95kg/罐$$, $$罐$$, $$鴻發號糧油食品有限公司$$, $$external$$, null, $$6f94774e-4768-4722-9469-7067cda4c048$$::uuid, 322),
  (null, $$天龍牌茄糕 3kg/罐$$, $$罐$$, $$鴻發號糧油食品有限公司$$, $$external$$, null, $$6f94774e-4768-4722-9469-7067cda4c048$$::uuid, 323),
  (null, $$TGO (罐裝) 茄糕 3kg/罐$$, $$罐$$, $$鴻發號糧油食品有限公司$$, $$external$$, null, $$6f94774e-4768-4722-9469-7067cda4c048$$::uuid, 324),
  (null, $$丘比培煎芝麻沙律醬$$, $$支$$, $$鴻發號糧油食品有限公司$$, $$external$$, null, $$6f94774e-4768-4722-9469-7067cda4c048$$::uuid, 325),
  (null, $$丘比培煎芝麻沙律醬 (6支/箱)$$, $$箱$$, $$鴻發號糧油食品有限公司$$, $$external$$, null, $$6f94774e-4768-4722-9469-7067cda4c048$$::uuid, 326),
  (null, $$頂好牌 美玉白汁 (菲律賓) 3kg/桶$$, $$桶$$, $$鴻發號糧油食品有限公司$$, $$external$$, null, $$6f94774e-4768-4722-9469-7067cda4c048$$::uuid, 327),
  (null, $$頂好牌千島醬  2.5kg x 6/箱 (91.33/樽)$$, $$箱$$, $$鴻發號糧油食品有限公司$$, $$external$$, null, $$6f94774e-4768-4722-9469-7067cda4c048$$::uuid, 328),
  (null, $$頂好牌千島醬  2.5kg$$, $$樽$$, $$鴻發號糧油食品有限公司$$, $$external$$, null, $$6f94774e-4768-4722-9469-7067cda4c048$$::uuid, 329),
  (null, $$味淋 1.8L/支$$, $$支$$, $$鴻發號糧油食品有限公司$$, $$external$$, null, $$6f94774e-4768-4722-9469-7067cda4c048$$::uuid, 330),
  (null, $$豬肉鬆 (乾)$$, $$kg$$, $$鴻發號糧油食品有限公司$$, $$external$$, null, $$6f94774e-4768-4722-9469-7067cda4c048$$::uuid, 331),
  (null, $$都樂菠蘿片 836g/罐$$, $$罐$$, $$鴻發號糧油食品有限公司$$, $$external$$, null, $$6f94774e-4768-4722-9469-7067cda4c048$$::uuid, 332),
  (null, $$Castello 意大利茄肉粒(茄蓉) 2.5kg x 6/箱$$, $$箱$$, $$鴻發號糧油食品有限公司$$, $$external$$, null, $$6f94774e-4768-4722-9469-7067cda4c048$$::uuid, 333),
  (null, $$TGO 茄肉粒 2.5kg x 6/箱$$, $$箱$$, $$鴻發號糧油食品有限公司$$, $$external$$, null, $$6f94774e-4768-4722-9469-7067cda4c048$$::uuid, 334),
  (null, $$Victoria 意大利茄肉粒2.5kg x 6/箱$$, $$箱$$, $$鴻發號糧油食品有限公司$$, $$external$$, null, $$6f94774e-4768-4722-9469-7067cda4c048$$::uuid, 335),
  (null, $$Bis 意大利茄肉粒(茄蓉) 2550g x 6/箱$$, $$箱$$, $$鴻發號糧油食品有限公司$$, $$external$$, null, $$6f94774e-4768-4722-9469-7067cda4c048$$::uuid, 336),
  (null, $$散裝櫻花蝦$$, $$斤$$, $$鴻發號糧油食品有限公司$$, $$external$$, null, $$6f94774e-4768-4722-9469-7067cda4c048$$::uuid, 337),
  (null, $$包裝紫菜(35g/包)$$, $$包$$, $$鴻發號糧油食品有限公司$$, $$external$$, null, $$6f94774e-4768-4722-9469-7067cda4c048$$::uuid, 338),
  (null, $$玖柒牌 紫菜 (30g/小包)$$, $$包$$, $$鴻發號糧油食品有限公司$$, $$external$$, null, $$6f94774e-4768-4722-9469-7067cda4c048$$::uuid, 339),
  (null, $$乾雪耳 (原色)$$, $$斤$$, $$鴻發號糧油食品有限公司$$, $$external$$, null, $$6f94774e-4768-4722-9469-7067cda4c048$$::uuid, 340),
  (null, $$木耳乾 (貓耳朵/老鼠耳)$$, $$斤$$, $$鴻發號糧油食品有限公司$$, $$external$$, null, $$6f94774e-4768-4722-9469-7067cda4c048$$::uuid, 341),
  (null, $$南杏仁 (龍皇杏)$$, $$斤$$, $$鴻發號糧油食品有限公司$$, $$external$$, null, $$6f94774e-4768-4722-9469-7067cda4c048$$::uuid, 342),
  (null, $$無花果(土耳其) 400g/盒$$, $$盒$$, $$鴻發號糧油食品有限公司$$, $$external$$, null, $$6f94774e-4768-4722-9469-7067cda4c048$$::uuid, 343),
  (null, $$無花果(土耳其) 454g/盒$$, $$盒$$, $$鴻發號糧油食品有限公司$$, $$external$$, null, $$6f94774e-4768-4722-9469-7067cda4c048$$::uuid, 344),
  (null, $$特級去衣合核肉(必須冷藏)$$, $$斤$$, $$鴻發號糧油食品有限公司$$, $$external$$, null, $$6f94774e-4768-4722-9469-7067cda4c048$$::uuid, 345),
  (null, $$白芝麻$$, $$斤$$, $$鴻發號糧油食品有限公司$$, $$external$$, null, $$6f94774e-4768-4722-9469-7067cda4c048$$::uuid, 346),
  (null, $$黑芝麻$$, $$斤$$, $$鴻發號糧油食品有限公司$$, $$external$$, null, $$6f94774e-4768-4722-9469-7067cda4c048$$::uuid, 347),
  (null, $$(原色)海底椰$$, $$斤$$, $$鴻發號糧油食品有限公司$$, $$external$$, null, $$6f94774e-4768-4722-9469-7067cda4c048$$::uuid, 348),
  (null, $$炸蔥 600g/包$$, $$包$$, $$鴻發號糧油食品有限公司$$, $$external$$, null, $$6f94774e-4768-4722-9469-7067cda4c048$$::uuid, 349),
  (null, $$綠豆$$, $$斤$$, $$鴻發號糧油食品有限公司$$, $$external$$, null, $$6f94774e-4768-4722-9469-7067cda4c048$$::uuid, 350),
  (null, $$大粒花生$$, $$斤$$, $$鴻發號糧油食品有限公司$$, $$external$$, null, $$6f94774e-4768-4722-9469-7067cda4c048$$::uuid, 351),
  (null, $$黃豆 (加拿大)$$, $$斤$$, $$鴻發號糧油食品有限公司$$, $$external$$, null, $$6f94774e-4768-4722-9469-7067cda4c048$$::uuid, 352),
  (null, $$赤小豆$$, $$斤$$, $$鴻發號糧油食品有限公司$$, $$external$$, null, $$6f94774e-4768-4722-9469-7067cda4c048$$::uuid, 353),
  (null, $$眉豆$$, $$斤$$, $$鴻發號糧油食品有限公司$$, $$external$$, null, $$6f94774e-4768-4722-9469-7067cda4c048$$::uuid, 354),
  (null, $$生薏米 (特級)$$, $$斤$$, $$鴻發號糧油食品有限公司$$, $$external$$, null, $$6f94774e-4768-4722-9469-7067cda4c048$$::uuid, 355),
  (null, $$同德興野山椒仔 113g/樽$$, $$樽$$, $$鴻發號糧油食品有限公司$$, $$external$$, null, $$6f94774e-4768-4722-9469-7067cda4c048$$::uuid, 356),
  (null, $$蟲草花$$, $$斤$$, $$鴻發號糧油食品有限公司$$, $$external$$, null, $$6f94774e-4768-4722-9469-7067cda4c048$$::uuid, 357),
  (null, $$淮山$$, $$斤$$, $$鴻發號糧油食品有限公司$$, $$external$$, null, $$6f94774e-4768-4722-9469-7067cda4c048$$::uuid, 358),
  (null, $$土伏苓$$, $$斤$$, $$鴻發號糧油食品有限公司$$, $$external$$, null, $$6f94774e-4768-4722-9469-7067cda4c048$$::uuid, 359),
  (null, $$五指毛桃根$$, $$斤$$, $$鴻發號糧油食品有限公司$$, $$external$$, null, $$6f94774e-4768-4722-9469-7067cda4c048$$::uuid, 360),
  (null, $$鷹嘜 甜奶 350g/罐$$, $$罐$$, $$鴻發號糧油食品有限公司$$, $$external$$, null, $$6f94774e-4768-4722-9469-7067cda4c048$$::uuid, 361),
  (null, $$法樂意全脂紙包奶 1Lx 12/箱$$, $$箱$$, $$鴻發號糧油食品有限公司$$, $$external$$, null, $$6f94774e-4768-4722-9469-7067cda4c048$$::uuid, 362),
  (null, $$Milk Secret 全脂紙包奶 1Lx 12/箱$$, $$箱$$, $$鴻發號糧油食品有限公司$$, $$external$$, null, $$6f94774e-4768-4722-9469-7067cda4c048$$::uuid, 363),
  (null, $$珠江橋牌 廣東米酒 500ml$$, $$箱$$, $$鴻發號糧油食品有限公司$$, $$external$$, null, $$6f94774e-4768-4722-9469-7067cda4c048$$::uuid, 364),
  (null, $$珠江橋牌 廣東米酒 500ml$$, $$支$$, $$鴻發號糧油食品有限公司$$, $$external$$, null, $$6f94774e-4768-4722-9469-7067cda4c048$$::uuid, 365),
  (null, $$土花椒 600g/包$$, $$包$$, $$鴻發號糧油食品有限公司$$, $$external$$, null, $$6f94774e-4768-4722-9469-7067cda4c048$$::uuid, 366),
  (null, $$五香粉 (雙喜) 605g/包$$, $$包$$, $$鴻發號糧油食品有限公司$$, $$external$$, null, $$6f94774e-4768-4722-9469-7067cda4c048$$::uuid, 367),
  (null, $$古月碎雙喜  605g/包$$, $$包$$, $$鴻發號糧油食品有限公司$$, $$external$$, null, $$6f94774e-4768-4722-9469-7067cda4c048$$::uuid, 368),
  (null, $$廣味源古月粉 454g/包$$, $$包$$, $$鴻發號糧油食品有限公司$$, $$external$$, null, $$6f94774e-4768-4722-9469-7067cda4c048$$::uuid, 369),
  (null, $$八角雙喜 600g/包$$, $$包$$, $$鴻發號糧油食品有限公司$$, $$external$$, null, $$6f94774e-4768-4722-9469-7067cda4c048$$::uuid, 370),
  (null, $$草果雙喜 600g/包$$, $$包$$, $$鴻發號糧油食品有限公司$$, $$external$$, null, $$6f94774e-4768-4722-9469-7067cda4c048$$::uuid, 371),
  (null, $$扁豆$$, $$斤$$, $$鴻發號糧油食品有限公司$$, $$external$$, null, $$6f94774e-4768-4722-9469-7067cda4c048$$::uuid, 372),
  (null, $$白蓮子$$, $$斤$$, $$鴻發號糧油食品有限公司$$, $$external$$, null, $$6f94774e-4768-4722-9469-7067cda4c048$$::uuid, 373),
  (null, $$三級百合$$, $$斤$$, $$鴻發號糧油食品有限公司$$, $$external$$, null, $$6f94774e-4768-4722-9469-7067cda4c048$$::uuid, 374),
  (null, $$大蜜棗$$, $$斤$$, $$鴻發號糧油食品有限公司$$, $$external$$, null, $$6f94774e-4768-4722-9469-7067cda4c048$$::uuid, 375),
  (null, $$生晒劍花$$, $$斤$$, $$鴻發號糧油食品有限公司$$, $$external$$, null, $$6f94774e-4768-4722-9469-7067cda4c048$$::uuid, 376),
  (null, $$新豐牌花雕酒$$, $$樽$$, $$鴻發號糧油食品有限公司$$, $$external$$, null, $$6f94774e-4768-4722-9469-7067cda4c048$$::uuid, 377),
  (null, $$辣腐乳$$, $$樽$$, $$鴻發號糧油食品有限公司$$, $$external$$, null, $$6f94774e-4768-4722-9469-7067cda4c048$$::uuid, 378),
  (null, $$炸支竹$$, $$包$$, $$鴻發號糧油食品有限公司$$, $$external$$, null, $$6f94774e-4768-4722-9469-7067cda4c048$$::uuid, 379),
  (null, $$菊花蜜 (皇冠牌) 625ml/支$$, $$支$$, $$鴻發號糧油食品有限公司$$, $$external$$, null, $$6f94774e-4768-4722-9469-7067cda4c048$$::uuid, 380),
  (null, $$雀巢咖啡粉 500g x 6/箱 (560/箱)$$, $$罐$$, $$鴻發號糧油食品有限公司$$, $$external$$, null, $$6f94774e-4768-4722-9469-7067cda4c048$$::uuid, 381),
  (null, $$雀巢咖啡粉 500g x 6/箱 (560/箱)$$, $$箱$$, $$鴻發號糧油食品有限公司$$, $$external$$, null, $$6f94774e-4768-4722-9469-7067cda4c048$$::uuid, 382),
  (null, $$德國 歐德堡35%紙包淡忌廉 1L x 12/箱$$, $$箱$$, $$鴻發號糧油食品有限公司$$, $$external$$, null, $$6f94774e-4768-4722-9469-7067cda4c048$$::uuid, 383),
  (null, $$阿華田 1.8kg/罐 (6罐/箱)$$, $$箱$$, $$鴻發號糧油食品有限公司$$, $$external$$, null, $$6f94774e-4768-4722-9469-7067cda4c048$$::uuid, 384),
  (null, $$阿華田 1.8kg/罐$$, $$罐$$, $$鴻發號糧油食品有限公司$$, $$external$$, null, $$6f94774e-4768-4722-9469-7067cda4c048$$::uuid, 385),
  (null, $$愛護牌甜忌廉 2lb/盒$$, $$盒$$, $$鴻發號糧油食品有限公司$$, $$external$$, null, $$6f94774e-4768-4722-9469-7067cda4c048$$::uuid, 386),
  (null, $$玉泉梳打水 330ml x 24/箱$$, $$箱$$, $$鴻發號糧油食品有限公司$$, $$external$$, null, $$6f94774e-4768-4722-9469-7067cda4c048$$::uuid, 387),
  (null, $$IF 100% 椰青水$$, $$箱$$, $$鴻發號糧油食品有限公司$$, $$external$$, null, $$6f94774e-4768-4722-9469-7067cda4c048$$::uuid, 388),
  (null, $$話梅$$, $$斤$$, $$鴻發號糧油食品有限公司$$, $$external$$, null, $$6f94774e-4768-4722-9469-7067cda4c048$$::uuid, 389),
  (null, $$中式餐具包(中更,筷子,紙巾,牙簽) 100set$$, $$箱$$, $$鴻發號糧油食品有限公司$$, $$external$$, null, $$6f94774e-4768-4722-9469-7067cda4c048$$::uuid, 390),
  (null, $$牛油粒(荷蘭樂味牌) 7g x 400/箱$$, $$箱$$, $$鴻發號糧油食品有限公司$$, $$external$$, null, $$6f94774e-4768-4722-9469-7067cda4c048$$::uuid, 391),
  (null, $$南順牌馬芝蓮 5p/罐$$, $$罐$$, $$鴻發號糧油食品有限公司$$, $$external$$, null, $$6f94774e-4768-4722-9469-7067cda4c048$$::uuid, 392),
  (null, $$紙包牙簽 (5,000's盒)$$, $$盒$$, $$鴻發號糧油食品有限公司$$, $$external$$, null, $$6f94774e-4768-4722-9469-7067cda4c048$$::uuid, 393),
  (null, $$小白糖包  7.5g x 500/包$$, $$包$$, $$鴻發號糧油食品有限公司$$, $$external$$, null, $$6f94774e-4768-4722-9469-7067cda4c048$$::uuid, 394),
  (null, $$咖啡糖包 5g x 424/包$$, $$包$$, $$鴻發號糧油食品有限公司$$, $$external$$, null, $$6f94774e-4768-4722-9469-7067cda4c048$$::uuid, 395),
  (null, $$獨立包裝**粗**紙吸管(12x230)mm$$, $$箱$$, $$鴻發號糧油食品有限公司$$, $$external$$, null, $$6f94774e-4768-4722-9469-7067cda4c048$$::uuid, 396),
  (null, $$獨立包裝**幼**紙吸管(6x210)mm$$, $$箱$$, $$鴻發號糧油食品有限公司$$, $$external$$, null, $$6f94774e-4768-4722-9469-7067cda4c048$$::uuid, 397),
  (null, $$李錦記(小包妝)潮州辣椒油  3g x 300 x 2/箱$$, $$箱$$, $$鴻發號糧油食品有限公司$$, $$external$$, null, $$6f94774e-4768-4722-9469-7067cda4c048$$::uuid, 398),
  (null, $$雷諾士保鮮紙 15"$$, $$條$$, $$鴻發號糧油食品有限公司$$, $$external$$, null, $$6f94774e-4768-4722-9469-7067cda4c048$$::uuid, 399),
  (null, $$大魚袋 10.5" x 9" (12個/排)$$, $$排$$, $$鴻發號糧油食品有限公司$$, $$external$$, null, $$6f94774e-4768-4722-9469-7067cda4c048$$::uuid, 400),
  (null, $$96祝君安好 毛巾 90% 棉$$, $$打$$, $$鴻發號糧油食品有限公司$$, $$external$$, null, $$6f94774e-4768-4722-9469-7067cda4c048$$::uuid, 401),
  (null, $$(紅邊) 勞工手套/打$$, $$打$$, $$鴻發號糧油食品有限公司$$, $$external$$, null, $$6f94774e-4768-4722-9469-7067cda4c048$$::uuid, 402),
  (null, $$黑紅圍裙(2條裝)2條/包$$, $$包$$, $$鴻發號糧油食品有限公司$$, $$external$$, null, $$6f94774e-4768-4722-9469-7067cda4c048$$::uuid, 403),
  (null, $$綠水 1Gall/桶$$, $$桶$$, $$鴻發號糧油食品有限公司$$, $$external$$, null, $$6f94774e-4768-4722-9469-7067cda4c048$$::uuid, 404),
  (null, $$漂白水 40p/桶$$, $$桶$$, $$鴻發號糧油食品有限公司$$, $$external$$, null, $$6f94774e-4768-4722-9469-7067cda4c048$$::uuid, 405),
  (null, $$洗潔精 40p/桶$$, $$桶$$, $$鴻發號糧油食品有限公司$$, $$external$$, null, $$6f94774e-4768-4722-9469-7067cda4c048$$::uuid, 406),
  (null, $$垃圾袋 36" x 42"$$, $$包$$, $$鴻發號糧油食品有限公司$$, $$external$$, null, $$6f94774e-4768-4722-9469-7067cda4c048$$::uuid, 407),
  (null, $$百潔布(韓國) 10塊/扎$$, $$扎$$, $$鴻發號糧油食品有限公司$$, $$external$$, null, $$6f94774e-4768-4722-9469-7067cda4c048$$::uuid, 408),
  (null, $$TGO 加厚黑色膠手套(中/大碼)/打$$, $$打$$, $$鴻發號糧油食品有限公司$$, $$external$$, null, $$6f94774e-4768-4722-9469-7067cda4c048$$::uuid, 409),
  (null, $$TGO 加厚黑色膠手套(小碼)/打$$, $$打$$, $$鴻發號糧油食品有限公司$$, $$external$$, null, $$6f94774e-4768-4722-9469-7067cda4c048$$::uuid, 410),
  (null, $$TGO 100'S 優質藍色(丁晴)手套-M$$, $$盒$$, $$鴻發號糧油食品有限公司$$, $$external$$, null, $$6f94774e-4768-4722-9469-7067cda4c048$$::uuid, 411),
  (null, $$TGO 雙層 M-Fold 抹手紙 16x250's/箱$$, $$箱$$, $$鴻發號糧油食品有限公司$$, $$external$$, null, $$6f94774e-4768-4722-9469-7067cda4c048$$::uuid, 412),
  (null, $$TGO 商用抹手紙 20x200's/箱$$, $$箱$$, $$鴻發號糧油食品有限公司$$, $$external$$, null, $$6f94774e-4768-4722-9469-7067cda4c048$$::uuid, 413),
  (null, $$鮑魚刷(15') (10支/扎)$$, $$扎$$, $$鴻發號糧油食品有限公司$$, $$external$$, null, $$6f94774e-4768-4722-9469-7067cda4c048$$::uuid, 414),
  (null, $$哥士的(不可食用) 5lb/包$$, $$包$$, $$鴻發號糧油食品有限公司$$, $$external$$, null, $$6f94774e-4768-4722-9469-7067cda4c048$$::uuid, 415),
  (null, $$扒爐水 3.8公升/桶$$, $$桶$$, $$鴻發號糧油食品有限公司$$, $$external$$, null, $$6f94774e-4768-4722-9469-7067cda4c048$$::uuid, 416)

) as seed(sku, name, unit, supplier_name, channel, warehouse, fcc_supplier_id, sort_order)
where not exists (
  select 1 from public.shop_catalog_items existing
  where existing.supplier_name = seed.supplier_name
    and existing.name = seed.name
    and coalesce(existing.sku, '') = coalesce(seed.sku, '')
);

insert into public.shop_supplier_contacts (supplier_id, name, phone)
select suppliers.id, suppliers.contact_person, suppliers.phone_number
from public.suppliers
where suppliers.phone_number is not null
  and btrim(suppliers.phone_number) <> ''
  and suppliers.archived_at is null
  and suppliers.id in (
    select distinct fcc_supplier_id from public.shop_catalog_items where fcc_supplier_id is not null
  )
  and not exists (
    select 1 from public.shop_supplier_contacts contact
    where contact.supplier_id = suppliers.id
      and contact.phone = suppliers.phone_number
  );

alter table public.shop_catalog_items enable row level security;
alter table public.shop_supplier_contacts enable row level security;
alter table public.shop_order_requests enable row level security;
alter table public.shop_order_lines enable row level security;
alter table public.shop_order_events enable row level security;

drop policy if exists "Shop catalog readers" on public.shop_catalog_items;
create policy "Shop catalog readers"
  on public.shop_catalog_items for select to authenticated
  using (
    private.has_page_access('workspace.restaurant')
    or private.has_page_access('restaurant.ordering')
  );

drop policy if exists "Shop contact readers" on public.shop_supplier_contacts;
create policy "Shop contact readers"
  on public.shop_supplier_contacts for select to authenticated
  using (
    private.has_page_access('workspace.restaurant')
    or private.has_page_access('restaurant.ordering')
  );

drop policy if exists "Shop contact editors" on public.shop_supplier_contacts;
create policy "Shop contact editors"
  on public.shop_supplier_contacts for all to authenticated
  using (private.has_page_access('restaurant.ordering.phonebook.edit'))
  with check (private.has_page_access('restaurant.ordering.phonebook.edit'));

drop policy if exists "Shop request readers" on public.shop_order_requests;
create policy "Shop request readers"
  on public.shop_order_requests for select to authenticated
  using (
    private.has_page_access('workspace.restaurant')
    or private.has_page_access('restaurant.ordering')
  );

drop policy if exists "Shop request writers" on public.shop_order_requests;
create policy "Shop request writers"
  on public.shop_order_requests for insert to authenticated
  with check (
    private.has_page_access('workspace.restaurant.shop_order')
    or private.has_page_access('restaurant.ordering')
  );

drop policy if exists "Shop request updaters" on public.shop_order_requests;
create policy "Shop request updaters"
  on public.shop_order_requests for update to authenticated
  using (
    private.has_page_access('workspace.restaurant.shop_order')
    or private.has_page_access('restaurant.ordering.review')
  )
  with check (
    private.has_page_access('workspace.restaurant.shop_order')
    or private.has_page_access('restaurant.ordering.review')
  );

drop policy if exists "Shop line readers" on public.shop_order_lines;
create policy "Shop line readers"
  on public.shop_order_lines for select to authenticated
  using (
    private.has_page_access('workspace.restaurant')
    or private.has_page_access('restaurant.ordering')
  );

drop policy if exists "Shop line writers" on public.shop_order_lines;
create policy "Shop line writers"
  on public.shop_order_lines for all to authenticated
  using (
    private.has_page_access('workspace.restaurant.shop_order')
    or private.has_page_access('restaurant.ordering.review')
  )
  with check (
    private.has_page_access('workspace.restaurant.shop_order')
    or private.has_page_access('restaurant.ordering.review')
  );

drop policy if exists "Shop event readers" on public.shop_order_events;
create policy "Shop event readers"
  on public.shop_order_events for select to authenticated
  using (
    private.has_page_access('workspace.restaurant')
    or private.has_page_access('restaurant.ordering')
  );

drop policy if exists "Shop event writers" on public.shop_order_events;
create policy "Shop event writers"
  on public.shop_order_events for insert to authenticated
  with check (
    private.has_page_access('workspace.restaurant.shop_order')
    or private.has_page_access('restaurant.ordering')
  );

insert into public.app_pages (
  page_key, display_name, route, sort_order, is_high_risk, parent_page_key, page_kind
)
values
  ('workspace.restaurant', '餐廳版面', '/restaurant-workspace', 9, false, 'workspace', 'subpage'),
  ('workspace.restaurant.shop_order', '舖頭訂貨', '/restaurant-workspace', 10, false, 'workspace.restaurant', 'subpage'),
  ('workspace.restaurant.records', '本店訂貨紀錄', '/restaurant-workspace/records', 11, false, 'workspace.restaurant', 'subpage'),
  ('restaurant.ordering', '餐廳訂貨', '/restaurant/ordering/requests', 70, false, 'restaurant', 'subpage'),
  ('restaurant.ordering.suppliers', '供應商列表', '/restaurant/ordering/suppliers', 71, false, 'restaurant.ordering', 'subpage'),
  ('restaurant.ordering.requests', '訂貨需求', '/restaurant/ordering/requests', 72, false, 'restaurant.ordering', 'subpage'),
  ('restaurant.ordering.records', '訂貨紀錄', '/restaurant/ordering/records', 73, false, 'restaurant.ordering', 'subpage'),
  ('restaurant.ordering.phonebook', '供應商電話簿', '/restaurant/ordering/phonebook', 74, false, 'restaurant.ordering', 'subpage'),
  ('restaurant.ordering.phonebook.edit', '編輯供應商電話簿', '/restaurant/ordering/phonebook/actions/edit', 75, true, 'restaurant.ordering.phonebook', 'action'),
  ('restaurant.ordering.review', '訂單審核', '/restaurant/ordering/review', 76, true, 'restaurant.ordering', 'subpage'),
  ('restaurant.ordering.review.send_factory', '傳送工場', '/restaurant/ordering/review/actions/send-factory', 77, true, 'restaurant.ordering.review', 'action')
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
),
pages(page_key) as (
  values
    ('workspace.restaurant'),
    ('workspace.restaurant.shop_order'),
    ('workspace.restaurant.records'),
    ('restaurant.ordering'),
    ('restaurant.ordering.suppliers'),
    ('restaurant.ordering.requests'),
    ('restaurant.ordering.records'),
    ('restaurant.ordering.phonebook'),
    ('restaurant.ordering.phonebook.edit'),
    ('restaurant.ordering.review'),
    ('restaurant.ordering.review.send_factory')
)
insert into public.role_page_permissions (role, page_key, can_access, can_manage)
select
  roles.role,
  pages.page_key,
  case
    when pages.page_key like 'workspace.restaurant%'
      then roles.role in ('Super Admin', 'Admin', 'Accounting', 'Shop manager')
    when pages.page_key in ('restaurant.ordering.review', 'restaurant.ordering.review.send_factory')
      then roles.role in ('Super Admin', 'Admin')
    when pages.page_key like 'restaurant.ordering%'
      then roles.role in ('Super Admin', 'Admin', 'Accounting')
    else false
  end,
  roles.role = 'Super Admin'
from roles cross join pages
on conflict (role, page_key) do update
set
  can_access = public.role_page_permissions.can_access or excluded.can_access,
  can_manage = public.role_page_permissions.can_manage or excluded.can_manage,
  updated_at = now();

-- Shop manager cannot approve or send factory.
update public.role_page_permissions
set can_access = false, can_manage = false, updated_at = now()
where role = 'Shop manager'
  and page_key in ('restaurant.ordering.review', 'restaurant.ordering.review.send_factory');

grant select, insert, update, delete on public.shop_catalog_items to authenticated;
grant select, insert, update, delete on public.shop_supplier_contacts to authenticated;
grant select, insert, update, delete on public.shop_order_requests to authenticated;
grant select, insert, update, delete on public.shop_order_lines to authenticated;
grant select, insert, update, delete on public.shop_order_events to authenticated;
grant usage, select on sequence public.shop_order_request_no_seq to authenticated;
