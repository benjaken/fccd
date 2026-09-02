/**
 * Keep in sync with src/lib/wati-templates.ts.
 * implemented: false means the public send API accepts the key but
 * returns template_not_wired until params are captured from Bubble.
 */
export const WATI_TEMPLATE_CATALOG = [
  {
    key: "driver_assign_reminder",
    watiName: "driver_assign_reminder",
    implemented: true,
  },
  {
    key: "customer_first_reminder",
    watiName: null,
    implemented: false,
  },
  {
    key: "customer_second_reminder",
    watiName: null,
    implemented: false,
  },
  {
    key: "assign_driver",
    watiName: null,
    implemented: false,
  },
  {
    key: "zap_wati",
    watiName: null,
    implemented: false,
  },
] as const;

export type WatiTemplateKey = (typeof WATI_TEMPLATE_CATALOG)[number]["key"];

export function watiTemplateByKey(key: string) {
  return WATI_TEMPLATE_CATALOG.find((item) => item.key === key) ?? null;
}
