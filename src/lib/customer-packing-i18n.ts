import i18n from "@/i18n";

i18n.addResourceBundle("zh-HK", "translation", {
  packing: {
    from: "開始日期", to: "結束日期", range: "送貨日期範圍", print: "列印分裝清單",
    loading: "載入分裝清單…", loadFailed: "未能載入分裝清單，請重試。", retry: "重試",
    empty: "此期間沒有已送出的公司訂單。", deliveryPoint: "送貨點", noAddress: "未指定",
    member: "成員", department: "部門", items: "餐款", quantity: "份數", total: "總份數",
  },
}, true, true);

i18n.addResourceBundle("en", "translation", {
  packing: {
    from: "Start date", to: "End date", range: "Delivery date range", print: "Print packing list",
    loading: "Loading packing list…", loadFailed: "Could not load the packing list. Please retry.", retry: "Retry",
    empty: "No sent company orders in this period.", deliveryPoint: "Delivery point", noAddress: "Not set",
    member: "Member", department: "Department", items: "Meal", quantity: "Qty", total: "Total qty",
  },
}, true, true);
