begin;

update public.order_intake_rules
set customer_message = '中秋送貨繁忙，9月19至20日及25至27日只有 Food Channels Catering（FCC）及 Food Channels Kitchen（FCK）接單，並只提供中秋套餐及中秋單點。17:00至19:00暫不接受自動落單，其餘時段可直接落單。',
    updated_at = now()
where archived_at is null
  and name in ('中秋接單安排（19–20/9）', '中秋接單安排（25–27/9）');

commit;
