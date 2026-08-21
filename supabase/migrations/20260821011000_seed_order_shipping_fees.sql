with seed(item, fee, display_order) as (
  values
    ('運費 - 新界區 - 地面交收', 0::numeric, 1),
    ('運費 - 九龍區 - 地面交收', 0::numeric, 2),
    ('運費 - 港島區 - 地面交收', 0::numeric, 3),
    ('運費 - 偏遠地區 - 地面交收', 0::numeric, 4),
    ('運費 - 滿 $2800 免運費 - 地面交收', 0::numeric, 5),
    ('運費 - 新界區 - 送貨上門', 0::numeric, 6),
    ('運費 - 九龍區 - 送貨上門', 0::numeric, 7),
    ('運費 - 港島區 - 送貨上門', 0::numeric, 8),
    ('運費 - 荃灣門市自取', 0::numeric, 9),
    ('運費 - TBC', 0::numeric, 10),
    ('運費 - [TEAMHK] 免運費 - 地面交收', 0::numeric, 11),
    ('運費 - 機場地區 - 地面交收', 0::numeric, 12),
    ('運費 - 機場地區 - 送貨上門', 0::numeric, 13),
    ('運費 - 偏遠地區 - 送貨上門', 0::numeric, 14)
)
insert into public.order_shipping_fees (item, fee, created_at, updated_at)
select
  seed.item,
  seed.fee,
  now() + seed.display_order * interval '1 millisecond',
  now()
from seed
where not exists (
  select 1
  from public.order_shipping_fees existing
  where existing.item = seed.item
);
