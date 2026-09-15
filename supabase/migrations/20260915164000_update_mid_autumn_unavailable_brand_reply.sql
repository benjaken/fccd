begin;

update public.order_intake_rules
set customer_message = 'XXX 9月19-20 及 25-27日不接單',
    internal_note = '2026 中秋限定日期遇到未提供的品牌時，以 XXX 動態代入品牌名稱並直接說明不接單。',
    updated_at = now()
where archived_at is null
  and handling = 'allow_only'
  and name in (
    '中秋接單安排（19–20/9）',
    '中秋接單安排（25–27/9）'
  );

commit;
