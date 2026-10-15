import i18n from "@/i18n";

const zh = {
  retrySubmission: "未能確認提交結果，請按「提交」重試，毋須重新填寫。",
  decrease: "減少{{name}}數量", increase: "增加{{name}}數量", back: "返回飯盒列表", chooseQuantity: "選擇數量", add: "加入訂單",
  loadFailed: "未能載入活動飯盒，請重試。", retry: "重試", loading: "正在載入活動飯盒…",
  emptyTitle: "目前沒有可訂購的活動飯盒", emptyDescription: "暫時未有開放訂購的活動飯盒。", orderHistory: "查看訂單紀錄",
  notice: "訂購須知", cutoff: "截單時間：{{time}}（香港時間）", cutoffLabel: "截單時間", hongKongTime: "（香港時間）", confirm: "確認訂購資料", available: "可訂購的活動飯盒", selected: "已選 {{count}} 份", next: "下一步",
};
const en: Record<keyof typeof zh, string> = {
  retrySubmission: "Your submission could not be confirmed. Select Submit to retry without re-entering your details.",
  decrease: "Decrease {{name}} quantity", increase: "Increase {{name}} quantity", back: "Back to lunchboxes", chooseQuantity: "Choose quantity", add: "Add to order",
  loadFailed: "Unable to load lunchboxes. Please try again.", retry: "Retry", loading: "Loading lunchboxes…",
  emptyTitle: "No event lunchboxes available", emptyDescription: "There are no event lunchboxes open for ordering at the moment.", orderHistory: "View order history",
  notice: "Ordering information", cutoff: "Order by {{time}} (Hong Kong time)", cutoffLabel: "Order cutoff", hongKongTime: " (Hong Kong time)", confirm: "Confirm your order", available: "Available event lunchboxes", selected: "{{count}} selected", next: "Next",
};
i18n.addResourceBundle("zh-HK", "translation", { lunchbox: zh }, true, true);
i18n.addResourceBundle("en-GB", "translation", { lunchbox: en }, true, true);
