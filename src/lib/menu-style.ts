export type MenuStyle = "style-one" | "style-two";

export const DEFAULT_MENU_STYLE: MenuStyle = "style-one";
export const MENU_STYLE_CHANGED = "fccd:menu-style-changed";

function storageKey(userId?: string | null) {
  return `fccd:menu-style:${userId || "anonymous"}`;
}

export function readMenuStyle(userId?: string | null): MenuStyle {
  if (typeof window === "undefined") return DEFAULT_MENU_STYLE;
  const stored = window.localStorage.getItem(storageKey(userId));
  return stored === "style-two" ? "style-two" : DEFAULT_MENU_STYLE;
}

export function saveMenuStyle(style: MenuStyle, userId?: string | null) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(storageKey(userId), style);
  window.dispatchEvent(
    new CustomEvent<MenuStyle>(MENU_STYLE_CHANGED, { detail: style }),
  );
}

