-- Recognize the customer-facing 桂花八月 name in the Kitchen menu answer and
-- provide useful catering information before asking for enquiry details.

update public.customer_faqs
set
  answer = '桂花‧八月（Food Channels Kitchen）主打高級中菜到會，包括私房菜套餐、海鮮、燉湯、鍋物及小菜。最新餐牌、套餐、菜式及參考圖片可以喺網站查看：
https://foodchannels-kitchen.com/

如果你話我知活動日期、人數或者想問邊款菜式，我可以再幫你查相關資料。',
  keywords = concat_ws(
    ',',
    nullif(btrim(keywords), ''),
    '桂花八月,桂花‧八月'
  ),
  updated_at = now()
where locale = 'zh-HK'
  and question = 'Food Channels Kitchen 有冇餐牌可以睇？';
