import type { EnquiryFormDefinition, EnquiryQuestion } from "@/lib/enquiry-form";

function input(
  fieldKey: string,
  title: string,
  required: boolean,
  extra: Partial<EnquiryQuestion> = {},
): EnquiryQuestion {
  return { fieldKey, type: "input", title, required, inputFormat: "general", ...extra };
}

function radio(
  fieldKey: string,
  title: string,
  required: boolean,
  options: string[],
  extra: Partial<EnquiryQuestion> = {},
): EnquiryQuestion {
  return {
    fieldKey,
    type: "radio",
    title,
    required,
    options: options.map((label) => ({ label, value: label })),
    ...extra,
  };
}

function checkbox(
  fieldKey: string,
  title: string,
  required: boolean,
  options: string[],
  extra: Partial<EnquiryQuestion> = {},
): EnquiryQuestion {
  return {
    fieldKey,
    type: "checkbox",
    title,
    required,
    options: options.map((label) => ({ label, value: label })),
    ...extra,
  };
}

export const CATERING_ENQUIRY_SEED_QUESTIONS: EnquiryQuestion[] = [
  input("name", "姓名", true, { quoteField: "customer_name" }),
  radio("salutation", "稱謂", true, ["先生", "小姐", "女士", "太太"], {
    quoteField: "salutation",
  }),
  input("company", "公司/機構名稱", false, { quoteField: "company_name" }),
  input("phone", "聯絡電話", true, {
    quoteField: "phone",
    inputFormat: "phone",
  }),
  input("email", "電郵地址", true, {
    quoteField: "email",
    inputFormat: "email",
  }),
  input("address", "送貨地址", true, { quoteField: "shipping_address" }),
  checkbox(
    "catering_style",
    "有興趣了解的到會形式（可選多於一項）",
    true,
    [
      "正餐 到會  (大盤)",
      "小食 到會 (大盤)",
      "經濟飯盒 (正餐)",
      "高級飯盒 (正餐)",
      "下午茶餐盒",
      "水果餐盒",
    ],
  ),
  checkbox(
    "event_nature",
    "活動性質（可選多於一項）",
    false,
    [
      "朋友聚會",
      "公司開幕禮",
      "產品發佈會",
      "雞尾酒會",
      "生日會",
      "私人聚會",
      "工作坊",
      "公司慶祝",
      "商務訂餐",
      "NGO院舍",
      "學校團購",
      "展會送餐",
      "拍攝片場",
      "地盤工地",
    ],
  ),
  checkbox(
    "event_audience",
    "活動對象（可選多於一項）",
    false,
    [
      "同事",
      "管理層",
      "客戶",
      "重要客戶",
      "朋友",
      "同學",
      "院友",
      "老師",
      "外藉人士",
      "其他對象",
    ],
  ),
  checkbox(
    "event_venue",
    "你預計的活動地點（可選多於一項）",
    false,
    [
      "自己公司 Company Room",
      "餐廳 Restaurant",
      "院舍內 Inside Building",
      "學校 School",
      "酒店 Hotels",
      "戶外場地 Outdoor",
      "其他場地 Others",
    ],
  ),
  {
    fieldKey: "headcount",
    type: "number",
    title: "預算活動人數",
    required: true,
    quoteField: "headcount",
    minNumber: 1,
    maxNumber: 10000,
  },
  input("event_date", "預算活動日期", true, {
    quoteField: "delivery_date",
    hint: "指定日期 / 預算月份均可",
  }),
  checkbox(
    "order_frequency",
    "活動訂餐頻率",
    false,
    [
      "單次活動 Single Event",
      "連續幾天活動 a Few Days",
      "持續需要 Continous",
      "不定時需要 Not Regular",
      "未知 Not yet decided",
    ],
  ),
  checkbox(
    "cuisine",
    "菜式 (可選多於一項)",
    false,
    [
      "中餐 Chinese",
      "西餐 Western",
      "港式 HK Style",
      "節慶 Festival",
      "日式 Japanese",
      "東南亞 Asian",
      "素食 Vegetarian",
      "軟餐/糊餐/碎餐 Minced",
      "清真  Halal",
      "無所謂 Any",
      "其他要求 Others",
    ],
  ),
  radio(
    "event_time",
    "預算活動時段",
    true,
    [
      "平日早上(大約10-11am)",
      "平日中午(大約11-2pm)",
      "平日下午(大約2-5pm)",
      "平日晚上(大約5-7pm)",
      "平日晚上(大約7-9pm)",
      "周未早上(大約10-11am)",
      "周未中午(大約11-2pm)",
      "周未下午(大約2-5pm)",
      "周未晚上(大約5-7pm)",
      "周未晚上(大約7-9pm)",
      "未決定/想查詢特定時間",
    ],
    { quoteField: "delivery_time" },
  ),
  radio(
    "delivery_area",
    "送餐地區及方式（訂滿$2800可免地面交收運費）",
    true,
    [
      "新界區/九龍區 地面車邊交收 (+$50)",
      "港島區 地面車邊交收 (+$100)",
      "免費地面車邊交收送貨 (訂滿$2800)",
      "新界區/九龍區 送貨上門 (+$250)",
      "港島區 送貨上門 (+$350)",
      "侍應+食物一齊到場 ($1200/4小時)",
      "未確定送貨方式",
    ],
  ),
  checkbox(
    "manpower",
    "參與人手（可選多於一項）",
    false,
    [
      "自有人手 Self Manpower",
      "侍應到場 Waiter on Site",
      "活動助理 Helper",
      "流程主任 Rundown Supervisor",
      "現場司儀 MC",
      "遊戲節目主持 Game Host",
      "不定時需要 Not Regular",
      "未知 Not yet decided",
    ],
  ),
  checkbox(
    "event_planning",
    "活動策劃（可選多於一項）",
    false,
    [
      "自行安排 Self Arrangement",
      "影相背景牆  Backdrop",
      "現場佈置裝飾 Decoration",
      "博客或媒體到場 Blogger  & Media",
      "活動場地選擇 Venue Advice",
      "專業品酒師 Sommelier",
      "VIP禮品 (+logo) Premium",
      "派對魔術表演 Party Magic Show",
      "現場扭氣球 Balloon Twisting",
      "面部 / 身體彩繪 Artist",
      "不需要",
    ],
  ),
  checkbox(
    "utensils",
    "環保餐具",
    true,
    [
      "必須要環保餐具",
      "外表優先, 可用塑膠",
      "現場侍應服務, 用正式餐具",
      "無所謂, 兩款都可以",
    ],
  ),
  radio(
    "payment",
    "付款方式",
    false,
    [
      "在送餐前以銀行轉帳",
      "在送餐前用信用卡付款 (+3%手續費)",
      "需要分期付款，先付6成按金確認訂單，尾數在送餐當日付款",
      "需要其他方法，請與客服聯絡",
      "未確定",
    ],
  ),
  radio(
    "budget_flex",
    "預算的彈性",
    false,
    [
      "初步想法, 未有確定",
      "必須 預算範圍內",
      "活動性質關係, 越平越好!",
      "食品質素最重要, 可要更好建議",
      "價錢佔70%以上評分 + 平衡產品品質",
      "私人活動, 預算有彈性",
    ],
  ),
  input("budget", "初步食物到會預算 (人均/總計)（方便出報價）", true, {
    hint: "Budget Idea 預算範圍 eg. $15000-20000",
  }),
  {
    fieldKey: "remarks",
    type: "textarea",
    title: "特別需要或留言",
    required: false,
    quoteField: "quote_description",
  },
  {
    fieldKey: "terms",
    type: "checkbox",
    title: "了解條款及政策",
    required: true,
    requireAllOptions: true,
    options: [
      {
        label: "謹此聲明活動內所有參與的人士都年滿 18 歲或以上",
        value: "謹此聲明活動內所有參與的人士都年滿 18 歲或以上",
        defaultChecked: true,
      },
      {
        label:
          "本人確認已經細閱、明白及同意網上購物條款及細則及私隱政策，及個人資料的收集及使用",
        value:
          "本人確認已經細閱、明白及同意網上購物條款及細則及私隱政策，及個人資料的收集及使用",
        defaultChecked: true,
      },
    ],
  },
];

export const CATERING_ENQUIRY_SEED_FORM: Omit<EnquiryFormDefinition, "id"> = {
  internalName: "FC Catering Enquiry",
  publicTitle: "FC Catering + Lunch Box 餐飲到會+活動策劃網上查詢",
  publicDescription:
    "榮獲ISO 9001食品到會 及 香港Q嘜優質服務認證 (since 2009)",
  submitLabel: "Submit",
  slug: "quote-inquiry",
  isDefault: true,
  status: "published",
  successMessage: "我們已收到你的查詢，稍後會有專人回覆。",
  ackEmailSubject: "我們已收到你的查詢",
  ackEmailBody: "",
  asanaProjectGid: "",
  questions: CATERING_ENQUIRY_SEED_QUESTIONS,
};

export const CATERING_ENQUIRY_SEED_FORM_ID = "11111111-1111-4111-8111-111111111111";
