import i18n from "@/i18n";

i18n.addResourceBundle("zh-HK", "translation", { richTextImport: {
  open: "匯入 HTML", source: "HTML 原始碼", sourcePlaceholder: "在此貼上 HTML 原始碼",
  hint: "套用會取代目前內容；不支援的樣式及元素會被移除。套用後可預覽或復原，儲存頁面後才正式生效。",
  apply: "取代內容並預覽", cancel: "取消",
} }, true, true);
i18n.addResourceBundle("en-GB", "translation", { richTextImport: {
  open: "Import HTML", source: "HTML source", sourcePlaceholder: "Paste HTML source here",
  hint: "Applying replaces the current content and removes unsupported styles and elements. Preview or undo before saving the page to publish changes.",
  apply: "Replace and preview", cancel: "Cancel",
} }, true, true);
