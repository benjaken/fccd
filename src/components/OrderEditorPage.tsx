import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import {
  ArrowLeft,
  Check,
  CircleCheckBig,
  ChevronDown,
  ChevronUp,
  CircleAlert,
  CreditCard,
  FileText,
  LoaderCircle,
  PackagePlus,
  Plus,
  Save,
  Trash2,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";

import { Button } from "@/components/ui/button";
import { PageSkeleton } from "@/components/ui/page-skeleton";
import { OrderFactorySettingsControls } from "@/components/order-factory-settings-controls";
import {
  emptyOrderDraft,
  fetchOrderEditor,
  orderDraftTotals,
  orderPaymentStatus,
  saveOrderEditor,
  type OrderEditorDraft,
  type OrderEditorOption,
  type OrderEditorOptions,
} from "@/lib/order-editor";

type Step = "details" | "items" | "payments";
type EditorLoader = typeof fetchOrderEditor;
type EditorSaver = typeof saveOrderEditor;

const EMPTY_OPTIONS: OrderEditorOptions = {
  channels: [],
  shippingMethods: [],
  districts: [],
  salesPartners: [],
  paymentMethods: [],
  catalog: [],
};

const STEPS: Array<{ id: Step; label: string; icon: typeof FileText }> = [
  { id: "details", label: "訂單資料", icon: FileText },
  { id: "items", label: "餐點內容", icon: PackagePlus },
  { id: "payments", label: "收款記錄", icon: CreditCard },
];

function money(value: number) {
  return new Intl.NumberFormat("zh-HK", {
    style: "currency",
    currency: "HKD",
    minimumFractionDigits: 2,
  }).format(value);
}

function SelectField({
  label,
  value,
  options,
  required,
  emptyLabel = "請選擇",
  onChange,
}: {
  label: string;
  value: string;
  options: OrderEditorOption[];
  required?: boolean;
  emptyLabel?: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="order-editor-field">
      <span>
        {label}
        {required && <em>*</em>}
      </span>
      <select value={value} onChange={(event) => onChange(event.target.value)} required={required}>
        <option value="">{emptyLabel}</option>
        {options.map((option) => (
          <option key={option.id} value={option.id}>{option.name}</option>
        ))}
      </select>
    </label>
  );
}

function InputField({
  label,
  value,
  required,
  type = "text",
  placeholder,
  disabled,
  onChange,
}: {
  label: string;
  value: string | number;
  required?: boolean;
  type?: string;
  placeholder?: string;
  disabled?: boolean;
  onChange: (value: string) => void;
}) {
  return (
    <label className="order-editor-field">
      <span>
        {label}
        {required && <em>*</em>}
      </span>
      <input
        type={type}
        value={value}
        placeholder={placeholder}
        required={required}
        disabled={disabled}
        min={type === "number" ? 0 : undefined}
        step={type === "number" ? "0.01" : undefined}
        onChange={(event) => onChange(event.target.value)}
      />
    </label>
  );
}

export function OrderEditorPage({
  loadEditor = fetchOrderEditor,
  saveEditor = saveOrderEditor,
}: {
  loadEditor?: EditorLoader;
  saveEditor?: EditorSaver;
}) {
  const { id } = useParams();
  const { t } = useTranslation();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const copyFrom = searchParams.get("copyFrom");
  const sourceId = id || copyFrom;
  const copying = Boolean(!id && copyFrom);
  const editing = Boolean(id);
  const [step, setStep] = useState<Step>("details");
  const [draft, setDraft] = useState<OrderEditorDraft>(emptyOrderDraft());
  const [options, setOptions] = useState<OrderEditorOptions>(EMPTY_OPTIONS);
  const [selectedCatalogId, setSelectedCatalogId] = useState("");
  const [catalogQuery, setCatalogQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const payload = await loadEditor(sourceId, copying);
      setDraft(payload.draft);
      setOptions(payload.options);
    } catch {
      setError("暫時無法載入訂單資料，請稍後再試。");
    } finally {
      setLoading(false);
    }
  }, [copying, loadEditor, sourceId]);

  useEffect(() => {
    void load();
  }, [load]);

  const totals = useMemo(() => orderDraftTotals(draft), [draft]);
  const paymentStatus = orderPaymentStatus(totals);
  const activeStepIndex = STEPS.findIndex((item) => item.id === step);
  const update = <K extends keyof OrderEditorDraft>(key: K, value: OrderEditorDraft[K]) =>
    setDraft((current) => ({ ...current, [key]: value }));

  const addCatalogItem = () => {
    const item = options.catalog.find((option) => option.id === selectedCatalogId);
    if (!item) return;
    update("lines", [
      ...draft.lines,
      {
        id: crypto.randomUUID(),
        productId: item.kind === "product" ? item.id : null,
        packageId: item.kind === "package" ? item.id : null,
        sku: item.sku ?? "",
        name: item.name,
        remarks: "",
        quantity: 1,
        unitPrice: item.price ?? 0,
      },
    ]);
    setSelectedCatalogId("");
    setCatalogQuery("");
  };

  const updateLine = (index: number, patch: Partial<OrderEditorDraft["lines"][number]>) =>
    update("lines", draft.lines.map((line, lineIndex) => lineIndex === index ? { ...line, ...patch } : line));

  const moveLine = (index: number, direction: -1 | 1) => {
    const next = index + direction;
    if (next < 0 || next >= draft.lines.length) return;
    const lines = [...draft.lines];
    [lines[index], lines[next]] = [lines[next], lines[index]];
    update("lines", lines);
  };

  const addPayment = () => {
    update("payments", [
      ...draft.payments,
      {
        id: crypto.randomUUID(),
        paymentAt: draft.deliveryAt || "",
        paymentMethodId: "",
        amount: totals.outstanding,
        reference: "",
      },
    ]);
  };

  const updatePayment = (index: number, patch: Partial<OrderEditorDraft["payments"][number]>) =>
    update("payments", draft.payments.map((payment, paymentIndex) => paymentIndex === index ? { ...payment, ...patch } : payment));

  const validate = () => {
    if (!draft.customerName.trim() || !draft.contactA.trim() || !draft.email.trim() || !draft.channelId || !draft.deliveryAt) {
      setStep("details");
      setSaveError("請填寫所有標示 * 的訂單資料。");
      return false;
    }
    if (!draft.lines.length || draft.lines.some((line) => !line.name.trim() || line.quantity <= 0)) {
      setStep("items");
      setSaveError("訂單至少需要一項餐點，數量必須大於 0。");
      return false;
    }
    if (draft.payments.some((payment) => !payment.paymentAt || !payment.paymentMethodId || payment.amount <= 0)) {
      setStep("payments");
      setSaveError("請完整填寫每筆收款的日期、付款方式及金額。");
      return false;
    }
    return true;
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setSaveError(null);
    if (!validate()) return;
    setSaving(true);
    try {
      const savedId = await saveEditor(draft);
      navigate(`/orders/${savedId}`, { replace: true });
    } catch {
      setSaveError("未能儲存訂單。請確認你的權限及資料後再試。");
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <PageSkeleton label="正在載入訂單編輯器…" variant="detail" />;
  if (error) {
    return (
      <div className="detail-state detail-state-error" role="alert">
        <CircleAlert />
        <div><strong>無法開啟訂單</strong><span>{error}</span></div>
        <Button variant="outline" onClick={() => void load()}>重試</Button>
      </div>
    );
  }

  const displayTitle = editing ? "編輯訂單" : copying ? "複製訂單" : "建立新訂單";
  const customerSummary = draft.customerName || draft.companyName || "尚未填寫客戶";

  return (
    <form className="order-editor-page" onSubmit={submit}>
      <header className="order-editor-header">
        <div className="order-editor-title">
          <Link to={editing ? `/orders/${id}` : "/orders"} aria-label="返回訂單">
            <ArrowLeft />
          </Link>
          <div>
            <span>{displayTitle}</span>
            <h1>{draft.orderNumber || customerSummary}</h1>
            <p>{draft.orderNumber ? customerSummary : "依序填寫訂單、餐點與收款資料"}</p>
          </div>
        </div>
        <aside
          className={`order-editor-payment-status is-${paymentStatus}`}
          role="status"
          aria-label={paymentStatus === "paid" ? "付款狀態：完成付款" : paymentStatus === "partial" ? `付款狀態：尚欠 ${money(totals.outstanding)}` : "付款狀態：尚未付款"}
        >
          <span className="order-editor-payment-status-icon" aria-hidden="true">
            {paymentStatus === "paid" ? <CircleCheckBig /> : paymentStatus === "partial" ? <CreditCard /> : <CircleAlert />}
          </span>
          <span className="order-editor-payment-status-copy">
            <small>付款狀態</small>
            {paymentStatus === "paid" ? (
              <><strong>完成付款</strong><em>款項已收齊</em></>
            ) : paymentStatus === "partial" ? (
              <><strong>尚欠 {money(totals.outstanding)}</strong><em>已收 {money(totals.paid)}</em></>
            ) : (
              <><strong>尚未付款</strong><em>尚未收到任何款項</em></>
            )}
          </span>
        </aside>
      </header>

      <nav className="order-editor-steps" aria-label="訂單編輯步驟">
        {STEPS.map((item, index) => {
          const Icon = item.icon;
          return (
            <button
              key={item.id}
              type="button"
              className={step === item.id ? "active" : index < activeStepIndex ? "complete" : ""}
              onClick={() => { setStep(item.id); setSaveError(null); }}
            >
              <span>{index < activeStepIndex ? <Check /> : <Icon />}</span>
              <small>步驟 {index + 1}</small>
              <strong>{item.label}</strong>
            </button>
          );
        })}
      </nav>

      <section className="panel order-editor-card">
        {step === "details" && (
          <>
            <header className="order-editor-section-heading">
              <div><span>01</span><div><h2>訂單與客戶資料</h2><p>確認聯絡方式、送餐日期及工場指示。</p></div></div>
            </header>
            <div className="order-editor-form-grid">
              <div className="order-editor-column">
                {copying ? (
                  <InputField
                    label="單號"
                    value={draft.orderNumber}
                    placeholder={t("orderEditor.copiedOrderNumberPlaceholder")}
                    disabled
                    onChange={(value) => update("orderNumber", value)}
                  />
                ) : (
                  <InputField
                    label="單號"
                    value={draft.orderNumber}
                    placeholder={t("orderEditor.orderNumberPlaceholder")}
                    onChange={(value) => update("orderNumber", value)}
                  />
                )}
                <SelectField label="品牌" value={draft.channelId} options={options.channels} required onChange={(value) => update("channelId", value)} />
                <InputField label="客人姓名" value={draft.customerName} required onChange={(value) => update("customerName", value)} />
                <InputField label="公司名稱" value={draft.companyName} onChange={(value) => update("companyName", value)} />
                <InputField label="聯絡電話" value={draft.contactA} required type="tel" onChange={(value) => update("contactA", value)} />
                <InputField label="第二聯絡電話" value={draft.contactB} type="tel" onChange={(value) => update("contactB", value)} />
                <InputField label="電郵地址" value={draft.email} required type="email" onChange={(value) => update("email", value)} />
                <SelectField label="運送方式" value={draft.shippingMethodId} options={options.shippingMethods} onChange={(value) => update("shippingMethodId", value)} />
                <InputField label="送貨地址" value={draft.address} onChange={(value) => update("address", value)} />
              </div>
              <div className="order-editor-column">
                <SelectField label="地區" value={draft.districtId} options={options.districts} onChange={(value) => update("districtId", value)} />
                <InputField label="送貨日期及時間" value={draft.deliveryAt} required type="datetime-local" onChange={(value) => update("deliveryAt", value)} />
                <InputField label="送貨時段" value={draft.deliveryTime} placeholder={t("orderEditor.deliveryTimePlaceholder")} onChange={(value) => update("deliveryTime", value)} />
                <InputField label="出車時間" value={draft.shipOutTime} placeholder={t("orderEditor.shipOutTimePlaceholder")} onChange={(value) => update("shipOutTime", value)} />
                <InputField label="客戶備註（送貨單顯示）" value={draft.customerNote} onChange={(value) => update("customerNote", value)} />
                <InputField label="包裝備註（工場版顯示）" value={draft.factoryPackingNote} onChange={(value) => update("factoryPackingNote", value)} />
                <SelectField label="Sales Partner" value={draft.salesPartnerId} options={options.salesPartners} onChange={(value) => update("salesPartnerId", value)} />
                <InputField label="內部備註（訂單頁顯示）" value={draft.internalNote} onChange={(value) => update("internalNote", value)} />
              </div>
            </div>
          </>
        )}

        {step === "items" && (
          <>
            <header className="order-editor-section-heading">
              <div><span>02</span><div><h2>加入餐點</h2><p>搜尋單點或套餐，再調整數量與單價。</p></div></div>
              <div className="order-editor-add-item">
                <input
                  list="order-editor-catalog"
                  value={catalogQuery}
                  placeholder={t("orderEditor.catalogSearchPlaceholder")}
                  onChange={(event) => {
                    const value = event.target.value;
                    setCatalogQuery(value);
                    const match = options.catalog.find((item) => `${item.sku ?? ""} · ${item.name}` === value);
                    setSelectedCatalogId(match?.id ?? "");
                  }}
                />
                <datalist id="order-editor-catalog">
                  {options.catalog.map((item) => (
                    <option key={`${item.kind}-${item.id}`} value={`${item.sku ?? ""} · ${item.name}`} />
                  ))}
                </datalist>
                <Button type="button" onClick={addCatalogItem} disabled={!selectedCatalogId}><Plus />加入</Button>
              </div>
            </header>
            <div className="order-editor-table-wrap">
              <table className="order-editor-table">
                <thead><tr><th>排序</th><th>SKU</th><th>產品</th><th>數量</th><th>單價</th><th>總數</th><th><span className="sr-only">操作</span></th></tr></thead>
                <tbody>
                  {draft.lines.map((line, index) => (
                    <tr key={line.id}>
                      <td><div className="order-editor-sort"><button type="button" disabled={!index} onClick={() => moveLine(index, -1)}><ChevronUp /></button><button type="button" disabled={index === draft.lines.length - 1} onClick={() => moveLine(index, 1)}><ChevronDown /></button></div></td>
                      <td><input value={line.sku} onChange={(event) => updateLine(index, { sku: event.target.value })} /></td>
                      <td><input value={line.name} aria-label={`產品 ${index + 1}`} onChange={(event) => updateLine(index, { name: event.target.value })} /><input className="order-line-note" value={line.remarks} placeholder={t("orderEditor.lineNotePlaceholder")} onChange={(event) => updateLine(index, { remarks: event.target.value })} /></td>
                      <td><input type="number" min="0.001" step="0.001" value={line.quantity} onChange={(event) => updateLine(index, { quantity: Number(event.target.value) })} /></td>
                      <td><input type="number" min="0" step="0.01" value={line.unitPrice} onChange={(event) => updateLine(index, { unitPrice: Number(event.target.value) })} /></td>
                      <td><strong>{money(line.quantity * line.unitPrice)}</strong></td>
                      <td><button className="order-editor-delete" type="button" aria-label={`刪除 ${line.name}`} onClick={() => update("lines", draft.lines.filter((_, lineIndex) => lineIndex !== index))}><Trash2 /></button></td>
                    </tr>
                  ))}
                  {!draft.lines.length && <tr><td className="order-editor-empty" colSpan={7}><PackagePlus /><strong>尚未加入餐點</strong><span>從上方產品選單加入第一項。</span></td></tr>}
                </tbody>
                <tfoot><tr><td colSpan={3}>總件數：<strong>{draft.lines.reduce((sum, line) => sum + line.quantity, 0)}</strong></td><td colSpan={4}>小計：<strong>{money(totals.subtotal)}</strong></td></tr></tfoot>
              </table>
            </div>
            <div className="order-editor-costs">
              <InputField label="運費 (+)" value={draft.shippingFee} type="number" onChange={(value) => update("shippingFee", Number(value))} />
              <InputField label="折扣 (-)" value={draft.discount} type="number" onChange={(value) => update("discount", Number(value))} />
              <InputField label="扣除 Cashdollar" value={draft.cashdollarRedeemed} type="number" onChange={(value) => update("cashdollarRedeemed", Number(value))} />
              <InputField label="購買 Cashdollar" value={draft.cashdollarPurchased} type="number" onChange={(value) => update("cashdollarPurchased", Number(value))} />
              <div><span>總額</span><strong>{money(totals.total)}</strong></div>
            </div>
          </>
        )}

        {step === "payments" && (
          <>
            <header className="order-editor-section-heading">
              <div><span>03</span><div><h2>收款記錄</h2><p>記錄付款日期、方式與已收金額。</p></div></div>
              <Button type="button" variant="outline" onClick={addPayment}><Plus />新增收款</Button>
            </header>
            <div className="order-payment-list">
              {draft.payments.map((payment, index) => (
                <div className="order-payment-row" key={payment.id}>
                  <InputField label="日期" value={payment.paymentAt} type="datetime-local" onChange={(value) => updatePayment(index, { paymentAt: value })} />
                  <SelectField label="付款方式" value={payment.paymentMethodId} options={options.paymentMethods} onChange={(value) => updatePayment(index, { paymentMethodId: value })} />
                  <InputField label="金額" value={payment.amount} type="number" onChange={(value) => updatePayment(index, { amount: Number(value) })} />
                  <InputField label="付款參考" value={payment.reference} onChange={(value) => updatePayment(index, { reference: value })} />
                  <button className="order-editor-delete" type="button" aria-label="刪除收款" onClick={() => update("payments", draft.payments.filter((_, paymentIndex) => paymentIndex !== index))}><Trash2 /></button>
                </div>
              ))}
              {!draft.payments.length && <div className="order-editor-empty"><CreditCard /><strong>尚未有收款</strong><span>可先儲存未付款訂單，稍後再補上記錄。</span></div>}
            </div>
            <div className="order-payment-summary">
              <div><span>訂單總額</span><strong>{money(totals.total)}</strong></div>
              <div><span>已收</span><strong>{money(totals.paid)}</strong></div>
              <div className="outstanding"><span>尚欠</span><strong>{money(totals.outstanding)}</strong></div>
            </div>
          </>
        )}
      </section>

      <footer className="order-editor-footer">
        <div>{saveError && <span role="alert"><CircleAlert />{saveError}</span>}</div>
        <div>
          {activeStepIndex > 0 && <Button type="button" variant="outline" onClick={() => setStep(STEPS[activeStepIndex - 1].id)}>上一步</Button>}
          {activeStepIndex < STEPS.length - 1 ? (
            <Button type="button" onClick={() => setStep(STEPS[activeStepIndex + 1].id)}>下一步</Button>
          ) : (
            <Button type="submit" disabled={saving}>{saving ? <LoaderCircle className="spin" /> : <Save />}{saving ? "儲存中…" : editing ? "儲存變更" : "建立訂單"}</Button>
          )}
        </div>
      </footer>
      {step === "items" ? (
        <OrderFactorySettingsControls
          doNotSendToFactory={draft.doNotSendToFactory}
          suppressFactoryReprint={draft.suppressFactoryReprint}
          onDoNotSendChange={(checked) => update("doNotSendToFactory", checked)}
          onSuppressFactoryReprintChange={(checked) =>
            update("suppressFactoryReprint", checked)
          }
        />
      ) : null}
    </form>
  );
}
