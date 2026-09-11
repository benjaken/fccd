-- Same-day urgent reply should offer each brand's ordering site, not only Express.

update public.customer_service_reply_templates
set
  content = $tpl$你好。已收到你嘅即日／急單訂餐需求，我已經即時通知同事跟進。你亦可先喺對應品牌網站查看供應同落單：
• FC Express（即日到會）：https://www.foodchannels-express.com/
• Food Channels Catering（中西式到會）：https://foodchannels-catering.com/
• HK Lunch Box（飯盒及便當）：https://hklunchbox.com/
• HK Party Food（派對套餐及一口小食）：https://www.hkpartyfood.com/
未收到同事回覆前，系統唔可以保證當日一定做到；你可以繼續補充人數、時間、地址或想訂邊個品牌。$tpl$,
  updated_at = now()
where template_key = 'same_day_urgent';
