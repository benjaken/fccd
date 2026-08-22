import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type Dispatch,
  type FormEvent,
  type SetStateAction,
} from "react";
import { CalendarDays, Check, CircleAlert, Eye, ImagePlus, Pencil, RefreshCw, Save, TriangleAlert, X } from "lucide-react";
import { useTranslation } from "react-i18next";

import { useCurrentPageAccess } from "@/auth/use-page-access";
import { Button } from "@/components/ui/button";
import { DatePicker } from "@/components/ui/date-picker";
import { DateRangePicker } from "@/components/ui/date-range-picker";
import { Modal } from "@/components/ui/modal";
import {
  emptyRestaurantDailySalesRecord,
  fetchRecentRestaurantDailySales,
  fetchRestaurantDailySales,
  fetchRestaurantDailySalesMasters,
  hongKongDateValue,
  pickDefaultRestaurant,
  RESTAURANT_WORKING_HOUR_OPTIONS,
  restaurantDailySalesRecordExists,
  saveRestaurantDailySales,
  type DailySalesOption,
  type RestaurantDailySalesRecord,
} from "@/lib/restaurant-daily-sales";
import { cn } from "@/lib/utils";

type TextValues = Record<string, string>;
type EditorMode = "none" | "existing" | "new";
type DateFilterMode = "single" | "multiple";
type ValidationKey = "total" | "departments" | "periods" | "receipt" | "balance";

function numberValue(value: string | undefined) {
  const parsed = Number(value ?? "");
  return Number.isFinite(parsed) ? parsed : 0;
}

function toTextValues(values: Record<string, number>) {
  return Object.fromEntries(
    Object.entries(values).map(([key, value]) => [key, value === 0 ? "" : String(value)]),
  );
}

function sumValues(values: TextValues) {
  return Object.values(values).reduce((sum, value) => sum + numberValue(value), 0);
}

function money(value: number) {
  return new Intl.NumberFormat("zh-HK", {
    style: "currency",
    currency: "HKD",
    minimumFractionDigits: 2,
  }).format(value).replace("HK$", "$");
}

function editedAtLabel(value: string | null | undefined, locale: string) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat(locale, {
    timeZone: "Asia/Hong_Kong",
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

function SalesFieldRows({
  options,
  values,
  onChange,
  placeholder,
  kind = "amount",
  allowSignedOther = false,
  disabled = false,
  readOnly = false,
}: {
  options: DailySalesOption[];
  values: TextValues;
  onChange: (id: string, value: string) => void;
  placeholder: string;
  kind?: "amount" | "quantity" | "hours";
  allowSignedOther?: boolean;
  disabled?: boolean;
  readOnly?: boolean;
}) {
  const { t } = useTranslation();
  return (
    <div className="daily-sales-fields">
      {options.map((option) => {
        const signed = allowSignedOther && /^其他(?:\s|（|\(|$)/.test(option.name.trim());
        const rawValue = values[option.id] ?? "";
        const negative = rawValue.startsWith("-");
        const displayName = signed && !option.name.includes("如沒有")
          ? `${option.name} ${t("restaurantDailySales.otherZeroHint")}`
          : option.name;
        const absoluteValue = rawValue.replace(/^-/, "");
        return (
        <div key={option.id} className={cn("daily-sales-field-row", signed && !readOnly && "has-signed-other")}>
          <div className="daily-sales-field-label">
            <span>{displayName}</span>
          </div>
          {signed && !readOnly ? (
            <select
              className="daily-sales-sign-select"
              aria-label={`${displayName} ${t("restaurantDailySales.sign")}`}
              value={negative ? "subtract" : "add"}
              onChange={(event) => {
                onChange(option.id, event.target.value === "subtract" ? `-${absoluteValue || "0"}` : absoluteValue);
              }}
              disabled={disabled}
            >
              <option value="add">{t("restaurantDailySales.add")}</option>
              <option value="subtract">{t("restaurantDailySales.subtract")}</option>
            </select>
          ) : null}
          {readOnly ? (
            <output className="daily-sales-read-value" aria-label={`${displayName} ${t(`restaurantDailySales.fields.${kind}`)}`}>
              {kind === "amount" ? money(numberValue(values[option.id])) : values[option.id]?.trim() || "—"}
            </output>
          ) : (
            <div className="daily-sales-number-wrap">
              {kind === "amount" ? <span aria-hidden="true">$</span> : null}
              <input
                type="number"
                inputMode="decimal"
                step={kind === "quantity" ? "1" : "0.01"}
                min={kind === "quantity" || kind === "hours" ? "0" : undefined}
                value={rawValue}
                onChange={(event) => onChange(option.id, event.target.value)}
                placeholder={placeholder}
                aria-label={`${displayName} ${t(`restaurantDailySales.fields.${kind}`)}`}
                disabled={disabled}
              />
            </div>
          )}
        </div>
      )})}
    </div>
  );
}

function ReconciliationBadge({ label, total, expected }: { label: string; total: number; expected: number }) {
  const matched = Math.abs(total - expected) < 0.01;
  return (
    <div className={cn("daily-sales-reconcile", matched ? "is-matched" : "is-mismatched")}>
      {matched ? <Check aria-hidden="true" /> : <CircleAlert aria-hidden="true" />}
      <span>{label}</span>
      <strong>{money(total)}</strong>
    </div>
  );
}

function DailySalesLoadingCard({ rows, receipt = false, className }: { rows: number; receipt?: boolean; className?: string }) {
  return (
    <section className={cn("panel daily-sales-loading-card", className)}>
      <header><span className="page-skeleton-bone daily-sales-loading-index" /><span className="page-skeleton-bone daily-sales-loading-title" /></header>
      {receipt ? (
        <div className="daily-sales-loading-receipt">
          <span className="page-skeleton-bone daily-sales-loading-photo" />
          <span className="page-skeleton-bone daily-sales-loading-toggle" />
          <span className="page-skeleton-bone daily-sales-loading-button" />
        </div>
      ) : (
        <div className="daily-sales-loading-rows">
          {Array.from({ length: rows }, (_, index) => <div key={index}><span className="page-skeleton-bone" /><span className="page-skeleton-bone" /></div>)}
        </div>
      )}
    </section>
  );
}

function DailySalesEditorSkeleton({ label }: { label: string }) {
  return (
    <div className="daily-sales-loading" aria-busy="true">
      <span className="sr-only" role="status">{label}</span>
      <div className="daily-sales-grid" aria-hidden="true">
        <DailySalesLoadingCard rows={10} className="daily-sales-card-payments" />
        <div className="daily-sales-stack"><DailySalesLoadingCard rows={4} /><DailySalesLoadingCard rows={5} /></div>
        <div className="daily-sales-stack"><DailySalesLoadingCard rows={6} /><DailySalesLoadingCard rows={3} /></div>
        <DailySalesLoadingCard rows={0} receipt />
      </div>
      <section className="panel daily-sales-footer daily-sales-loading-footer" aria-hidden="true">
        <div className="daily-sales-reconciliation">{Array.from({ length: 3 }, (_, index) => <span key={index} className="page-skeleton-bone" />)}</div>
        <div className="daily-sales-cash-summary">{Array.from({ length: 3 }, (_, index) => <span key={index} className="page-skeleton-bone" />)}</div>
        <span className="page-skeleton-bone daily-sales-loading-remarks" />
      </section>
    </div>
  );
}

function DailySalesSummarySkeleton() {
  return (
    <section className="panel daily-sales-summary daily-sales-loading-summary" aria-hidden="true">
      <div><span className="page-skeleton-bone" /><span className="page-skeleton-bone" /></div>
      <div><span className="page-skeleton-bone" /><span className="page-skeleton-bone" /></div>
    </section>
  );
}

function RestaurantDailySalesPageSkeleton({ label }: { label: string }) {
  return (
    <section className="restaurant-daily-sales-page daily-sales-page-loading" aria-busy="true">
      <span className="sr-only" role="status">{label}</span>
      <header className="page-heading daily-sales-heading" aria-hidden="true">
        <div className="daily-sales-loading-heading-copy">
          <span className="page-skeleton-bone" />
          <span className="page-skeleton-bone" />
          <span className="page-skeleton-bone" />
        </div>
        <span className="page-skeleton-bone daily-sales-loading-heading-action" />
      </header>
      <section className="panel daily-sales-toolbar daily-sales-loading-toolbar" aria-hidden="true">
        <div><span className="page-skeleton-bone" /><div><span className="page-skeleton-bone" /><span className="page-skeleton-bone" /></div></div>
        <div><span className="page-skeleton-bone" /><span className="page-skeleton-bone" /></div>
      </section>
      <div className="daily-sales-workspace">
        <aside className="panel daily-sales-history daily-sales-loading-history" aria-hidden="true">
          <div><span className="page-skeleton-bone" /><span className="page-skeleton-bone" /></div>
          <div>{Array.from({ length: 8 }, (_, index) => <span key={index} className="page-skeleton-bone" />)}</div>
        </aside>
        <main className="daily-sales-editor">
          <section className="panel daily-sales-editor-empty daily-sales-loading-empty" aria-hidden="true">
            <span className="page-skeleton-bone daily-sales-loading-empty-icon" />
            <span className="page-skeleton-bone daily-sales-loading-empty-title" />
            <span className="page-skeleton-bone daily-sales-loading-empty-copy" />
          </section>
        </main>
      </div>
    </section>
  );
}

export function RestaurantDailySalesPage({
  loadMasters = fetchRestaurantDailySalesMasters,
  loadSales = fetchRestaurantDailySales,
  loadRecent = fetchRecentRestaurantDailySales,
  checkRecordExists = restaurantDailySalesRecordExists,
  saveSales = saveRestaurantDailySales,
  canEdit: canEditOverride,
}: {
  loadMasters?: typeof fetchRestaurantDailySalesMasters;
  loadSales?: typeof fetchRestaurantDailySales;
  loadRecent?: typeof fetchRecentRestaurantDailySales;
  checkRecordExists?: typeof restaurantDailySalesRecordExists;
  saveSales?: typeof saveRestaurantDailySales;
  canEdit?: boolean;
}) {
  const { t, i18n } = useTranslation();
  const access = useCurrentPageAccess();
  const canEdit = canEditOverride ?? access.canAccess("restaurant.daily_sales.edit");
  const [masters, setMasters] = useState<Awaited<ReturnType<typeof loadMasters>> | null>(null);
  const [restaurantId, setRestaurantId] = useState("");
  const [date, setDate] = useState(() => hongKongDateValue());
  const [dateFilterMode, setDateFilterMode] = useState<DateFilterMode>("multiple");
  const [singleFilterDate, setSingleFilterDate] = useState("");
  const [filterStartDate, setFilterStartDate] = useState("");
  const [filterEndDate, setFilterEndDate] = useState("");
  const [editorMode, setEditorMode] = useState<EditorMode>("none");
  const [editingExisting, setEditingExisting] = useState(false);
  const [newDialogOpen, setNewDialogOpen] = useState(false);
  const [receiptZoomOpen, setReceiptZoomOpen] = useState(false);
  const [draftRestaurantId, setDraftRestaurantId] = useState("");
  const [draftDate, setDraftDate] = useState(() => hongKongDateValue());
  const [checkingNewRecord, setCheckingNewRecord] = useState(false);
  const [newRecordExists, setNewRecordExists] = useState(false);
  const [newRecordCheckError, setNewRecordCheckError] = useState(false);
  const [total, setTotal] = useState("");
  const [paymentAmounts, setPaymentAmounts] = useState<TextValues>({});
  const [platformAmounts, setPlatformAmounts] = useState<TextValues>({});
  const [departmentAmounts, setDepartmentAmounts] = useState<TextValues>({});
  const [periodAmounts, setPeriodAmounts] = useState<TextValues>({});
  const [productQuantities, setProductQuantities] = useState<TextValues>({});
  const [workingHours, setWorkingHours] = useState<TextValues>({});
  const [realCashCountAmount, setRealCashCountAmount] = useState("");
  const [pettyCashAmount, setPettyCashAmount] = useState("");
  const [remarks, setRemarks] = useState("");
  const [receiptPath, setReceiptPath] = useState<string | null>(null);
  const [receiptUrl, setReceiptUrl] = useState<string | null>(null);
  const [receiptFile, setReceiptFile] = useState<File | null>(null);
  const [receiptPreview, setReceiptPreview] = useState<string | null>(null);
  const [recent, setRecent] = useState<Awaited<ReturnType<typeof loadRecent>>>([]);
  const [loadingMasters, setLoadingMasters] = useState(true);
  const [loadingRecent, setLoadingRecent] = useState(true);
  const [loadingRecord, setLoadingRecord] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [validationErrors, setValidationErrors] = useState<ValidationKey[]>([]);
  const [validationNoticeErrors, setValidationNoticeErrors] = useState<ValidationKey[]>([]);
  const skipNextExistingLoadRef = useRef(false);
  const recentFromDate = dateFilterMode === "single" ? singleFilterDate : filterStartDate;
  const recentToDate = dateFilterMode === "single" ? singleFilterDate : filterEndDate;
  const isEditing = editorMode === "new" || (editorMode === "existing" && editingExisting);
  const canModify = canEdit && isEditing;

  const applyRecord = (record: RestaurantDailySalesRecord) => {
    setTotal(record.total ? String(record.total) : "");
    setPaymentAmounts(toTextValues(record.paymentAmounts));
    setPlatformAmounts(toTextValues(record.platformAmounts));
    setDepartmentAmounts(toTextValues(record.departmentAmounts));
    setPeriodAmounts(toTextValues(record.periodAmounts));
    setProductQuantities(toTextValues(record.productQuantities));
    setWorkingHours(toTextValues(record.workingHours));
    setRealCashCountAmount(record.realCashCountAmount ? String(record.realCashCountAmount) : "");
    setPettyCashAmount(record.pettyCashAmount ? String(record.pettyCashAmount) : "");
    setRemarks(record.remarks);
    setReceiptPath(record.receiptPath);
    setReceiptUrl(record.receiptUrl);
    setReceiptFile(null);
    setValidationErrors([]);
  };

  useEffect(() => {
    if (!receiptFile) {
      setReceiptPreview(receiptUrl);
      return;
    }
    const objectUrl = URL.createObjectURL(receiptFile);
    setReceiptPreview(objectUrl);
    return () => URL.revokeObjectURL(objectUrl);
  }, [receiptFile, receiptUrl]);

  useEffect(() => {
    if (!validationNoticeErrors.length && !saveError) return;
    const timeout = window.setTimeout(() => {
      setValidationNoticeErrors([]);
      setSaveError(null);
    }, 5000);
    return () => window.clearTimeout(timeout);
  }, [saveError, validationNoticeErrors]);

  useEffect(() => {
    let active = true;
    setLoadingMasters(true);
    setLoadError(null);
    void loadMasters()
      .then((next) => {
        if (!active) return;
        setMasters(next);
        setRestaurantId((current) => current || pickDefaultRestaurant(next.restaurants)?.id || "");
      })
      .catch((error: unknown) => {
        if (active) setLoadError(error instanceof Error ? error.message : "load_failed");
      })
      .finally(() => {
        if (active) setLoadingMasters(false);
      });
    return () => { active = false; };
  }, [loadMasters]);

  useEffect(() => {
    if (!restaurantId) return;
    let active = true;
    setLoadError(null);
    setLoadingRecent(true);
    void loadRecent(restaurantId, recentFromDate || undefined, recentToDate || undefined)
      .then((recentRows) => {
        if (!active) return;
        setRecent(recentRows);
      })
      .catch((error: unknown) => {
        if (!active) return;
        setRecent([]);
        setLoadError(error instanceof Error ? error.message : "load_failed");
      })
      .finally(() => {
        if (active) setLoadingRecent(false);
      });
    return () => { active = false; };
  }, [loadRecent, recentFromDate, recentToDate, restaurantId]);

  useEffect(() => {
    if (!restaurantId || !date || editorMode !== "existing") return;
    if (skipNextExistingLoadRef.current) {
      skipNextExistingLoadRef.current = false;
      return;
    }
    let active = true;
    setEditingExisting(false);
    setLoadingRecord(true);
    setLoadError(null);
    setSaved(false);
    void loadSales(restaurantId, date)
      .then((record) => {
        if (active) applyRecord(record);
      })
      .catch((error: unknown) => {
        if (!active) return;
        applyRecord(emptyRestaurantDailySalesRecord());
        setLoadError(error instanceof Error ? error.message : "load_failed");
      })
      .finally(() => {
        if (active) setLoadingRecord(false);
      });
    return () => { active = false; };
  }, [date, editorMode, loadSales, restaurantId]);

  useEffect(() => {
    if (!newDialogOpen || !draftRestaurantId || !draftDate) {
      setNewRecordExists(false);
      setNewRecordCheckError(false);
      return;
    }
    let active = true;
    setCheckingNewRecord(true);
    setNewRecordCheckError(false);
    void checkRecordExists(draftRestaurantId, draftDate)
      .then((exists) => {
        if (active) setNewRecordExists(exists);
      })
      .catch(() => {
        if (!active) return;
        setNewRecordExists(false);
        setNewRecordCheckError(true);
      })
      .finally(() => {
        if (active) setCheckingNewRecord(false);
      });
    return () => { active = false; };
  }, [checkRecordExists, draftDate, draftRestaurantId, newDialogOpen]);

  const expectedTotal = numberValue(total);
  const paymentTotal = sumValues(paymentAmounts) + sumValues(platformAmounts);
  const departmentTotal = sumValues(departmentAmounts);
  const periodTotal = sumValues(periodAmounts);
  const workingHoursTotal = sumValues(workingHours);
  const bankDepositAmount = numberValue(realCashCountAmount) - numberValue(pettyCashAmount);
  const sectionTotals = [
    masters?.paymentMethods.length || masters?.deliveryPlatforms.length ? paymentTotal : expectedTotal,
    masters?.departments.length ? departmentTotal : expectedTotal,
    masters?.servicePeriods.length ? periodTotal : expectedTotal,
  ];
  const balanced = expectedTotal > 0 && sectionTotals.every((value) => Math.abs(value - expectedTotal) < 0.01);
  const selectedRestaurant = masters?.restaurants.find((restaurant) => restaurant.id === restaurantId) ?? null;
  const workingHourOptions = useMemo(() => {
    const knownIds = new Set(RESTAURANT_WORKING_HOUR_OPTIONS.map((option) => option.id));
    const extras = Object.keys(workingHours)
      .filter((id) => !knownIds.has(id))
      .map((id, index) => ({ id, name: id, sortOrder: RESTAURANT_WORKING_HOUR_OPTIONS.length + index }));
    return [...RESTAURANT_WORKING_HOUR_OPTIONS, ...extras];
  }, [workingHours]);
  const selectedDateLabel = useMemo(() => {
    if (!date) return "";
    return new Intl.DateTimeFormat(i18n.language, { year: "numeric", month: "long", day: "numeric", weekday: "short" })
      .format(new Date(`${date}T12:00:00+08:00`));
  }, [date, i18n.language]);

  const update = (setter: Dispatch<SetStateAction<TextValues>>, id: string, value: string) => {
    setter((current) => ({ ...current, [id]: value }));
    setSaved(false);
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setSaveError(null);
    const nextValidationErrors: ValidationKey[] = [];
    if (!total.trim()) nextValidationErrors.push("total");
    if ((masters?.departments.length ?? 0) > 0 && !Object.values(departmentAmounts).some((value) => value.trim() !== "")) nextValidationErrors.push("departments");
    if ((masters?.servicePeriods.length ?? 0) > 0 && !Object.values(periodAmounts).some((value) => value.trim() !== "")) nextValidationErrors.push("periods");
    if (!receiptFile && !receiptPath) nextValidationErrors.push("receipt");
    if (!nextValidationErrors.length && !balanced && expectedTotal > 0) nextValidationErrors.push("balance");
    setValidationErrors(nextValidationErrors);
    setValidationNoticeErrors(nextValidationErrors);
    if (!restaurantId || !date || nextValidationErrors.length || !canModify) return;
    setSaving(true);
    setSaved(false);
    try {
      await saveSales({
        restaurantId,
        date,
        total: expectedTotal,
        paymentAmounts: Object.fromEntries(Object.entries(paymentAmounts).map(([id, value]) => [id, numberValue(value)])),
        platformAmounts: Object.fromEntries(Object.entries(platformAmounts).map(([id, value]) => [id, numberValue(value)])),
        departmentAmounts: Object.fromEntries(Object.entries(departmentAmounts).map(([id, value]) => [id, numberValue(value)])),
        periodAmounts: Object.fromEntries(Object.entries(periodAmounts).map(([id, value]) => [id, numberValue(value)])),
        productQuantities: Object.fromEntries(Object.entries(productQuantities).map(([id, value]) => [id, numberValue(value)])),
        workingHours: Object.fromEntries(Object.entries(workingHours).map(([id, value]) => [id, numberValue(value)])),
        realCashCountAmount: numberValue(realCashCountAmount),
        pettyCashAmount: numberValue(pettyCashAmount),
        remarks,
        receiptPath,
        receiptUrl,
        receiptFile,
      });
      setSaved(true);
      setValidationNoticeErrors([]);
      if (editorMode === "new") skipNextExistingLoadRef.current = true;
      setEditorMode("existing");
      setEditingExisting(false);
      setRecent(await loadRecent(restaurantId, recentFromDate || undefined, recentToDate || undefined));
    } catch (error) {
      setValidationNoticeErrors([]);
      setSaveError(error instanceof Error ? error.message : "save_failed");
    } finally {
      setSaving(false);
    }
  };

  if (loadingMasters) return <RestaurantDailySalesPageSkeleton label={t("restaurantDailySales.loading")} />;

  return (
    <section className="restaurant-daily-sales-page">
      <header className="page-heading daily-sales-heading">
        <div>
          <span className="eyebrow">{t("navigation.restaurant")}</span>
          <h1>{t("restaurantDailySales.title")}</h1>
          <p>{t("restaurantDailySales.description")}</p>
        </div>
        <Button
          variant="outline"
          onClick={() => {
            setDraftRestaurantId(restaurantId || pickDefaultRestaurant(masters?.restaurants ?? [])?.id || "");
            setDraftDate(hongKongDateValue());
            setNewDialogOpen(true);
          }}
        >
          <CalendarDays />
          {t("restaurantDailySales.newRecord")}
        </Button>
      </header>

      {validationNoticeErrors.length || saveError ? (
        <aside className="daily-sales-validation-notification" role="alert" aria-live="assertive">
          <CircleAlert aria-hidden="true" />
          <div>
            <strong>{t(validationNoticeErrors.length ? "restaurantDailySales.validationNoticeTitle" : "restaurantDailySales.saveErrorTitle")}</strong>
            {validationNoticeErrors.length
              ? validationNoticeErrors.map((key) => <span key={key}>{t(`restaurantDailySales.validation.${key}`)}</span>)
              : <span>{saveError === "save_failed" ? t("restaurantDailySales.saveError") : saveError}</span>}
          </div>
          <button type="button" aria-label={t("common.close")} onClick={() => { setValidationNoticeErrors([]); setSaveError(null); }}><X /></button>
        </aside>
      ) : null}

      <section className="panel daily-sales-toolbar" aria-label={t("restaurantDailySales.restaurantPicker")}>
        <div>
          <span className="daily-sales-toolbar-label">{t("restaurantDailySales.restaurantPicker")}</span>
          <div className="daily-sales-restaurant-pills">
            {masters?.restaurants.map((restaurant) => (
              <button
                type="button"
                key={restaurant.id}
                className={cn(restaurant.id === restaurantId && "active")}
                aria-pressed={restaurant.id === restaurantId}
                onClick={() => {
                  setRestaurantId(restaurant.id);
                  setEditingExisting(false);
                  setEditorMode("none");
                  applyRecord(emptyRestaurantDailySalesRecord());
                }}
              >
                {restaurant.name}
              </button>
            ))}
          </div>
        </div>
        <div className="daily-sales-record-filter">
          <label className="daily-sales-filter-mode">
            <span>{t("restaurantDailySales.filterMode")}</span>
            <select aria-label={t("restaurantDailySales.filterMode")} value={dateFilterMode} onChange={(event) => { setDateFilterMode(event.target.value as DateFilterMode); setEditingExisting(false); setEditorMode("none"); applyRecord(emptyRestaurantDailySalesRecord()); }}>
              <option value="single">{t("restaurantDailySales.singleDay")}</option>
              <option value="multiple">{t("restaurantDailySales.multipleDays")}</option>
            </select>
          </label>
          {dateFilterMode === "single" ? (
            <DatePicker
              id="daily-sales-filter-date"
              className="daily-sales-date-picker"
              label={t("restaurantDailySales.filterDate")}
              value={singleFilterDate}
              onChange={(value) => { setSingleFilterDate(value); setEditingExisting(false); setEditorMode("none"); applyRecord(emptyRestaurantDailySalesRecord()); }}
            />
          ) : (
            <DateRangePicker
              className="daily-sales-date-range-picker"
              startId="daily-sales-filter-start"
              endId="daily-sales-filter-end"
              startValue={filterStartDate}
              endValue={filterEndDate}
              onStartChange={(value) => { setFilterStartDate(value); setEditingExisting(false); setEditorMode("none"); applyRecord(emptyRestaurantDailySalesRecord()); }}
              onEndChange={(value) => { setFilterEndDate(value); setEditingExisting(false); setEditorMode("none"); applyRecord(emptyRestaurantDailySalesRecord()); }}
              startLabel={t("restaurantDailySales.startDate")}
              endLabel={t("restaurantDailySales.endDate")}
              legend={t("restaurantDailySales.dateRange")}
            />
          )}
        </div>
      </section>

      {loadError ? (
        <div className="daily-sales-message is-error" role="alert">
          <RefreshCw />
          <span>{t("restaurantDailySales.loadError")}</span>
        </div>
      ) : null}

      <form onSubmit={submit} className="daily-sales-workspace">
        <aside className="panel daily-sales-history">
          <div className="daily-sales-history-title">
            <span>{t("restaurantDailySales.recent")}</span>
            <strong>{selectedRestaurant?.name}</strong>
          </div>
          <div className="daily-sales-history-list">
            {loadingRecent ? <p>{t("restaurantDailySales.loadingRecent")}</p> : recent.length ? recent.map((item) => (
              <button
                type="button"
                key={item.date}
                className={cn(editorMode === "existing" && item.date === date && "active")}
                onClick={() => { setEditingExisting(false); setDate(item.date); setEditorMode("existing"); }}
              >
                <span className="daily-sales-history-date">
                  {item.date}
                  {item.hasMismatch ? <TriangleAlert aria-label={t("restaurantDailySales.recordMismatch")} /> : null}
                </span>
                <strong>{money(item.total)}</strong>
                {item.editedAt ? <small>{t("restaurantDailySales.lastEditedAt")}: {editedAtLabel(item.editedAt, i18n.language)}</small> : null}
              </button>
            )) : <p>{t("restaurantDailySales.noRecent")}</p>}
          </div>
        </aside>

        {editorMode === "none" ? (
          <main className="daily-sales-editor">
            <section className="panel daily-sales-editor-empty">
              <CalendarDays aria-hidden="true" />
              <h2>{t("restaurantDailySales.emptyEditorTitle")}</h2>
              <p>{t("restaurantDailySales.emptyEditorDescription")}</p>
            </section>
          </main>
        ) : <main className="daily-sales-editor">
          {loadingRecord ? <DailySalesSummarySkeleton /> : <section className="panel daily-sales-summary">
            <div>
              <span>{selectedRestaurant?.name}</span>
              <h2>{selectedDateLabel}</h2>
            </div>
            <label>
              <span className="daily-sales-total-heading">
                <span>{t("restaurantDailySales.total")}</span>
                <small className="daily-sales-total-help">{t("restaurantDailySales.totalMatchHelp")}</small>
              </span>
              {isEditing ? (
                <div className={cn("daily-sales-total-input", validationErrors.includes("total") && "is-invalid")}><span>$</span><input aria-label={t("restaurantDailySales.total")} aria-invalid={validationErrors.includes("total")} type="number" min="0" step="0.01" value={total} onChange={(event) => { setTotal(event.target.value); setSaved(false); setValidationErrors((current) => current.filter((key) => key !== "total")); }} placeholder={t("restaurantDailySales.totalPlaceholder")} disabled={!canModify} /></div>
              ) : <output className="daily-sales-total-read-value" aria-label={t("restaurantDailySales.total")}>{money(expectedTotal)}</output>}
            </label>
          </section>}

          {loadingRecord ? <DailySalesEditorSkeleton label={t("restaurantDailySales.loadingRecord")} /> : (
            <div className="daily-sales-grid">
              <section className="panel daily-sales-card daily-sales-card-payments">
                <header><div><span>01</span><h3>{t("restaurantDailySales.sections.payments")}</h3></div><strong>{money(paymentTotal)}</strong></header>
                <SalesFieldRows options={masters?.paymentMethods ?? []} values={paymentAmounts} onChange={(id, value) => update(setPaymentAmounts, id, value)} placeholder={t("restaurantDailySales.amountPlaceholder")} disabled={!canModify} readOnly={!isEditing} />
                {(masters?.deliveryPlatforms.length ?? 0) > 0 ? <><h4>{t("restaurantDailySales.sections.platforms")}</h4><SalesFieldRows options={masters?.deliveryPlatforms ?? []} values={platformAmounts} onChange={(id, value) => update(setPlatformAmounts, id, value)} placeholder={t("restaurantDailySales.amountPlaceholder")} disabled={!canModify} readOnly={!isEditing} /></> : null}
              </section>

              <div className="daily-sales-stack">
                <section className={cn("panel daily-sales-card", validationErrors.includes("departments") && "is-invalid")}>
                  <header><div><span>02</span><h3>{t("restaurantDailySales.sections.departments")}</h3></div><strong>{money(departmentTotal)}</strong></header>
                  <SalesFieldRows options={masters?.departments ?? []} values={departmentAmounts} onChange={(id, value) => { update(setDepartmentAmounts, id, value); setValidationErrors((current) => current.filter((key) => key !== "departments")); }} placeholder={t("restaurantDailySales.amountPlaceholder")} allowSignedOther disabled={!canModify} readOnly={!isEditing} />
                </section>
                <section className={cn("panel daily-sales-card", validationErrors.includes("periods") && "is-invalid")}>
                  <header><div><span>03</span><h3>{t("restaurantDailySales.sections.periods")}</h3></div><strong>{money(periodTotal)}</strong></header>
                  <SalesFieldRows options={masters?.servicePeriods ?? []} values={periodAmounts} onChange={(id, value) => { update(setPeriodAmounts, id, value); setValidationErrors((current) => current.filter((key) => key !== "periods")); }} placeholder={t("restaurantDailySales.amountPlaceholder")} allowSignedOther disabled={!canModify} readOnly={!isEditing} />
                </section>
              </div>

              <div className="daily-sales-stack">
                <section className="panel daily-sales-card">
                  <header><div><span>04</span><h3>{t("restaurantDailySales.sections.products")}</h3></div></header>
                  <SalesFieldRows options={masters?.newProducts ?? []} values={productQuantities} onChange={(id, value) => update(setProductQuantities, id, value)} placeholder={t("restaurantDailySales.quantityPlaceholder")} kind="quantity" disabled={!canModify} readOnly={!isEditing} />
                </section>
                <section className="panel daily-sales-card daily-sales-hours">
                  <header><div><span>05</span><h3>{t("restaurantDailySales.sections.hours")}</h3></div></header>
                  <SalesFieldRows options={workingHourOptions} values={workingHours} onChange={(id, value) => update(setWorkingHours, id, value)} placeholder={t("restaurantDailySales.hoursPlaceholder")} kind="hours" disabled={!canModify} readOnly={!isEditing} />
                  <div className="daily-sales-hours-total"><span>{t("restaurantDailySales.hoursTotal")}</span><strong>{workingHoursTotal.toFixed(2)}</strong></div>
                </section>
              </div>
              <section className={cn("panel daily-sales-card daily-sales-receipt", validationErrors.includes("receipt") && "is-invalid")}>
                <header><div><span>06</span><h3>{t("restaurantDailySales.sections.receipt")}</h3></div></header>
                {receiptPreview ? (
                  <button type="button" className="daily-sales-receipt-preview-button" onClick={() => setReceiptZoomOpen(true)} aria-label={t("restaurantDailySales.enlargeReceipt")}>
                    <img src={receiptPreview} alt={t("restaurantDailySales.receiptPreview")} />
                  </button>
                ) : isEditing ? (
                  <label className="daily-sales-receipt-upload">
                    <input
                      className="sr-only"
                      type="file"
                      accept="image/jpeg,image/png,image/webp"
                      disabled={!canModify}
                      onChange={(event) => {
                        setReceiptFile(event.target.files?.[0] ?? null);
                        setSaved(false);
                        setValidationErrors((current) => current.filter((key) => key !== "receipt"));
                      }}
                    />
                    <span><ImagePlus />{t("restaurantDailySales.uploadReceipt")}</span>
                  </label>
                ) : <div className="daily-sales-receipt-empty">{t("restaurantDailySales.noReceipt")}</div>}
                {receiptPreview && canModify ? <button type="button" className="daily-sales-remove-receipt" onClick={() => { setReceiptZoomOpen(false); setReceiptFile(null); setReceiptPath(null); setReceiptUrl(null); setReceiptPreview(null); }}><X />{t("restaurantDailySales.removeReceipt")}</button> : null}
                {editorMode === "existing" ? (
                  <div className={cn("daily-sales-mode-actions", editingExisting && "is-editing")} role="group" aria-label={t("restaurantDailySales.recordMode")}>
                    <button type="button" className={cn(!editingExisting && "active")} aria-pressed={!editingExisting} onClick={() => { setEditingExisting(false); setValidationErrors([]); setSaveError(null); }}><Eye />{t("restaurantDailySales.view")}</button>
                    <button type="button" className={cn(editingExisting && "active")} aria-pressed={editingExisting} disabled={!canEdit} onClick={() => setEditingExisting(true)}><Pencil />{t("restaurantDailySales.edit")}</button>
                  </div>
                ) : null}
                {isEditing ? (
                  <div className="daily-sales-receipt-save">
                    <Button type="submit" disabled={!canModify || saving || loadingRecord}><Save />{saving ? t("restaurantDailySales.saving") : t("restaurantDailySales.save")}</Button>
                  </div>
                ) : null}
              </section>
            </div>
          )}

          {!loadingRecord ? <section className="panel daily-sales-footer">
            <div className="daily-sales-reconciliation">
              <ReconciliationBadge label={t("restaurantDailySales.reconcile.payments")} total={paymentTotal} expected={expectedTotal} />
              <ReconciliationBadge label={t("restaurantDailySales.reconcile.departments")} total={departmentTotal} expected={expectedTotal} />
              <ReconciliationBadge label={t("restaurantDailySales.reconcile.periods")} total={periodTotal} expected={expectedTotal} />
            </div>
            <section className="daily-sales-cash-summary" aria-label={t("restaurantDailySales.cashSummary")}>
              <label><span>{t("restaurantDailySales.realCashCount")}</span>{isEditing ? <div className="daily-sales-number-wrap"><span>$</span><input aria-label={t("restaurantDailySales.realCashCount")} type="number" min="0" step="0.01" value={realCashCountAmount} onChange={(event) => { setRealCashCountAmount(event.target.value); setSaved(false); }} placeholder={t("restaurantDailySales.amountPlaceholder")} disabled={!canModify} /></div> : <output className="daily-sales-cash-read-value" aria-label={t("restaurantDailySales.realCashCount")}>{money(numberValue(realCashCountAmount))}</output>}</label>
              <label><span>{t("restaurantDailySales.pettyCashTaken")}</span>{isEditing ? <div className="daily-sales-number-wrap"><span>$</span><input aria-label={t("restaurantDailySales.pettyCashTaken")} type="number" min="0" step="0.01" value={pettyCashAmount} onChange={(event) => { setPettyCashAmount(event.target.value); setSaved(false); }} placeholder={t("restaurantDailySales.amountPlaceholder")} disabled={!canModify} /></div> : <output className="daily-sales-cash-read-value" aria-label={t("restaurantDailySales.pettyCashTaken")}>{money(numberValue(pettyCashAmount))}</output>}</label>
              <div className="daily-sales-bank-deposit"><span>{t("restaurantDailySales.bankDeposit")}</span><strong>{money(bankDepositAmount)}</strong></div>
            </section>
            <label className="daily-sales-remarks"><span>{t("restaurantDailySales.differenceReason")}</span>{isEditing ? <textarea aria-label={t("restaurantDailySales.differenceReason")} value={remarks} onChange={(event) => setRemarks(event.target.value)} rows={2} disabled={!canModify} /> : <output className="daily-sales-remarks-read-value" aria-label={t("restaurantDailySales.differenceReason")}>{remarks}</output>}</label>
            <div className="daily-sales-actions">
              {saved ? <span className="is-success"><Check />{t("restaurantDailySales.saved")}</span> : null}
              {!balanced && expectedTotal > 0 && !validationErrors.includes("balance") ? <span>{t("restaurantDailySales.notBalanced")}</span> : null}
            </div>
          </section> : null}
        </main>}
      </form>

      <Modal
        open={newDialogOpen}
        title={t("restaurantDailySales.newModalTitle")}
        description={t("restaurantDailySales.newModalDescription")}
        closeLabel={t("common.close")}
        onClose={() => setNewDialogOpen(false)}
        size="sm"
        className="daily-sales-new-modal"
        footer={<><Button variant="outline" onClick={() => setNewDialogOpen(false)}>{t("common.cancel")}</Button><Button disabled={!draftRestaurantId || !draftDate || checkingNewRecord || newRecordExists || newRecordCheckError} onClick={() => { setRestaurantId(draftRestaurantId); setDate(draftDate); setEditingExisting(false); applyRecord(emptyRestaurantDailySalesRecord()); setEditorMode("new"); setNewDialogOpen(false); }}>{t("restaurantDailySales.startInput")}</Button></>}
      >
        <div className="daily-sales-new-form">
          <label><span>{t("restaurantDailySales.restaurantPicker")}</span><select aria-label={t("restaurantDailySales.restaurantPicker")} value={draftRestaurantId} onChange={(event) => setDraftRestaurantId(event.target.value)}>{masters?.restaurants.map((restaurant) => <option value={restaurant.id} key={restaurant.id}>{restaurant.name}</option>)}</select></label>
          <label><span>{t("restaurantDailySales.date")}</span><input aria-label={t("restaurantDailySales.date")} type="date" value={draftDate} max={hongKongDateValue()} onChange={(event) => setDraftDate(event.target.value)} /></label>
          {checkingNewRecord ? <p>{t("restaurantDailySales.checkingDate")}</p> : newRecordExists ? <p className="is-error" role="alert">{t("restaurantDailySales.recordExists")}</p> : newRecordCheckError ? <p className="is-error" role="alert">{t("restaurantDailySales.checkDateError")}</p> : null}
        </div>
      </Modal>

      <Modal
        open={receiptZoomOpen && Boolean(receiptPreview)}
        title={t("restaurantDailySales.receiptPreview")}
        closeLabel={t("common.close")}
        onClose={() => setReceiptZoomOpen(false)}
        size="lg"
        className="daily-sales-receipt-modal"
      >
        {receiptPreview ? <img src={receiptPreview} alt={t("restaurantDailySales.receiptPreview")} /> : null}
      </Modal>
    </section>
  );
}
