begin;

-- Stable, customer-facing knowledge extracted from FCC Language - FAQ Logic v1.
-- Dynamic prices, operational decisions and human actions are deliberately kept
-- out of the published set below.
insert into public.customer_faqs (
  category, question, answer, keywords, locale, is_published, sort_order
)
values
  ('menu', 'Food Channels 有邊啲到會品牌？', 'Food Channels 旗下包括 FC Catering、桂花八月、FC Express、福滿樓、FC Delivery、HK Lunch Box 同 HK Party Food。不同品牌主打一般中西到會、高級中菜、即日到會、養生中菜、英文服務、飯盒及派對服務。', '品牌,FC Catering,桂花八月,Express,福滿樓,Delivery,Lunch Box,Party Food', 'zh-HK', true, 200),
  ('menu', '幾個到會品牌有咩分別？', 'FC Catering 主打價格親民嘅中西到會；桂花八月主打高級中菜；FC Express 主打快速即日到會；福滿樓主打養生中菜；FC Delivery 提供英文服務；HK Lunch Box 主打便當；HK Party Food 提供派對食品及一站式派對服務。', '品牌分別,中菜,西餐,即日,英文,便當,派對', 'zh-HK', true, 210),
  ('menu', '可唔可以度身訂造餐單？', '可以。我哋可以按活動人數、預算、場合同飲食要求協助設計餐單。請提供日期、人數、地點、預算同偏好，客服同事會跟進。', '訂製餐單,客製餐單,180人,預算,活動', 'zh-HK', true, 220),
  ('menu', '你哋餐牌有咩種類？', '餐牌包括中式菜式、西式菜式、派對小食、到會套餐、單點、便當同即日到會選擇；實際供應請以各品牌網站當日顯示為準。', '餐牌種類,中餐,西餐,小食,套餐,單點,便當', 'zh-HK', true, 230),
  ('menu', '有冇食物相片參考？', '有，品牌網站嘅餐牌會提供食物相片作參考。實際出餐外觀可能因食材、份量同擺放方式略有不同。', '食物相片,圖片,參考,food photo', 'zh-HK', true, 240),
  ('menu', '餐具份量點樣計？', '一般餐具會按訂購菜式及套餐標示嘅人數安排；一套餐具包約供 6 人使用。如果需要額外餐具，可以落單時加購或先向客服查詢。', '餐具數量,餐具包,6人,額外餐具,cutlery', 'zh-HK', true, 250),
  ('menu', '植物肉係用咩整？', '文件列明植物肉採用 Green Monday OMNI 素肉，主要配方係大豆同米。如有食物敏感或嚴格素食要求，落單前請再向客服確認成分。', '植物肉,OMNI,大豆,米,素肉,敏感', 'zh-HK', true, 260),
  ('menu', '乳豬係原隻送到嗎？', '乳豬會原隻出餐，並提供膠刀及膠手套；實際供應及配件以落單時確認為準。', '乳豬,原隻,膠刀,膠手套', 'zh-HK', true, 270),
  ('menu', '甜薯絲網卷係用咩整？', '甜薯絲網卷入面係甜薯，外層網皮係米網。', '甜薯絲網卷,甜薯,米網,成分', 'zh-HK', true, 280),
  ('menu', '餐盒會唔會標示菜式名稱？', '會，餐盒蓋一般會貼上菜式名稱，方便客人核對。', '餐盒,菜名,標籤,貼紙,核對', 'zh-HK', true, 290),
  ('menu', '因宗教原因唔食牛，套餐可以更換嗎？', '一般可以申請更換同等價值菜式，但要視乎所選套餐同廚房安排。請先提供套餐及想更換嘅菜式，由客服確認。', '宗教,唔食牛,更換菜式,套餐,飲食要求', 'zh-HK', true, 300),
  ('menu', '一斤叉燒大約有幾多片？', '文件提供嘅參考係一斤叉燒大約 50 片；實際數量會因每片厚薄及切法而有差異。', '叉燒,一斤,50片,份量', 'zh-HK', true, 310),
  ('menu', '食物係咪由你哋工場製作？', '係，我哋有自家工場製作到會食物，再按訂單安排出餐。', '自家工場,製作,廚房,食物來源', 'zh-HK', true, 320),
  ('menu', '啫喱糖兩磅大約夠幾多人？', '文件提供嘅參考係兩磅啫喱糖大約供 8 至 10 人享用；實際份量會視乎每人食量。', '啫喱糖,2磅,兩磅,8人,10人,份量', 'zh-HK', true, 330),
  ('menu', '高級飯盒便當可以做素食嗎？', '可以按人數、預算、膳食要求同活動場合查詢訂製素食飯盒。請提供需要數量及飲食要求，由客服跟進。', '飯盒,便當,素食盒,訂製,膳食要求', 'zh-HK', true, 340),
  ('menu', '泰式菠蘿炒飯辣唔辣？', '泰式菠蘿炒飯係唔辣嘅；如有其他味道或敏感要求，請喺落單時註明。', '泰式菠蘿炒飯,辣,不辣', 'zh-HK', true, 350),
  ('menu', '食物大約幾多盒一箱？', '一般大約 10 至 12 盒食物一箱；如果以細盒小食為主，可能約 14 盒一箱。實際箱數要按訂單內容確認。', '紙箱,食物盒,10盒,12盒,14盒,箱數', 'zh-HK', true, 360),
  ('menu', '豬手同牛肋骨會切開嗎？', '豬手同牛肋骨一般會切開先出餐，一份約供 8 人分享；實際切法及份量以產品說明為準。', '豬手,牛肋骨,切開,8人,份量', 'zh-HK', true, 370),
  ('menu', '壽桃包有幾大？', '蛋黃蓮蓉壽桃包只有一款尺寸，文件描述約拳頭大小。', '壽桃包,尺寸,拳頭大小,蛋黃蓮蓉', 'zh-HK', true, 380),
  ('menu', '壽桃包可以點樣保存？', '壽桃包一般會蒸熱出餐；如希望購買急凍版本，可以落單前向客服查詢。', '壽桃包,保存,急凍,蒸熱', 'zh-HK', true, 390),
  ('menu', '有冇軟餐或者碎餐？', '唔好意思，目前只可以協助將食物切細件，未能提供軟餐或碎餐。', '軟餐,碎餐,院舍,切細件', 'zh-HK', true, 400),
  ('menu', 'Pizza 會切幾多件？', 'Pizza 一般會切成 8 件；亦可以要求唔切，或者要求切成方形格仔或長條形。請落單時備註。', 'pizza,薄餅,8件,切法,方形,長條', 'zh-HK', true, 410),
  ('ordering', '可唔可以經 WhatsApp 落單？', '正式訂單建議喺網站完成：先登入或登記會員、揀菜式加入購物車、選送貨日期時間、填地址及交收方式，再完成付款。如操作遇到問題，可以喺 WhatsApp 逐步查詢。', 'WhatsApp落單,網上落單,購物車,結帳,訂購步驟', 'zh-HK', true, 420),
  ('ordering', '可唔可以提早預訂？', '可以，而且確定送餐日期後越早落單越好，因為每日出餐設有配額，熱門日期滿額後可能暫停接單。', '提早預訂,早啲落單,出餐配額,熱門日期', 'zh-HK', true, 430),
  ('ordering', '網站落單同 Foodpanda 有咩分別？', '直接喺品牌網站落單，一般會有較多套餐及單點選擇；Foodpanda 嘅供應及服務範圍以平台當日顯示為準。', 'Foodpanda,網站落單,套餐,單點,分別', 'zh-HK', true, 440),
  ('ordering', '想要報價要提供咩資料？', '請提供公司或客人名稱、聯絡方式、送貨地址、交收方式、送貨日期時間、人數、預算及想要嘅菜式類型；客服會按資料跟進。', '報價,公司名稱,地址,日期,時間,人數,預算,菜式', 'zh-HK', true, 450),
  ('ordering', '可以喺訂單加備註嗎？', '可以喺落單時填寫備註。如果已完成落單，亦可以將訂單號碼同需要補充嘅事項發俾客服，由同事確認。', '備註,客戶備註,訂單備註,補充資料', 'zh-HK', true, 460),
  ('delivery', '有冇送貨上門服務？', '有一般地區送貨上門服務；偏遠地區及機場地區未必適用。收費同可送範圍會按品牌及地址而定，落單前可以先提供地區查詢。', '送貨上門,偏遠地區,機場,地區,home delivery', 'zh-HK', true, 470),
  ('delivery', '地面交收同送貨上門有咩分別？', '地面交收係司機喺地址附近最接近可以免費停車嘅位置交收；送貨上門則涉及搬運到指定樓層或位置，收費及適用地區不同。', '地面交收,送貨上門,免費停車,搬運,分別', 'zh-HK', true, 480),
  ('delivery', '收貨時仲使唔使畀運費司機？', '如果訂單已經喺落單或付款時收取運費，收貨時一般唔需要再畀司機。實際付款狀態可以提供訂單號碼查詢。', '司機,運費,收貨付款,已付運費', 'zh-HK', true, 490),
  ('delivery', '地面交收會唔會送入屋或者課室？', '地面交收只會喺附近可免費停車位置交收，唔包括搬運入屋、上樓或送入課室。如果需要送到指定位置，請先查詢送貨上門安排。', '送入屋,課室,上樓,搬運,地面交收', 'zh-HK', true, 500),
  ('delivery', '收到食物後發現數量唔啱點算？', '請先按餐盒標籤同送貨單核對；如仍然發現送錯或漏送，請即時影相並將訂單號碼同相片發俾客服跟進。', '送漏,送錯,數量不符,核對,影相,送貨單', 'zh-HK', true, 510),
  ('delivery', '食物用咩包裝送到？', '到會食物一般以加厚鋁盒盛載，並按需要配合保溫物料運送；餐盒蓋會標示菜式名稱，方便核對。', '包裝,鋁盒,保溫,餐盒,菜名', 'zh-HK', true, 520),
  ('payment', '網上付款支援咩方式？', '網站支援 Visa、Mastercard、Alipay、WeChat Pay 等即時電子付款。其他付款方式或機構月結安排，需要先由客服確認。', 'Visa,Mastercard,Alipay,WeChat Pay,網上付款,信用卡', 'zh-HK', true, 530),
  ('membership', '忘記會員密碼點算？', '可以用登記會員時使用嘅電郵地址，在網站選擇重設密碼，再按電郵指示設定新密碼。', '忘記密碼,重設密碼,會員,電郵,login', 'zh-HK', true, 540),
  ('membership', '點樣修改會員個人資料？', '可以登入網站會員帳戶修改個人資料。如果要修改已落單訂單嘅送貨地址，請提供訂單號碼交由客服處理。', '修改個人資料,會員資料,配送地址,帳戶', 'zh-HK', true, 550),
  ('membership', 'Cash Dollar 有效期幾耐？', '文件列明 Cash Dollar 有效期為入帳日起一年；使用時要喺結帳頁確認已成功扣減後先付款。', 'Cash Dollar,購物積分,有效期,一年,扣減', 'zh-HK', true, 560),
  ('membership', '冇登記會員有冇生日甜品？', '生日禮遇只適用於會員，並按登記會員時填寫嘅生日月份安排；非會員訂單不會自動獲贈生日甜品。', '生日甜品,非會員,生日禮遇,會員', 'zh-HK', true, 570),
  ('membership', '最新優惠可以喺邊度睇？', '最新優惠請以 Food Channels Catering 網站優惠頁及結帳頁顯示為準，限時優惠或優惠碼可能會更改或失效。', '最新優惠,優惠頁,優惠碼,discount,promotion', 'zh-HK', true, 580),
  ('membership', '會員註冊網址係咩？', '可以到 https://foodchannels-catering.com/account/register 登記會員。完成登記後請使用同一電郵登入及落單。', '會員註冊,register,登記網址,帳戶', 'zh-HK', true, 590)
on conflict (locale, question) do nothing;

-- Correct the public self-service URL using the current playbook source.
update public.customer_faqs
set answer = '你好。收據同發票請用自助頁 https://cs.foodchannels-catering.com/self_service_search ，輸入落單電話同電郵就可以下載。如果搵唔到，同事可以再指引你。',
    keywords = '收據,發票,invoice,receipt,單據,自助下載',
    updated_at = now()
where locale = 'zh-HK' and question = '點攞收據或者發票？';

-- Dynamic, contradictory or operational knowledge remains in draft until an
-- editor confirms the current public policy.
insert into public.customer_faqs (
  category, question, answer, keywords, locale, is_published, sort_order
)
values
  ('payment', '各品牌最低消費係幾多？', '待營運確認：文件同時出現 HK$800 及 HK$1,500 等不同品牌最低消費，發布前要逐品牌核對網站。', '草稿,最低消費,800,1500,品牌', 'zh-HK', false, 1000),
  ('ordering', '各品牌要提早幾耐落單？', '待營運確認：文件有翌日、提前三日、下午三點截單及即日四小時等不同規則，發布前要逐品牌核對。', '草稿,截單時間,提前預訂,三日,翌日,即日', 'zh-HK', false, 1010),
  ('menu', '加熱爐具幾錢？', '待營運確認：文件記錄一次性加熱爐具約 HK$30，發布前要核對目前售價及供應。', '草稿,加熱爐,30,爐具', 'zh-HK', false, 1020),
  ('ordering', '已付款訂單可以修改幾多次？', '待營運確認：文件記錄每張到會訂單只可修改一次及須於送餐前通知，但現行期限要再確認。實際修改必須轉人工。', '草稿,修改一次,24小時,訂單修改', 'zh-HK', false, 1030),
  ('delivery', '可唔可以朝早十點半送貨？', '待營運確認：能否早於一般時段送貨要按人數、地區、廚房及車隊安排，必須由同事確認。', '草稿,早上送貨,10:30,特別時間', 'zh-HK', false, 1040),
  ('delivery', '每日送餐服務時間係幾點？', '待營運確認：文件同時出現 11:00、12:00 至 20:00 及品牌特別時段，發布前要按品牌核對。', '草稿,送餐時間,服務時間,11點,12點', 'zh-HK', false, 1050),
  ('menu', '可口可樂可唔可以轉無糖？', '待營運確認：文件舊記錄指未有無糖可樂，發布前要核對現時庫存及餐牌。', '草稿,可樂,無糖可樂,庫存', 'zh-HK', false, 1060),
  ('ordering', '三至四小時內急單做唔做到？', '待人工處理：急單要按品牌網站、當日配額、廚房及送貨安排即時確認，不可以由 FAQ 保證。', '草稿,急單,即日,三小時,四小時,廚房確認', 'zh-HK', false, 1070),
  ('payment', '公司可唔可以月結或者支票付款？', '待營運確認：文件記錄部分機構可憑蓋印及簽署發票申請送貨日起 30 日內付款，必須由同事審批。', '草稿,月結,支票,30日,發票,機構', 'zh-HK', false, 1080),
  ('ordering', '兩個品牌訂單可唔可以合併免運？', '待人工處理：跨品牌合併、最低消費及免運條件可能變動，需要按兩張訂單及送貨日期確認。', '草稿,合併訂單,跨品牌,免運,Catering,Kitchen', 'zh-HK', false, 1090),
  ('membership', '新會員首次落單有咩優惠？', '待營運確認：文件有新會員 Cash Dollar 記錄，但金額及適用品牌可能已更新，發布前要核對網站。', '草稿,新會員,首次落單,20,Cash Dollar', 'zh-HK', false, 1100),
  ('delivery', '各地區預計車程係幾耐？', '待營運確認：文件包含按平日、週末、節日及地區劃分嘅舊車程表，需要車隊確認後先可公開。', '草稿,車程,地區,週末,節日,送貨時間', 'zh-HK', false, 1110),
  ('menu', '火雞目前有冇供應？', '待營運確認：火雞屬季節性產品，重量、供應日期、配件及可取日期要以當期餐牌為準。', '草稿,火雞,季節,聖誕,供應', 'zh-HK', false, 1120),
  ('menu', '指定菜式或者配料可以更換嗎？', '待人工處理：飯盒、套餐及指定配料能否更換，要按同等價值、食材及廚房安排確認。', '草稿,更換菜式,配料,飯盒,廚房確認', 'zh-HK', false, 1130),
  ('delivery', '送貨遲到、送錯或者漏送會點處理？', '待人工處理：請提供訂單號碼、相片及實際情況，交由客服調查及決定補送、退款或其他處理。', '草稿,遲到,送錯,漏送,投訴,退款', 'zh-HK', false, 1140)
on conflict (locale, question) do nothing;

insert into public.customer_service_intents (
  intent_key, display_name, description, examples, action_key, enabled, priority, confidence_threshold
)
values
  ('kitchen_confirmation', '急單或廚房確認', '急單、即日特別安排、季節產品、菜式或配料更換，以及任何要由廚房確認能否製作的要求。必須通知真人，不能由模型承諾。', array['三個鐘後送貨做唔做到','呢款菜可唔可以轉配料','聽日有冇火雞','幫我問廚房做到嗎'], 'human_handoff', true, 25, 0.60),
  ('complaint_refund', '投訴或售後問題', '送貨遲到、送錯、漏送、食物質素、退款或其他售後投訴。收集訂單資料後通知真人處理，模型不得承諾退款金額。', array['送漏咗一盒','食物質素有問題','司機遲到','我要投訴同退款'], 'human_handoff', true, 15, 0.58)
on conflict (intent_key) do update set
  display_name = excluded.display_name,
  description = excluded.description,
  examples = excluded.examples,
  action_key = excluded.action_key,
  enabled = excluded.enabled,
  priority = excluded.priority,
  confidence_threshold = excluded.confidence_threshold,
  updated_at = now();

insert into public.customer_service_tool_permissions (intent_key, tool_key, allowed, requires_human)
values
  ('kitchen_confirmation', 'notify_internal', true, true),
  ('complaint_refund', 'notify_internal', true, true)
on conflict (intent_key, tool_key) do update set
  allowed = excluded.allowed,
  requires_human = excluded.requires_human;

update public.customer_service_intents
set examples = (
      select array_agg(example order by first_position)
      from (
        select example, min(position) as first_position
        from unnest(
          examples || array['幫我加單','想改送貨地址','想改送貨時間','張單可唔可以取消','想延期送貨']
        ) with ordinality as expanded(example, position)
        group by example
      ) as unique_examples
    ),
    updated_at = now()
where intent_key = 'handoff_order';

commit;
