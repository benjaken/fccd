begin;

update public.order_intake_rules
set customer_message = '中秋送貨繁忙，9月19至20日及25至27日只有 Food Channels Catering（FCC）及 Food Channels Kitchen（FCK）接單，並只提供中秋套餐及中秋單點。',
    internal_note = '2026 中秋期間只允許 FCC／FCK 的中秋套餐及中秋單點；產品及訂購連結由產品資料庫自動取得。',
    updated_at = now()
where archived_at is null
  and name in ('中秋接單安排（19–20/9）', '中秋接單安排（25–27/9）');

do $$
declare
  v_rule_id uuid;
  v_name text;
  v_starts_on date;
  v_ends_on date;
begin
  for v_name, v_starts_on, v_ends_on in
    select * from (values
      ('中秋繁忙時段（19–20/9 17:00–19:00）'::text, '2026-09-19'::date, '2026-09-20'::date),
      ('中秋繁忙時段（25–27/9 17:00–19:00）'::text, '2026-09-25'::date, '2026-09-27'::date)
    ) schedule(name, starts_on, ends_on)
  loop
    select id
    into v_rule_id
    from public.order_intake_rules
    where archived_at is null
      and name = v_name
    order by created_at
    limit 1;

    if v_rule_id is null then
      insert into public.order_intake_rules (
        name, starts_on, ends_on, start_time, end_time,
        handling, addon_handling, customer_message, internal_note, is_active
      ) values (
        v_name, v_starts_on, v_ends_on, '17:00', '19:00',
        'manual_review', 'manual_review',
        '中秋送貨繁忙，17:00至19:00暫不接受自動落單。該日只有 Food Channels Catering（FCC）及 Food Channels Kitchen（FCK）的中秋套餐或中秋單點可以訂購；如仍想查詢其他安排，請留下送貨日期、時間、地區、人數及預算，同事會再確認。',
        '2026 中秋繁忙日期的 17:00（含）至 19:00（不含）一律轉人工覆核，不直接拒絕客人。',
        true
      )
      returning id into v_rule_id;
    else
      update public.order_intake_rules
      set starts_on = v_starts_on,
          ends_on = v_ends_on,
          start_time = '17:00',
          end_time = '19:00',
          handling = 'manual_review',
          addon_handling = 'manual_review',
          customer_message = '中秋送貨繁忙，17:00至19:00暫不接受自動落單。該日只有 Food Channels Catering（FCC）及 Food Channels Kitchen（FCK）的中秋套餐或中秋單點可以訂購；如仍想查詢其他安排，請留下送貨日期、時間、地區、人數及預算，同事會再確認。',
          internal_note = '2026 中秋繁忙日期的 17:00（含）至 19:00（不含）一律轉人工覆核，不直接拒絕客人。',
          is_active = true,
          updated_at = now()
      where id = v_rule_id;
    end if;

    delete from public.order_intake_rule_channels where rule_id = v_rule_id;
    v_rule_id := null;
  end loop;
end;
$$;

commit;
