import { useOutletContext } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { savePortalAddress } from "@/lib/customer-portal";
import type { CustomerPortalController } from "@/components/CustomerPortalPage";

export function CustomerAddressesPage() {
  const portal = useOutletContext<CustomerPortalController>();
  const {t, busy, address, setAddress, refresh, run} = portal;
  const data = portal.data;
  if (!data) return null;
  return <section><h1>{t("portal.addresses")}</h1>{data.addresses.map(a=><div className="portal-row" key={a.id}><div><strong>{a.label}</strong><p>{a.recipient} · {a.phone}</p><p>{a.address}</p></div></div>)}<h2>{t("portal.addAddress")}</h2><form onSubmit={e=>{e.preventDefault();void run(async()=>{await savePortalAddress(address);setAddress({label:"",recipient:"",phone:"",address:""});await refresh();},t("portal.saved"));}}>{(["label","recipient","phone","address"] as const).map(key=><label key={key}>{t("portal.addressFields."+key)}<input required value={address[key]} onChange={e=>setAddress({...address,[key]:e.target.value})} placeholder={t("portal.addressPlaceholders."+key)}/></label>)}<Button disabled={busy}>{t("portal.save")}</Button></form></section>;
}
