-- New catering customers normally have no order yet. Ask for useful enquiry
-- details without presenting the absence of an order as a problem.

update public.customer_service_reply_templates
set
  content = '可以，請話我知活動日期、人數，或者想了解嘅品牌／套餐／菜式，我會幫你查相關到會資料。',
  updated_at = now()
where template_key = 'collect_prompt';
