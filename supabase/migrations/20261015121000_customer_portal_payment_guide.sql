-- Payment arrangement uses the same published HTML guide as About us.
-- The sidebar item links here, so this slug stays out of the generic guide list.

insert into public.customer_portal_guides (slug, title, body, sort_order)
values (
  'payment',
  '付款安排',
  $guide$<h2>截單時間</h2>
<ul>
<li>每天 3pm 前下單付款，翌日送貨（星期一至五，不包括公眾假期）</li>
<li>於假期及周末下的訂單，需要兩個工作天處理</li>
</ul>
<h2>送餐時間</h2>
<p>每天 10:00 am 至 8:00 pm</p>
<h2>自取時間</h2>
<p>每天 10:00 am 至 7:00 pm</p>
<h2>外賣到會運送收費</h2>
<h3>車邊交收</h3>
<p>在客人地址附近可免費停車的位置交收。</p>
<ul>
<li>免費送貨（不包括偏遠地區及機場地區）</li>
<li>新界區 HK$ 50</li>
<li>九龍區 HK$ 50</li>
<li>港島區 HK$ 100</li>
<li>偏遠地區 HK$ 180</li>
<li>機場地區 HK$ 250</li>
</ul>
<h3>送貨上門收費</h3>
<p>如需停泊收費停車場，停車場費由客戶直接支付予司機。</p>
<ul>
<li>新界區 HK$ 250</li>
<li>九龍區 HK$ 250</li>
<li>港島區 HK$ 350</li>
<li>偏遠地區及機場地區不提供</li>
</ul>
<p>訂餐未滿 HK$ 2,800 需按地區收取運費。訂購滿 HK$ 2,800 或以上可享車邊交收免費送貨，不包括偏遠地區及機場地區。</p>
<h3>偏遠地區（車邊交收）</h3>
<p>大口環、摩星嶺、赤柱、淺水灣、數碼港、貝沙灣、石澳、馬灣、東涌、迪士尼、機場、愉景灣、薄扶林、香港仔、鴨脷洲、黃竹坑</p>
<ul>
<li>送餐時間為每天 10:00 am 至 8:00 pm，可能會有半小時之差別。</li>
<li>車邊交收指在客人地址附近可免費停車的位置交收。</li>
<li>偏遠地區會不定期更新。</li>
<li>落單時請備註或提早通知送貨地點有樓梯，如要司機上落梯級需另收費用。</li>
<li>停車場費由客戶支付。</li>
<li>不提供離島及禁區送餐服務。東涌、愉景灣、機場地區除外。</li>
<li>馬灣、小蠔灣、博覽館、迪士尼及欣澳，送貨時間只限於上午 10 時至下午 4 時。</li>
</ul>
<h2>自取地址</h2>
<p>香港荃灣青山公路 459-469 號華力工業中心 5 字樓 R 室（近愉景新城，荃灣消防局旁）。泊車請由白田霸街入。</p>
<p>Room R, 5/F, Wah Lik Industrial Centre, 459-469 Castle Peak Road, Tsuen Wan, Hong Kong</p>
<p>電話：(+852) 2185 7373<br>WhatsApp：(+852) 5396 4335<br>傳真：(+852) 3020 9255<br>電郵：<a href="mailto:sales@foodchannels-catering.com">sales@foodchannels-catering.com</a></p>
<h2>付款方法</h2>
<h3>轉數快 FPS</h3>
<p>FPS ID：102938271（Food Channels Ltd.）</p>
<p>付款時請在「備註」填上訂單號碼，付款後請截圖付款記錄並 WhatsApp 到 5396 4335。</p>
<h3>銀行入賬</h3>
<p>戶口名稱：Food Channels Ltd.<br>匯豐銀行 HSBC：747-221000-838</p>
<p>付款後請截圖入數紙或付款記錄，並 WhatsApp 到 5396 4335。</p>
<h3>PayMe</h3>
<p>付款時請在「輸入你的訊息」填上訂單號碼，付款後請截圖付款記錄並 WhatsApp 到 5396 4335。</p>
<h3>八達通</h3>
<p>付款時請在「備註」填上訂單號碼，付款後請截圖付款記錄並 WhatsApp 到 5396 4335。</p>$guide$,
  8
)
on conflict (slug) do nothing;
