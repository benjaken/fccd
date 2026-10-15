import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { supabase } from "@/lib/supabase";
import { Button } from "@/components/ui/button";
import "@/lib/customer-portal-i18n";
import "./customer-portal.css";

type Queue={methods:Array<{id:string;name:string}>;evidence:Array<{id:string;order_number:string;organization:string;amount:number;created_at:string;object_path:string}>};
export function CustomerPaymentReviewPage(){
  const {t}=useTranslation();const [queue,setQueue]=useState<Queue|null>(null);const [error,setError]=useState("");
  const [busy,setBusy]=useState(false);const [method,setMethod]=useState("");const [reason,setReason]=useState("");
  async function refresh(){const {data,error:e}=await supabase.rpc("customer_portal_review_queue");if(e)throw e;setQueue(data as Queue);}
  useEffect(()=>{void refresh().catch(()=>setError(t("portal.financeAccessRequired")));},[t]);
  async function review(id:string,accept:boolean){setBusy(true);setError("");try{const r=await supabase.rpc("customer_portal_finance_review",{p_id:id,p_accept:accept,p_reason:reason,p_method_id:method||null});if(r.error)throw r.error;await refresh();setReason("");}catch{setError(t("portal.operationFailed"));}finally{setBusy(false);}}
  async function openFile(path:string){setBusy(true);try{const r=await supabase.storage.from("customer-payment-evidence").createSignedUrl(path,60);if(r.error||!r.data)throw r.error;window.open(r.data.signedUrl,"_blank","noopener,noreferrer");}catch{setError(t("portal.operationFailed"));}finally{setBusy(false);}}
  return <main className="customer-portal"><h1>{t("portal.reviewPayments")}</h1>{error&&<p role="alert" className="portal-error">{error}</p>}
    <Button variant="outline" disabled={busy} onClick={()=>void refresh().catch(()=>setError(t("portal.financeAccessRequired")))}>{t("portal.retry")}</Button>
    {queue&&<><div className="portal-checkout"><label>{t("portal.paymentMethod")}<select value={method} onChange={e=>setMethod(e.target.value)}><option value="">{t("portal.chooseMethod")}</option>{queue.methods.map(m=><option key={m.id} value={m.id}>{m.name}</option>)}</select></label><label>{t("portal.reviewReason")}<input value={reason} onChange={e=>setReason(e.target.value)} placeholder={t("portal.reviewReasonPlaceholder")}/></label></div>
      {!queue.evidence.length&&<p>{t("portal.noReview")}</p>}{queue.evidence.map(e=><div className="portal-row" key={e.id}><div><strong>{e.order_number} · {e.organization}</strong><p>HK${Number(e.amount).toFixed(2)}</p></div><div className="portal-actions"><Button variant="outline" disabled={busy} onClick={()=>void openFile(e.object_path)}>{t("portal.viewEvidence")}</Button><Button disabled={busy||!method} onClick={()=>void review(e.id,true)}>{t("portal.acceptPayment")}</Button><Button variant="outline" disabled={busy||!reason.trim()} onClick={()=>void review(e.id,false)}>{t("portal.rejectPayment")}</Button></div></div>)}</>}
  </main>;
}
