import { useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { usePersonalWorkspace } from "./CustomerPersonalWorkspace";
import { deletePersonalAddress, savePersonalAddress, savePersonalProfile, uploadPersonalEvidence, type PersonalAddress, type PersonalProfile } from "@/lib/customer-personal";

export function CustomerPersonalProfilePage() {
  const { t } = useTranslation();
  const { data, busy, run, refresh } = usePersonalWorkspace();
  const [draft, setDraft] = useState<PersonalProfile | null>(null);
  if (!data) return null;
  const profile = draft || data.profile;
  return <section><h1>{t("personal.profile")}</h1><p>{t("personal.otpHint")}</p><form onSubmit={event => {
    event.preventDefault(); void run(async () => { await savePersonalProfile(profile); await refresh(); setDraft(null); }, t("personal.saved"));
  }}>
    <label>{t("personal.contactName")}<input maxLength={120} value={profile.name} placeholder={t("personal.namePlaceholder")} onChange={event => setDraft({ ...profile, name: event.target.value })} /></label>
    <label>{t("personal.contactPhone")}<input type="tel" maxLength={40} value={profile.phone} placeholder={t("personal.phonePlaceholder")} onChange={event => setDraft({ ...profile, phone: event.target.value })} /></label>
    <label className="personal-form-wide">{t("personal.email")}<input type="email" value={profile.email} readOnly /></label>
    <p className="personal-form-wide">{t("personal.contactHint")}</p>
    <fieldset className="personal-form-wide personal-notifications"><legend>{t("personal.notifications")}</legend>
      <label><input type="checkbox" checked={profile.notify_email} onChange={event => setDraft({ ...profile, notify_email: event.target.checked })} />{t("personal.notifyEmail")}</label>
      <label><input type="checkbox" checked={profile.notify_whatsapp} onChange={event => setDraft({ ...profile, notify_whatsapp: event.target.checked })} />{t("personal.notifyWhatsapp")}</label><p>{t("personal.notificationHint")}</p>
    </fieldset>
    <div className="portal-actions personal-form-wide"><Button disabled={busy}>{t(busy ? "personal.saving" : "personal.save")}</Button></div>
  </form></section>;
}

const emptyAddress: Omit<PersonalAddress, "id"> = { label: "", recipient: "", phone: "", address: "", is_default: false };
export function CustomerPersonalAddressesPage() {
  const { t } = useTranslation();
  const { data, busy, run, refresh } = usePersonalWorkspace();
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState(emptyAddress);
  const [showForm, setShowForm] = useState(false);
  if (!data) return null;
  function reset() { setDraft(emptyAddress); setEditing(null); setShowForm(false); }
  return <section><h1>{t("personal.addresses")}</h1><p>{t("personal.addressHint")}</p><p className="personal-integration-note">{t("personal.syncPending")}</p>
    {data.addresses.length ? data.addresses.map(row => <article className="personal-address-row" key={row.id}><div><strong>{row.label}</strong>{row.is_default && <span className="personal-default">{t("personal.defaultAddress")}</span>}<p>{row.recipient} · {row.phone}</p><p>{row.address}</p></div>
      <div className="portal-actions"><Button variant="outline" disabled={busy} onClick={() => { setEditing(row.id); setDraft(row); setShowForm(true); }}>{t("personal.editAddress")}</Button>
        {!row.is_default && <Button variant="outline" disabled={busy} onClick={() => void run(async () => { await savePersonalAddress({ ...row, is_default: true }, row.id); await refresh(); }, t("personal.saved"))}>{t("personal.makeDefault")}</Button>}
        <Button variant="ghost" disabled={busy} onClick={() => void run(async () => { await deletePersonalAddress(row.id); await refresh(); if (editing === row.id) reset(); }, t("personal.deleted"))}>{t("personal.deleteAddress")}</Button></div>
    </article>) : <p className="personal-empty">{t("personal.noAddresses")}</p>}
    {!showForm && <Button type="button" onClick={() => { reset(); setShowForm(true); }}>{t("personal.addAddress")}</Button>}
    {showForm && <><h2>{t(editing ? "personal.editAddress" : "personal.addAddress")}</h2><form onSubmit={event => {
      event.preventDefault(); void run(async () => { await savePersonalAddress(draft, editing); await refresh(); reset(); }, t("personal.saved"));
    }}>{(["label", "recipient", "phone", "address"] as const).map(key => <label key={key} className={key === "address" ? "personal-form-wide" : undefined}>{t(`personal.addressFields.${key}`)}
      <input required type={key === "phone" ? "tel" : "text"} maxLength={{ label: 80, recipient: 120, phone: 40, address: 1000 }[key]} value={draft[key]} placeholder={t(`personal.addressPlaceholders.${key}Placeholder`)} onChange={event => setDraft({ ...draft, [key]: event.target.value })} />
    </label>)}<label className="personal-checkbox personal-form-wide"><input type="checkbox" checked={draft.is_default} onChange={event => setDraft({ ...draft, is_default: event.target.checked })} />{t("personal.defaultAddress")}</label>
      <div className="portal-actions personal-form-wide"><Button disabled={busy}>{t(busy ? "personal.saving" : "personal.save")}</Button><Button type="button" variant="ghost" disabled={busy} onClick={reset}>{t("personal.cancelEdit")}</Button></div>
    </form></>}
  </section>;
}

export function CustomerPersonalEvidencePage() {
  const { t, i18n } = useTranslation();
  const { data, session, busy, run, refresh } = usePersonalWorkspace();
  const [orderId, setOrderId] = useState("");
  const [amount, setAmount] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [fileVersion, setFileVersion] = useState(0);
  const [error, setError] = useState("");
  if (!data) return null;
  const orders = session.orders.filter(order => order.currency === "HKD" && data.order_states[order.id]?.paid === false);
  async function submit(event: FormEvent) {
    event.preventDefault(); setError("");
    if (!file || !orderId || !orders.some(order => order.id === orderId) || !["image/jpeg", "image/png", "application/pdf"].includes(file.type) || !file.size || file.size > 10 * 1024 * 1024 || !Number.isFinite(Number(amount)) || Number(amount) <= 0) {
      setError(t("personal.invalidFile")); return;
    }
    const saved = await run(async () => { await uploadPersonalEvidence(orderId, file, Number(amount)); await refresh(); }, t("personal.submitted"));
    if (saved) { setFile(null); setAmount(""); setOrderId(""); setFileVersion(v => v + 1); }
  }
  return <section><h1>{t("personal.evidence")}</h1><p>{t("personal.evidenceIntro")}</p><p>{t("personal.evidenceHint")}</p>
    {orders.length ? <form onSubmit={event => void submit(event)}>
      <label>{t("personal.chooseOrder")}<select required value={orderId} onChange={event => setOrderId(event.target.value)}><option value="">{t("personal.chooseOrderPlaceholder")}</option>{orders.map(order => <option key={order.id} value={order.id}>{order.orderNumber}</option>)}</select></label>
      <label>{t("personal.amount")}<input required type="number" min="0.01" step="0.01" inputMode="decimal" value={amount} placeholder={t("personal.amountPlaceholder")} onChange={event => setAmount(event.target.value)} /></label>
      <label className="personal-form-wide">{t("personal.evidenceFile")}<input key={fileVersion} required type="file" accept="image/jpeg,image/png,application/pdf" onChange={event => setFile(event.target.files?.[0] || null)} /></label>
      {error && <p role="alert" className="portal-error personal-form-wide">{error}</p>}
      <div className="portal-actions personal-form-wide"><Button disabled={busy || !file || !orderId}>{t(busy ? "personal.submitting" : "personal.submit")}</Button></div>
    </form> : <p className="personal-empty">{t("personal.noUnpaid")}</p>}
    <h2>{t("personal.evidenceHistory")}</h2>{data.evidence.length ? data.evidence.map(row => <article className="portal-row" key={row.id}><div><strong>{session.orders.find(order => order.id === row.order_id)?.orderNumber || row.order_id}</strong><p>{new Date(row.created_at).toLocaleDateString(i18n.language)}</p>{row.review_reason && <p>{row.review_reason}</p>}</div><span>{t(`personal.status.${row.status}`)}</span><strong>{new Intl.NumberFormat(i18n.language, { style: "currency", currency: "HKD" }).format(row.amount)}</strong></article>) : <p>{t("personal.noEvidence")}</p>}
  </section>;
}
