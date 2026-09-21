-- 非辦公時間回覆文案：明確講明依家係非辦公時間、回覆可能延遲、同事會於辦公時間跟進。
--
-- 只覆寫 no_faq（搵唔到已公布資料）同 handoff（轉人工）兩個 zh-HK 模板；
-- 其他模板及語系不變。實際回覆仍以此表內容為準。
begin;
set local search_path = public, extensions, pg_temp;

update public.customer_service_reply_templates
set content = '多謝你嘅查詢！依家係非辦公時間，暫時未有同事可以即時回覆。我已經為你建立客服跟進；回覆可能會有延遲，同事會喺辦公時間（上午 9 點後）跟進。你可以繼續補充資料，我會加入同一個跟進事項。',
    updated_at = now()
where template_key = 'no_faq' and locale = 'zh-HK';

update public.customer_service_reply_templates
set content = '唔好意思，呢個問題需要同事處理。依家係非辦公時間，回覆可能會有延遲；我已經幫你記錄，客服會喺辦公時間（上午 9 點後）跟進。你可以繼續補充資料。',
    updated_at = now()
where template_key = 'handoff' and locale = 'zh-HK';

commit;
