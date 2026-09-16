-- Keep the automated FAQ fallback concise and actionable: it opens one
-- follow-up case, and later customer messages are appended to that case.
insert into public.customer_service_reply_templates (
  template_key, display_name, content, locale, enabled
)
values (
  'no_faq',
  '找不到答案及客服跟進',
  '多謝你嘅查詢！暫時未有已公布資料可以回覆。我已經為你建立客服跟進；同事會喺下一個辦公時段處理。你可以繼續補充資料，我會加入同一個跟進事項。',
  'zh-HK',
  true
)
on conflict (template_key) do update
set display_name = excluded.display_name,
    content = excluded.content,
    locale = excluded.locale,
    enabled = true,
    updated_at = now();

-- Broad delivery questions should land on one concise overview. Precise FAQ
-- rows remain in place for fee, ground-collection, weather, and order cases.
insert into public.customer_faqs (
  category, question, answer, keywords, locale, is_published, sort_order
)
values (
  'delivery',
  '送貨／運輸／交收方式有咩選擇？',
  $faq$你好。一般可選地面交收或送貨上門：

• 地面交收：司機會喺地址附近最近可免費停車位置交收；新界／九龍 HK$50、港島 HK$100、偏遠地區 HK$180、機場 HK$250。
• 送貨上門：新界／九龍 HK$250、港島 HK$350；偏遠地區及機場未必適用。
• 訂滿 HK$2800，地面交收免費（不包括偏遠地區及機場）。
• FC Express 即日到會只限地面交收，新界／九龍／港島一律 HK$200。

如你已經有訂單而要改送貨地址、查送達時間、處理送錯／送漏或惡劣天氣安排，請提供訂單號碼，由客服按個別訂單跟進。$faq$,
  '送貨,運輸,運送,配送,交收方式,送貨方式,地面交收,送貨上門,運費,shipping,delivery',
  'zh-HK',
  true,
  465
)
on conflict (locale, question) do update
set answer = excluded.answer,
    keywords = excluded.keywords,
    category = excluded.category,
    is_published = true,
    sort_order = excluded.sort_order,
    updated_at = now();
