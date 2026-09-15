-- Brand-specific Mid-Autumn menu replies for the develop rollout.
begin;

insert into public.customer_faqs (
  category, question, answer, keywords, locale, is_published, sort_order
)
values
  (
    'menu',
    'Food Channels Catering 2026中秋餐牌',
    $faq$FCC👇🏻
【2026中秋套餐】
https://foodchannels-catering.com/collections/mid-autumn-combo

【2026中秋到會單點】
https://foodchannels-catering.com/collections/mid-autumn-a-la-carte

請留意：

- 9月19-20 及 25-27日 只提供中秋套餐及中秋單點

節日期間或有機會提早滿額截單，建議預早訂購😊$faq$,
    'FCC中秋,FCC中秋menu,Food Channels Catering中秋,中秋套餐,中秋單點',
    'zh-HK', true, 227
  ),
  (
    'menu',
    'Food Channels Kitchen 2026中秋餐牌',
    $faq$FCK👇🏻
【2026中秋套餐】
https://foodchannels-kitchen.com/collections/mid-autumn-private-kitchen

請留意：

- 9月19-20 及 25-27日 只提供中秋套餐

節日期間或有機會提早滿額截單，建議預早訂購😊$faq$,
    'FCK中秋,FCK中秋menu,Food Channels Kitchen中秋,桂花八月中秋,中秋套餐',
    'zh-HK', true, 228
  )
on conflict (locale, question) do update
set category = excluded.category,
    answer = excluded.answer,
    keywords = excluded.keywords,
    is_published = excluded.is_published,
    sort_order = excluded.sort_order,
    updated_at = now();

commit;
