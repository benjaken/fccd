import type { OrderListEnhancementFilters, OrderListManualTodo } from "@/lib/order-list-enhancement";
import type { OrderStatusView } from "@/lib/order-statuses";
import type { OrderListItem } from "@/lib/orders";
import { Button } from "@/components/ui/button";
import { DatePicker } from "@/components/ui/date-picker";
import { DateRangePicker } from "@/components/ui/date-range-picker";
import { MultiSelect } from "@/components/ui/multi-select";
import { cn } from "@/lib/utils";
import { Ban, Copy, Pencil, Phone, Printer, ReceiptText, Truck } from "lucide-react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";

type BrandOption = { id: string; name: string };
type StatusOption = { legacyId: string; name: string };

export function OrderListFiltersPanel({
  filters,
  brands,
  statuses,
  onChange,
}: {
  filters: OrderListEnhancementFilters;
  brands: readonly BrandOption[];
  statuses: readonly StatusOption[];
  onChange: (next: OrderListEnhancementFilters) => void;
}) {
  const { t } = useTranslation();
  const set = (patch: Partial<OrderListEnhancementFilters>) =>
    onChange({ ...filters, ...patch });
  return (
    <>
      <DatePicker
        id="order-list-delivery-date"
        className="orders-status-filter"
        label={t("orders.enhancement.deliveryDate")}
        value={filters.deliveryDate ?? ""}
        onChange={(deliveryDate) =>
          set({ deliveryDate: deliveryDate || undefined, deliveryStart: undefined, deliveryEnd: undefined })
        }
      />
      <div className="orders-status-filter" aria-label={t("orders.enhancement.quickDates")}>
        <span>{t("orders.enhancement.quickDates")}</span>
        <div style={{ display: "flex", gap: "0.5rem", flexWrap: "nowrap" }}>
          <Button type="button" variant="outline" size="sm" onClick={() => set({ deliveryDate: todayInHongKong(), deliveryStart: undefined, deliveryEnd: undefined })}>{t("orders.enhancement.today")}</Button>
          <Button type="button" variant="outline" size="sm" onClick={() => {
            const start = todayInHongKong();
            set({ deliveryDate: undefined, deliveryStart: start, deliveryEnd: dateAfter(start, 29) });
          }}>{t("orders.enhancement.next30Days")}</Button>
        </div>
      </div>
      <DateRangePicker
        startId="order-list-delivery-start"
        endId="order-list-delivery-end"
        startValue={filters.deliveryStart ?? ""}
        endValue={filters.deliveryEnd ?? ""}
        onStartChange={(deliveryStart) => set({ deliveryDate: undefined, deliveryStart: deliveryStart || undefined })}
        onEndChange={(deliveryEnd) => set({ deliveryDate: undefined, deliveryEnd: deliveryEnd || undefined })}
        startLabel={t("orders.enhancement.from")}
        endLabel={t("orders.enhancement.to")}
        legend={t("orders.enhancement.deliveryDateRange")}
      />
      <label className="orders-status-filter">
        <span id="order-list-brand-filter-label">{t("orders.enhancement.brand")}</span>
        <MultiSelect
          id="order-list-brand-filter"
          labelledBy="order-list-brand-filter-label"
          options={[...brands]}
          value={filters.brandIds ?? []}
          onChange={(brandIds) => set({ brandIds })}
          placeholder={t("orders.enhancement.allBrandsPlaceholder", { defaultValue: t("orders.enhancement.allBrands") })}
          searchPlaceholder={t("orders.enhancement.searchBrands")}
          emptyLabel={t("orders.enhancement.noBrands")}
        />
      </label>
      <label className="orders-status-filter">
        <span id="order-list-tag-filter-label">{t("orders.enhancement.tags")}</span>
        <MultiSelect
          id="order-list-tag-filter"
          labelledBy="order-list-tag-filter-label"
          options={statuses.map((status) => ({ id: status.legacyId, name: status.name }))}
          value={filters.statusTagIds ?? []}
          onChange={(statusTagIds) => set({ statusTagIds })}
          placeholder={t("orders.enhancement.allTagsPlaceholder", { defaultValue: t("orders.enhancement.allTags") })}
          searchPlaceholder={t("orders.enhancement.searchTags")}
          emptyLabel={t("orders.enhancement.noTags")}
        />
      </label>
      <label className="orders-status-filter">
        <span>{t("orders.enhancement.holiday")}</span>
        <select disabled aria-label={t("orders.enhancement.holidayUnavailable")}><option>{t("orders.enhancement.noHolidayData")}</option></select>
      </label>
      <label className="orders-status-filter">
        <span>{t("orders.enhancement.region")}</span>
        <select disabled aria-label={t("orders.enhancement.regionUnavailable")}><option>{t("orders.enhancement.noRegionData")}</option></select>
      </label>
    </>
  );
}

export function OrderTagBadges({
  statuses,
  manualTodos,
}: {
  statuses: readonly (OrderStatusView & { tone?: "amber" | "blue" | "green" | "neutral" | "red" })[];
  manualTodos: readonly OrderListManualTodo[];
}) {
  const tags = [
    ...statuses.map((tag) => ({ label: tag.name, color: tag.color, tone: tag.tone ?? badgeTone(tag.name) })),
    ...manualTodos.map((todo) => ({ label: todo.label, color: null, tone: "neutral" as const })),
  ];
  return tags.length ? <div className="order-status-list">{tags.map((tag, index) => <span className={cn("status-badge", tag.tone)} style={tag.color ? { borderColor: tag.color } : undefined} key={`${tag.label}-${index}`}>{tag.label}</span>)}</div> : <span>—</span>;
}

function badgeTone(name: string): "amber" | "blue" | "green" {
  let value = 0;
  for (const character of name) value = (value + character.charCodeAt(0)) % 3;
  return (["amber", "blue", "green"] as const)[value]!;
}

export function OrderManualTodoControl({
  todos,
  disabled,
  onToggle,
}: {
  todos: readonly OrderListManualTodo[];
  disabled: boolean;
  onToggle: (key: string) => void;
}) {
  return <details><summary>Add to-do</summary><div>{[
    ["reschedule-pending", "Reschedule pending"], ["lwp", "LWP"], ["lbw", "LBW"], ["lfp", "LFP"], ["klook", "KLOOK"], ["alipay", "Alipay"], ["cancelled", "Cancelled"], ["monthly-settlement", "Monthly settlement"],
  ].map(([key, label]) => <button type="button" disabled={disabled} key={key} aria-pressed={todos.some((todo) => todo.key === key)} onClick={() => onToggle(key)}>{label}</button>)}</div></details>;
}

export type OrderPrintKind = "delivery-note" | "receipt" | "invoice";

export function safeTelephoneHref(phone: string | null | undefined) {
  const normalized = (phone ?? "").replace(/[^0-9+]/g, "");
  return /^\+?[0-9]{5,20}$/.test(normalized) ? `tel:${normalized}` : null;
}

export function OrderRowActionMenu({
  order,
  canCancel,
  onCancel,
  onPreview,
}: {
  order: OrderListItem;
  canCancel: boolean;
  onCancel: () => void;
  onPreview: (kind: OrderPrintKind) => void;
}) {
  const phoneHref = safeTelephoneHref(order.contactPhone);
  return (
    <div className="order-row-actions">
      <Link to={`/orders/${encodeURIComponent(order.id)}/edit`} aria-label="編輯" title="編輯"><Pencil /></Link>
      {phoneHref ? <a href={phoneHref} aria-label="溝通" title="溝通"><Phone /></a> : <span aria-label="溝通資料不可用" title="溝通資料不可用"><Phone /></span>}
      {canCancel ? <button type="button" onClick={onCancel} aria-label="取消訂單" title="取消訂單"><Ban /></button> : null}
      <button type="button" onClick={() => onPreview("delivery-note")} aria-label="送貨單" title="送貨單"><Truck /></button>
      <button type="button" onClick={() => onPreview("receipt")} aria-label="打印" title="打印"><Printer /></button>
      <button type="button" onClick={() => onPreview("invoice")} aria-label="發票" title="發票"><ReceiptText /></button>
      <Link to={`/orders/new?copyFrom=${encodeURIComponent(order.id)}`} aria-label="複製" title="複製"><Copy /></Link>
    </div>
  );
}

function todayInHongKong() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Hong_Kong", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
}

function dateAfter(date: string, days: number) {
  const [year, month, day] = date.split("-").map(Number);
  return new Date(Date.UTC(year, (month ?? 1) - 1, (day ?? 1) + days)).toISOString().slice(0, 10);
}
