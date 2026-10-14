import { useOutletContext } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { fetchPortalEvidence, uploadPortalEvidence, fetchPortalDocument, portalPermissions } from "@/lib/customer-portal";
import type { CustomerPortalController } from "@/components/CustomerPortalPage";
const money = (cents: number) => new Intl.NumberFormat("zh-HK", { style: "currency", currency: "HKD" }).format(cents / 100);

export function CustomerReceiptsPage() {
  const portal = useOutletContext<CustomerPortalController>();
  const {t, busy, receiptOrder, setReceiptOrder, receiptFile, setReceiptFile, receiptAmount, setReceiptAmount, evidence, setEvidence, setFinancialDocument, refresh, run} = portal;
  const data = portal.data;
  if (!data) return null;
  return <section><h1>{t("portal.receipts")}</h1><p>{t("portal.evidenceHint")}</p><Button variant="outline" disabled={busy} onClick={()=>void run(async()=>{await refresh();setEvidence(await fetchPortalEvidence(data.organization.id));})}>{t("portal.refreshPayment")}</Button><form onSubmit={e=>{e.preventDefault();if(receiptFile)void run(async()=>{await uploadPortalEvidence(receiptOrder,receiptFile,receiptAmount,data.organization.id);setReceiptFile(null);setEvidence(await fetchPortalEvidence(data.organization.id));},t("portal.evidenceSubmitted"));}}>
          <label>{t("portal.orders")}<select required value={receiptOrder} onChange={e=>{setReceiptOrder(e.target.value);setReceiptAmount(Number(data.orders.find(o=>o.id===e.target.value)?.outstanding||0));}}><option value="">{t("portal.chooseOrder")}</option>{data.orders.filter(o=>Number(o.outstanding)>0).map(o=><option key={o.id} value={o.id}>{o.number}</option>)}</select></label>
          <label>{t("portal.paymentAmount")}<input required type="number" min="0.01" step="0.01" value={receiptAmount} onChange={e=>setReceiptAmount(Number(e.target.value))}/></label>
          <label>{t("portal.receiptFile")}<input required type="file" accept="image/jpeg,image/png,application/pdf" onChange={e=>setReceiptFile(e.target.files?.[0]||null)}/></label><Button disabled={busy||!receiptFile||!receiptOrder}>{t("portal.submitEvidence")}</Button></form>
          {evidence.map(e=><div className="portal-row" key={e.id}><span>{data.orders.find(o=>o.id===e.order_id)?.number} · {money(Math.round(Number(e.amount)*100))}</span><div><strong>{t("portal.evidenceStatus."+e.status)}</strong>{e.review_reason&&<p>{e.review_reason}</p>}</div></div>)}
          <h2>{t("portal.financialDocuments")}</h2><p>{t("portal.documentsHint")}</p>
          {data.orders.map(o=><div className="portal-row" key={o.id}><strong>{o.number}</strong><div className="portal-actions">{(["receipt","invoice"] as const).map(kind=><Button key={kind} variant="outline" disabled={busy||!portalPermissions(data).export||Number(o.outstanding)>0||["已取消","己取消","取消"].includes(o.status||"")} onClick={()=>void run(async()=>{setFinancialDocument({order:await fetchPortalDocument(o.id,kind,data.organization.id),kind});})}>{t("portal.download."+kind)}</Button>)}</div></div>)}
        </section>;
}
