-- Keep the original stocktake unit. BOM stays in the child unit (條/個/件);
-- consumption and stocktake stay in 包/箱/盒. Do not rewrite master units
-- to the child piece. Reverse the previous child-unit conversions.
-- Order consumption time follows the delivery time, not the write clock.
create table pg_temp.pack_box_unit_restore (
  id uuid primary key,
  name text not null,
  stocktake_unit text not null,
  product_quantity numeric not null
);

insert into pack_box_unit_restore (id, name, stocktake_unit, product_quantity) values
  ('20f63a30-dddc-4b70-9678-a49a4588289a', '一口炸芝士', '包', 50),
  ('0679cf01-5b58-4741-b8cd-c550786ae378', '仿蟹鉗', '包', 16),
  ('214ba671-c489-493c-b523-ddd650870371', '吉列蝴蝶蝦', '包', 50),
  ('a58027e0-cabd-4929-a7b2-ff08a7e7097a', '唐揚雞塊 1kg裝 1kg*8包 (40件/包)', '包', 40),
  ('f502bb28-f51c-4aed-a19c-beaea123f9b9', '森丹Moritan Club芝士年糕(紅白袋)', '包', 15),
  ('5eedbacd-beb6-486d-acf7-958c9d51797e', '泰國黃金蝦球', '包', 39),
  ('7bdf08a0-4b7b-403e-a151-39b3eb0d0c58', '玫瑰花糕 14包/箱', '包', 12),
  ('7ca810d6-79e7-485a-94ad-0838889cc009', '雞肉軟骨棒餃子', '包', 30),
  ('465519db-28fd-4909-befd-feac50ad8fb1', '(透明)12+8背心P.O.膠袋', '包', 100),
  ('cc87d8a5-9d90-457b-bedf-0d70a91a046b', '10寸長法包 10個/包', '包', 10),
  ('dbfd8272-2e2f-490b-90b4-c0ae45c4d9e5', '2.5寸漢堡包 30個/包', '包', 30),
  ('4cfbd0de-4e40-45f2-bb42-34ee4bed6dde', '屋台小籠包', '包', 40),
  ('d8ec322b-ca9f-4373-a580-ea1fc49077f9', '屋台生煎包', '包', 12),
  ('43896ea2-3eab-4ca7-a1f6-ca768c55530c', '日本甘栗紫薯餅', '包', 5),
  ('f0cab1a1-f8c8-4bee-a328-cfd7e68377f6', '泰檸桂花糕 16包/箱', '包', 12),
  ('191051a3-c7dc-4710-923d-d777edde939d', '芝麻熱狗包 30個/包', '包', 30),
  ('95c2cfd0-12f9-45f2-83bb-6d311ee4e80e', '蟹黃八寶飯釀蟹蓋 75g/pc 16包/箱', '包', 10),
  ('66cb4630-a1bb-4246-9efc-a2d78a178ff3', '迷你牛角包 20個/包', '包', 20),
  ('f60025c0-2898-4037-9233-fd4d08b73c74', '法式12支骨羊架雙排裝 7包/箱', '包', 20),
  ('114855f4-c873-4b08-9987-ae337cae3fbc', '法式8支骨羊架雙排裝(9包/箱)', '包', 16),
  ('07faab2a-d15f-4f3e-92f1-6a03270bc07a', '府城花枝卷 30g 20包/箱', '包', 10),
  ('f84d4586-8886-4063-8c8d-4dff15840862', '甜薯米網卷 20g 20包/箱', '包', 20),
  ('e12b0e6c-1219-46da-b790-1b3bbc7f2570', '竹笙蝦滑 30包/箱', '包', 12),
  ('56bb20ec-3cea-4845-bf0c-b6cab9aceee5', '蟹柳', '包', 12),
  ('6214c33b-0e50-4946-98c5-6a575c7b0e38', '西班牙朱古力油條', '包', 33),
  ('41be0a73-850b-45d6-8f72-42ec107e3992', '迷你原味香腸 7-8cm 20包/箱', '包', 20),
  ('cfe23f0b-167d-4063-9ca1-d9b129132d47', '黑糖糍粑 40包/箱', '包', 10),
  ('5a3baf1d-6c5e-4b2d-8357-57afd312a4ea', '10個月切片巴馬火腿片500g', '包', 22),
  ('bc170d41-af01-4d0e-a8d7-4fe01da4d8dd', '沙樂美腸 300g', '包', 40),
  ('79a87cea-f762-4e5c-b39a-b97ca37065ed', '火腿片', '包', 8),
  ('3bc62234-fab9-4d2c-a016-1db915916e77', '芝士片', '包', 12),
  ('3f49cc82-0e85-44f0-8574-2de3ab3d9d3e', '160泡夫 2包/箱', '包', 80),
  ('2f524709-98af-4a14-b3f2-d812382580b1', '28-30頭沙井蠔', '包', 140),
  ('3923c216-12e3-4eea-9fcf-125df974e1f9', '一口芝士粒 6包/箱', '包', 50),
  ('b35dc0c3-aeb8-4f48-840f-af9f7a4437ad', '日本忌廉泡芙', '包', 12),
  ('273ea008-29a0-4bbe-a4c2-92d410e921a6', '日本燒芝士年糕 40g 4包/箱', '包', 20),
  ('e4a5354a-191f-4a8b-bc56-9fc05874a3c4', '頂級巴馬臣芝士 200g', '包', 24),
  ('0901532c-46bc-4f5f-a4f3-149e64ff61ee', '急凍10頭黑邊鮑魚 一包22-24隻', '包', 22),
  ('eaa66028-2497-4f27-b7c5-4d47e152a3ee', '急凍白蜆 40/60pc 20包/箱', '包', 50),
  ('e60dbeb9-d01a-47e4-b5b3-ca8874b3be9c', '沙巴深海老虎蝦 (3隻/包 20包/箱)', '包', 3),
  ('f12ae3ab-73b3-4d68-a528-f0271bc49530', '釀蟹蓋 50g 30包/箱', '包', 8),
  ('c1795f8a-f3e2-41a9-8418-c35fb1eefca8', 'HOLEKI 布朗尼蛋糕', '盒', 220),
  ('bf09e571-37aa-482e-a831-e9dca88e5fa8', 'HOLEKI 香蕉蛋糕', '盒', 220),
  ('7a4128a8-9af0-454a-8bc8-9c6a39d519d6', '鳳尾蝦金絲薯卷', '盒', 10),
  ('3bd272e7-721e-4164-841d-9bd830f821ef', '炭烤雞腿肉串', '盒', 50),
  ('a69a6543-644a-4e77-9328-4cbb5ca3d7e0', '什錦 - 迷你鬆餅 24粒/8盒/箱', '盒', 24),
  ('41c21441-0b2d-400d-a748-bd8ed0987b5c', '台灣紅豆麻糬 24盒/箱', '盒', 6),
  ('f3b1cf13-a21b-4319-ab1d-ea3b09692f3b', '美人蝦(GL-沙特熱帶頭蝦25/35) 8KG/箱 ', '盒', 30),
  ('fd5a0d20-96d9-4fce-8a54-d486bfd65ff9', 'YW810 (黑色)單格微波爐盒 (250個) $120', '箱', 250),
  ('693e0c0d-3b08-4aa2-88c5-ba86646156a0', 'YW810L (透明)810-813微波爐盒膠蓋', '箱', 250),
  ('7eb7f487-d68b-473c-a5c0-f73133bcc781', '貼紙 50x75mm  ', '箱', 36),
  ('be131103-41b1-4fe2-ab7b-b3fb310125bf', '財神蠔油', '箱', 6),
  ('4b5da9c5-4032-4cdc-84b8-2e1a40ac6b92', 'K980 海鱸魚（原條開背）', '箱', 10),
  ('f81ed035-cac3-4ea5-a7d2-2f3e47a926e0', '烏頭魚(開肚)', '箱', 22),
  ('44c898dd-32d7-4100-ab6b-5e03f0c15c53', '廣東米酒', '箱', 12),
  ('076b1584-078c-439b-8bf4-b557ebe093f9', '朱古力布朗尼 96粒/箱', '箱', 96),
  ('7f625137-85aa-453c-84d5-d9dda7950342', '6頭罐頭鮑魚 ', '箱', 12),
  ('89e79bf7-a64c-40d6-9a0e-4b0a088618d9', 'BB豬(越南乳豬) 4隻/1箱', '箱', 4),
  ('8f685de4-9ce3-48c7-bcf1-58ef9aa9bf9d', '雞脾 / 雞比', '箱', 50),
  ('36d4be5b-7ea1-4630-9003-c05a07e1bf88', '忌廉蟹肉薯餅 40g 8包/箱', '包', 15),
  ('7a32395e-b91c-48cf-92a3-57e874fe4788', '亞洲廚沙嗲豬肉串 18包/箱', '包', 24),
  ('dcad7ea7-6a27-41df-acdc-0daa38188393', '急凍肉丸 0.5oz 2包/箱', '包', 160),
  ('9c756f7b-8e95-4f61-b878-d3ceb8b6b9a4', '伊麵', '條', 10),
  ('9788c374-560e-4546-8c15-d0dc85a2d759', '有皮22片裝厚方包', '條', 22);

update public.ingredients ingredient
set stocktake_unit = restore.stocktake_unit,
  product_quantity = restore.product_quantity,
  cost_per_stocktake_unit = coalesce(
    ingredient.cost_per_product_unit * restore.product_quantity,
    ingredient.cost_per_stocktake_unit
  )
from pack_box_unit_restore restore
where ingredient.id = restore.id;

-- The previous repair multiplied every leftover pack count by the pack size.
-- Un-scale only when every non-null event is still an exact multiple, so a
-- later apply does not divide already-restored pack counts a second time.
update public.ingredient_stocktake_events event
set quantity = event.quantity / restore.product_quantity
from pack_box_unit_restore restore
where event.ingredient_id = restore.id
  and event.quantity is not null
  and restore.product_quantity > 1
  and not exists (
    select 1
    from public.ingredient_stocktake_events other
    where other.ingredient_id = restore.id
      and other.quantity is not null
      and other.quantity % restore.product_quantity <> 0
  )
  and exists (
    select 1
    from public.ingredient_stocktake_events other
    where other.ingredient_id = restore.id
      and other.quantity is not null
      and other.quantity > restore.product_quantity
  );

create or replace function private.record_delivered_delivery_material_consumption(
  p_delivery_id uuid
)
returns integer
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
declare
  v_order_id uuid;
  v_consumed_at timestamptz;
  v_revision integer;
  v_inserted integer := 0;
begin
  select delivery.order_id,
    coalesce(delivery.delivery_at, orders.delivery_at, now())
  into v_order_id, v_consumed_at
  from public.deliveries delivery
  join public.orders orders on orders.id = delivery.order_id
  where delivery.id = p_delivery_id
    and private.delivery_material_is_committed(delivery.delivery_status)
    and orders.document_type = 'order'
    and orders.material_commitment_v2
    and orders.archived_at is null
    and orders.merged_into_order_id is null
    and coalesce(orders.delivery_status, '') not in
      ('已取消', '取消', 'Cancelled', 'cancelled')
    and not exists (
      select 1 from public.order_list_manual_todos todo
      where todo.order_id = orders.id and todo.todo_key = 'cancelled'
    );
  if not found then return 0; end if;

  perform private.sync_order_line_delivery_allocations(v_order_id);
  perform private.assert_order_line_delivery_allocations(v_order_id);

  select coalesce(max(consumption.revision), 0) + 1 into v_revision
  from public.order_material_consumptions consumption
  where consumption.order_id = v_order_id;

  insert into public.order_material_consumptions (
    order_id, delivery_id, order_line_id, ingredient_id, quantity,
    consumed_at, calculation_source, metadata, revision
  )
  select v_order_id, p_delivery_id, line.id, requirement.ingredient_id,
    requirement.required_quantity,
    v_consumed_at, requirement.calculation_source,
    jsonb_build_object(
      'deliveryCommitted', true,
      'deliveryId', p_delivery_id,
      'allocatedQuantity', allocation.allocated_quantity
    ),
    v_revision
  from public.order_line_delivery_allocations allocation
  join public.order_lines line on line.id = allocation.order_line_id
  join lateral private.catering_delivery_material_requirements(line.id) requirement
    on requirement.delivery_id = allocation.delivery_id
  where allocation.delivery_id = p_delivery_id
    and line.is_void is false
    and coalesce(line.quantity, 0) > 0
    and requirement.required_quantity > 0
  on conflict (delivery_id, order_line_id, ingredient_id)
    where reversed_at is null do nothing;

  get diagnostics v_inserted = row_count;
  return v_inserted;
end;
$$;

create or replace function private.reconcile_legacy_material_consumption(p_order_id uuid, p_reason text)
returns integer language plpgsql security definer set search_path=public,private,pg_temp as $legacy$
declare v_delivery record; v_rows integer:=0; v_added integer;
begin
  perform private.lock_material_writes();
  update public.order_material_consumptions consumption
    set reversed_at=now(), reversal_reason=p_reason
  where consumption.order_id=p_order_id and consumption.reversed_at is null
    and not exists (
      select 1 from public.orders orders join public.deliveries delivery on delivery.order_id=orders.id
      where orders.id=p_order_id and delivery.id=consumption.delivery_id
        and orders.document_type='order' and orders.archived_at is null and orders.merged_into_order_id is null
        and coalesce(orders.delivery_status,'') not in ('已取消','取消','Cancelled','cancelled')
        and private.delivery_material_is_committed(delivery.delivery_status)
        and not exists(select 1 from public.order_list_manual_todos where order_id=orders.id and todo_key='cancelled')
    );
  for v_delivery in select delivery.* from public.deliveries delivery join public.orders orders on orders.id=delivery.order_id
    where orders.id=p_order_id and orders.document_type='order' and orders.archived_at is null and orders.merged_into_order_id is null
      and coalesce(orders.delivery_status,'') not in ('已取消','取消','Cancelled','cancelled')
      and private.delivery_material_is_committed(delivery.delivery_status)
      and not exists(select 1 from public.order_list_manual_todos where order_id=orders.id and todo_key='cancelled')
    order by delivery.delivery_at nulls last,delivery.id
  loop
    insert into public.order_material_consumptions(order_id,delivery_id,order_line_id,ingredient_id,quantity,consumed_at,calculation_source)
      select p_order_id,v_delivery.id,line.id,requirement.ingredient_id,requirement.required_quantity,
        coalesce(
          v_delivery.delivery_at,
          (select orders.delivery_at from public.orders orders where orders.id = p_order_id),
          now()
        ),
        requirement.calculation_source
      from public.order_lines line
      cross join lateral private.catering_line_material_requirements(line.id) requirement
      where line.order_id=p_order_id and not line.is_void and line.quantity>0
        and (line.delivery_id=v_delivery.id
          or (line.delivery_id is null and line.delivery_at=v_delivery.delivery_at)
          or (line.delivery_id is null and line.delivery_at is null and
            (select count(*) from public.deliveries where order_id=p_order_id
              and coalesce(delivery_status,'') not in ('已取消','取消','Cancelled','cancelled'))=1))
        and round(requirement.required_quantity,3)>0
        and not exists(select 1 from public.order_material_consumptions prior
          where prior.order_line_id=line.id and prior.ingredient_id=requirement.ingredient_id and prior.reversed_at is null);
    get diagnostics v_added=row_count;
    v_rows:=v_rows+v_added;
  end loop;
  return v_rows;
end;
$legacy$;
revoke all on function private.reconcile_legacy_material_consumption(uuid,text) from public,anon,authenticated;

-- Rebuild every order whose live pack-item deduction still uses the child
-- piece count. Then drop those reversed rows instead of keeping them.
do $rebuild_pack_box_consumptions$
declare
  affected record;
begin
  for affected in
    select distinct mismatched.order_id, mismatched.material_commitment_v2
    from (
      select consumption.order_id, orders.material_commitment_v2
      from public.order_material_consumptions consumption
      join public.orders orders on orders.id = consumption.order_id
      join public.order_lines line on line.id = consumption.order_line_id
      join lateral private.catering_line_material_requirements(line.id) requirement
        on requirement.ingredient_id = consumption.ingredient_id
      where consumption.reversed_at is null
        and consumption.ingredient_id in (select id from pack_box_unit_restore)
      group by consumption.order_id, orders.material_commitment_v2,
        line.id, requirement.ingredient_id, requirement.required_quantity
      having round(sum(consumption.quantity), 3)
        is distinct from round(requirement.required_quantity, 3)
    ) mismatched
    order by mismatched.order_id
  loop
    if affected.material_commitment_v2 then
      perform private.reconcile_order_material_consumption(
        affected.order_id,
        'restore_pack_box_units_and_delivery_time'
      );
    else
      perform private.lock_material_writes();
      perform pg_advisory_xact_lock(hashtextextended(affected.order_id::text, 0));
      perform private.reverse_order_material_consumptions(
        affected.order_id,
        'restore_pack_box_units_and_delivery_time'
      );
      perform private.reconcile_legacy_material_consumption(
        affected.order_id,
        'restore_pack_box_units_and_delivery_time'
      );
    end if;
  end loop;

  delete from public.order_material_consumptions
  where reversal_reason = 'restore_pack_box_units_and_delivery_time';
end
$rebuild_pack_box_consumptions$;

update public.order_material_consumptions consumption
set consumed_at = src.delivery_time
from (
  select live.id,
    coalesce(delivery.delivery_at, orders.delivery_at) as delivery_time
  from public.order_material_consumptions live
  join public.orders orders on orders.id = live.order_id
  left join public.deliveries delivery on delivery.id = live.delivery_id
  where live.reversed_at is null
) src
where consumption.id = src.id
  and src.delivery_time is not null
  and consumption.consumed_at is distinct from src.delivery_time;

do $verify$
begin
  if exists (
    select 1
    from public.ingredients ingredient
    join pack_box_unit_restore restore on restore.id = ingredient.id
    where ingredient.stocktake_unit is distinct from restore.stocktake_unit
      or ingredient.product_quantity is distinct from restore.product_quantity
  ) then
    raise exception 'restore_pack_box_units_and_delivery_time_failed';
  end if;

  if exists (
    select 1
    from public.ingredients
    where id = '5346734a-df61-4d46-91ed-17db6985c5e6'
      and not (product_unit = '套' and stocktake_unit = '包' and product_quantity = 100)
  ) then
    raise exception 'restore_pack_box_units_touched_utensil_pack';
  end if;
end
$verify$;
