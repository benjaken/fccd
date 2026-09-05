begin;

-- Brand-specific menu knowledge. The bot maps the customer's brand wording to
-- these canonical FAQ questions, while all copy remains editable in the FAQ UI.
insert into public.customer_faqs (
  category, question, answer, keywords, locale, is_published, sort_order
)
values
  (
    'menu',
    'HK Lunch Box 有冇餐牌可以睇？',
    $faq$Hello 你好，可以上網站訂購
https://hklunchbox.com/collections/mealbox

- 我們公司有16年的餐飲經驗，依據ISO9001國際認證的服務流程

- 網站最低消費 $800，每款便當最少訂購5份

- 多元化飯盒款式，可按客人預算、膳食要求及活動場合訂制

若要定制活動飯盒，麻煩請在線上報價填寫資料😊：
https://www.emailmeform.com/builder/form/E9Wuer6Mw0aqat3NHfmd8

我們儘快報價給你🙏$faq$,
    'HK Lunch Box,hklunchbox,lunch box,lunchbox,飯盒,便當,便当,餐盒,mealbox,飯盒菜單,飯盒餐牌',
    'zh-HK', true, 220
  ),
  (
    'menu',
    'HK Party Food 有冇餐牌可以睇？',
    $faq$Hello 你好，HK Party Food 派對套餐及單點可以在網站直接查看及訂購：
全部餐牌：https://www.hkpartyfood.com/collections/all
商務派對套餐：https://www.hkpartyfood.com/collections/office-party-combos
商務一口小食：https://www.hkpartyfood.com/collections/canape-a-la-carte

如要按活動人數、預算或主題客製餐單，麻煩在線上報價填寫資料😊：
https://www.emailmeform.com/builder/form/E9Wuer6Mw0aqat3NHfmd8

我們會儘快報價給你🙏$faq$,
    'HK Party Food,party food,派對,派对,派對小食,派对小食,派對套餐,派对套餐,一口小食,canape,商務派對',
    'zh-HK', true, 221
  ),
  (
    'menu',
    'Food Channels Catering 有冇餐牌可以睇？',
    $faq$Hello 你好，Food Channels Catering 的中西式到會、套餐及單點餐牌可以在網站查看及訂購：
https://www.foodchannels-catering.com/

如要按活動日期、人數、地點、預算或膳食要求客製餐單，麻煩在線上報價填寫資料😊：
https://www.emailmeform.com/builder/form/E9Wuer6Mw0aqat3NHfmd8

我們會儘快報價給你🙏$faq$,
    'Food Channels Catering,Food Channel Catering,FC Catering,FCC,到會,到会,自助餐,中西式到會,套餐,單點',
    'zh-HK', true, 222
  ),
  (
    'menu',
    'Food Channels Express 有冇餐牌可以睇？',
    $faq$Hello 你好，Food Channels Express 的即日自選到會餐牌及供應情況可以在網站查看：
https://www.foodchannels-express.com/

網站顯示的款式、截單時間及當日供應情況為準。$faq$,
    'Food Channels Express,FC Express,Express,即日到會,即日到会,即日自選到會,即日餐牌',
    'zh-HK', true, 223
  ),
  (
    'menu',
    'Food Channels Kitchen 有冇餐牌可以睇？',
    $faq$Hello 你好，Food Channels Kitchen 的高級中式到會餐牌可以在網站查看：
https://foodchannels-kitchen.com/

如要按活動需要客製餐單，麻煩在線上報價填寫資料😊：
https://www.emailmeform.com/builder/form/E9Wuer6Mw0aqat3NHfmd8$faq$,
    'Food Channels Kitchen,FC Kitchen,高級中菜,高级中菜,高級中式到會,中菜到會',
    'zh-HK', true, 224
  ),
  (
    'menu',
    'Food Channels Cuisine 有冇餐牌可以睇？',
    $faq$Hello 你好，Food Channels Cuisine 的養生中菜到會餐牌可以在網站查看：
https://www.foodchannels-cuisine.com/

如有膳食或活動要求，可以在報價表提供資料😊：
https://www.emailmeform.com/builder/form/E9Wuer6Mw0aqat3NHfmd8$faq$,
    'Food Channels Cuisine,FC Cuisine,養生中菜,养生中菜,養生到會,中菜餐牌',
    'zh-HK', true, 225
  ),
  (
    'menu',
    '有冇餐牌可以睇？',
    $faq$可以。請問你想查看哪一個品牌的餐牌？

• Food Channels Catering（中西式到會、套餐及單點）
• HK Lunch Box（飯盒及便當）
• HK Party Food（派對套餐及一口小食）
• Food Channels Express（即日自選到會）
• Food Channels Kitchen（高級中式到會）
• Food Channels Cuisine（養生中菜到會）

你可以直接回覆品牌名稱或餐飲類型，例如「飯盒」、「派對小食」或「即日到會」，我會提供對應餐牌。$faq$,
    '餐牌,菜單,菜单,menu,睇餐牌,看菜單,索取餐牌,訂餐,落單,到會,飯盒,派對小食,品牌餐牌',
    'zh-HK', true, 226
  )
on conflict (locale, question) do update
set category = excluded.category,
    answer = excluded.answer,
    keywords = excluded.keywords,
    is_published = excluded.is_published,
    sort_order = excluded.sort_order,
    updated_at = now();

commit;
