begin;

update public.customer_faqs
set answer = '可以，以下餐牌可直接查看及落單：
• Food Channels Catering（中西式到會、套餐及單點）：https://foodchannels-catering.com/
• HK Lunch Box（飯盒及便當）：https://hklunchbox.com/
• HK Party Food（派對套餐及一口小食）：https://www.hkpartyfood.com/

如果你話我知活動日期、人數、地點同預算，我亦可以幫你揀合適餐牌。',
    keywords = '餐牌,菜單,菜单,menu,睇餐牌,看菜單,索取餐牌,訂餐,落單,到會,飯盒,派對小食',
    updated_at = now()
where locale = 'zh-HK'
  and question = '你哋餐牌有咩種類？';

insert into public.customer_faqs (
  category,
  question,
  answer,
  keywords,
  locale,
  is_published,
  sort_order
)
values (
  'menu',
  '有冇餐牌可以睇？',
  '可以，以下餐牌可直接查看及落單：
• Food Channels Catering（中西式到會、套餐及單點）：https://foodchannels-catering.com/
• HK Lunch Box（飯盒及便當）：https://hklunchbox.com/
• HK Party Food（派對套餐及一口小食）：https://www.hkpartyfood.com/

如果你話我知活動日期、人數、地點同預算，我亦可以幫你揀合適餐牌。',
  '餐牌,菜單,菜单,menu,睇餐牌,看菜單,索取餐牌,訂餐,落單,到會,飯盒,派對小食',
  'zh-HK',
  true,
  225
)
on conflict (locale, question) do update
set answer = excluded.answer,
    keywords = excluded.keywords,
    is_published = true,
    sort_order = excluded.sort_order,
    updated_at = now();

commit;
