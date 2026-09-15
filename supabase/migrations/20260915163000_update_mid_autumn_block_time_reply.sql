begin;

update public.order_intake_rules
set customer_message = $message$請幫忙填一填這份報價表格留一留資料俾我地☺️，我們同事會盡快回覆
https://www.emailmeform.com/builder/form/E9Wuer6Mw0aqat3NHfmd8$message$,
    internal_note = '2026 中秋繁忙日期的 17:00（含）至 19:00（不含）轉人工覆核，並請客人填寫網上報價表。',
    updated_at = now()
where archived_at is null
  and handling = 'manual_review'
  and start_time = '17:00'
  and end_time = '19:00'
  and name in (
    '中秋繁忙時段（19–20/9 17:00–19:00）',
    '中秋繁忙時段（25–27/9 17:00–19:00）'
  );

commit;
