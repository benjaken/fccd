type PilotCase = {
  name: string;
  messages: Array<{ role: "customer" | "assistant"; text: string }>;
  expectedIntent: "handoff_order" | "collect_inquiry";
  expectedDialogAction: string;
};

const orderChangeRequests = [
  "我想改送貨日期", "B-1555 改到星期五送", "可唔可以改送貨地址",
  "幫我更改送貨時間", "我想將自取改做送貨", "張單要改人數",
  "請幫我改聯絡人", "想修改訂單備註", "幫我取消張未送貨訂單", "想申請退款",
];

const cateringRequests = [
  "我想訂30人到會", "9月20日想訂餐", "想問公司午餐報價",
  "二十人食素有咩選擇", "下星期五要50人茶點", "想訂早餐",
  "有一萬蚊預算想搞到會", "想訂派對食物", "請幫我安排公司聚餐", "我想落單訂餐",
];

const cancellationReplies = [
  "嗰樣唔搞住", "當我冇講過", "都係照返原本", "唔使改喇", "撤回頭先要求",
  "先不要處理", "取消今次申請", "不用幫我改了", "算了", "停一停呢個事項",
];

const correctionReplies = [
  "我係想改期唔係取消張單", "唔係星期五，係星期六", "更正返係40人",
  "頭先講錯咗單號", "地址不變，只改時間", "唔係自取，要送貨",
  "預算係八千唔係八百", "我講緊另一張單", "日期應該係20號", "不是取消訂單，是取消修改",
];

const switchReplies = [
  "另外我想訂30人到會", "先幫我安排星期五午餐", "改單之前想先訂餐",
  "呢張單遲啲先，想問到會", "轉頭再改，我而家想訂早餐",
  "我有另一場活動想報價", "順便開一張新到會查詢", "先處理公司聚餐",
  "暫停改期，我要訂派對食物", "改單之外仲想訂茶點",
];

export const CUSTOMER_SERVICE_PILOT_CASES: PilotCase[] = [
  ...orderChangeRequests.map((text, index) => ({
    name: `order-change-${index + 1}`,
    messages: [{ role: "customer" as const, text }],
    expectedIntent: "handoff_order" as const,
    expectedDialogAction: "new_request",
  })),
  ...cateringRequests.map((text, index) => ({
    name: `catering-${index + 1}`,
    messages: [{ role: "customer" as const, text }],
    expectedIntent: "collect_inquiry" as const,
    expectedDialogAction: "new_request",
  })),
  ...cancellationReplies.map((text, index) => ({
    name: `cancel-active-${index + 1}`,
    messages: [
      { role: "customer" as const, text: "我想改 B-1555 送貨日期" },
      { role: "assistant" as const, text: "請選擇未送貨訂單" },
      { role: "customer" as const, text },
    ],
    expectedIntent: "handoff_order" as const,
    expectedDialogAction: "cancel_current",
  })),
  ...correctionReplies.map((text, index) => ({
    name: `correct-active-${index + 1}`,
    messages: [
      { role: "customer" as const, text: "我想取消 B-1555" },
      { role: "assistant" as const, text: "請確認要處理的要求" },
      { role: "customer" as const, text },
    ],
    expectedIntent: "handoff_order" as const,
    expectedDialogAction: "correct_previous",
  })),
  ...switchReplies.map((text, index) => ({
    name: `switch-to-catering-${index + 1}`,
    messages: [
      { role: "customer" as const, text: "我想改 B-1555 送貨日期" },
      { role: "assistant" as const, text: "請選擇未送貨訂單" },
      { role: "customer" as const, text },
    ],
    expectedIntent: "collect_inquiry" as const,
    expectedDialogAction: "switch_task",
  })),
];
