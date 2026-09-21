begin;

-- Repair customer-service reply templates whose display_name/content were
-- stored with lost encoding ("?" or the U+FFFD replacement character) after an
-- earlier non-UTF-8 deploy. Only rows that still look corrupted are touched, so
-- operator-edited copy is preserved.

with canonical(template_key, display_name, content) as (
  values
    (
      'help',
      '歡迎訊息',
      '你好，我可以幫你查訂單、記低到會查詢，或者答公司已公布嘅問題（例如運費）。直接講你想問咩就得。'
    ),
    (
      'handoff',
      '轉人工',
      '唔好意思，呢單要同事跟進。我已經幫你交俾同事，稍後會有人回覆你。'
    ),
    (
      'collect_prompt',
      '收集到會資料',
      '你好。未搵到用呢個 WhatsApp 號碼嘅正式訂單。如果你想查到會，請話我知活動日期或者人數，同事會跟進。'
    ),
    (
      'collect_more',
      '補充到會資料',
      '收到。麻煩再提供活動日期或者人數其中一項，我就可以交俾同事跟進。'
    ),
    (
      'collect_done',
      '到會資料完成',
      '已經幫你記低，同事會跟進。唔使再喺 WhatsApp 補電郵。'
    ),
    (
      'no_faq',
      '找不到答案及客服跟進',
      '多謝你嘅查詢！暫時未有已公布資料可以回覆。我已經為你建立客服跟進；同事會喺下一個辦公時段處理。你可以繼續補充資料，我會加入同一個跟進事項。'
    ),
    (
      'refuse',
      '拒絕非客服問題',
      '唔好意思，我哋呢度只可以幫你查訂單、到會查詢，或者公司已公布嘅政策。如果需要其他協助，請等同事上線。'
    ),
    (
      'acknowledgement',
      '簡短確認訊息',
      '唔使客氣 😊 仲有咩可以幫到你？隨時同我哋講。'
    ),
    (
      'complaint_handoff',
      '產品投訴收集資料',
      '唔好意思出現呢個情況。請先保留產品，並傳送問題照片及訂單編號；我已幫你記錄，客服同事會跟進。'
    ),
    (
      'packaging_request',
      '外賣包裝用品請求',
      '可以先話我知需要邊款外賣盒／餐具、數量，同埋有冇相關訂單編號，我會按資料幫你跟進。'
    ),
    (
      'thanks',
      '感謝訊息',
      '唔使客氣 😊 仲有咩可以幫到你？隨時同我哋講。'
    )
)
update public.customer_service_reply_templates as r
set display_name = case
      when r.display_name ~ '[?]'
        or r.display_name like '%' || chr(65533) || '%'
      then c.display_name
      else r.display_name
    end,
    content = case
      when r.content ~ '[?]'
        or r.content like '%' || chr(65533) || '%'
      then c.content
      else r.content
    end,
    updated_at = now()
from canonical as c
where r.template_key = c.template_key
  and (
    r.display_name ~ '[?]'
    or r.display_name like '%' || chr(65533) || '%'
    or r.content ~ '[?]'
    or r.content like '%' || chr(65533) || '%'
  );

commit;
