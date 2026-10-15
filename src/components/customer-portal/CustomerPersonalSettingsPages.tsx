import { useEffect, useState, type FormEvent } from "react";
import { useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Bell, Building2, Home, Info, Star, Trash2, Mail, MapPin, MessageCircle, Pencil, Phone, Plus, UserRound, Warehouse } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CornerNotice } from "@/components/ui/corner-notice";
import { EmptyState } from "@/components/ui/empty-state";
import { FileDropField } from "./FileDropField";
import { SidePanel } from "@/components/ui/side-panel";
import { Switch } from "@/components/ui/switch";
import { usePersonalWorkspace } from "./CustomerPersonalWorkspace";
import { deletePersonalAddress, savePersonalAddress, savePersonalProfile, uploadPersonalEvidence, type PersonalAddress, type PersonalProfile } from "@/lib/customer-personal";

export function CustomerPersonalProfilePage() {
  const { t } = useTranslation();
  const { data, busy, run, refresh } = usePersonalWorkspace();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<PersonalProfile | null>(null);
  const [error, setError] = useState("");
  if (!data) return null;
  const profile = data.profile;
  const editing = draft ?? profile;
  const name = profile.name.trim();
  const phone = profile.phone.trim();
  const initial = (name || profile.email || "?").slice(0, 1).toUpperCase();
  function close() {
    if (busy) return;
    setOpen(false);
  }
  async function save(event: FormEvent) {
    event.preventDefault();
    setError("");
    const saved = await run(async () => {
      await savePersonalProfile({ name: editing.name, phone: editing.phone, notify_email: editing.notify_email, notify_whatsapp: editing.notify_whatsapp });
      await refresh();
    }, t("personal.saved"));
    if (saved) { setDraft(null); setOpen(false); }
    else setError(t("personal.operationFailed"));
  }
  async function toggle(key: "notify_whatsapp" | "notify_email", next: boolean) {
    await run(async () => {
      await savePersonalProfile({
        name: profile.name,
        phone: profile.phone,
        notify_email: key === "notify_email" ? next : profile.notify_email,
        notify_whatsapp: key === "notify_whatsapp" ? next : profile.notify_whatsapp,
      });
      await refresh();
    }, t("personal.saved"));
  }
  return <section className="personal-profile">
    <div className="personal-profile-banner">
      <div className="personal-profile-banner-copy">
        <h1>{t("personal.profile")}</h1>
        <p>{t("personal.profileIntro")}</p>
      </div>
      <div className="personal-profile-banner-art" aria-hidden="true"><ProfileHeroArt /></div>
    </div>
    <article className="personal-profile-card personal-profile-identity">
      <span className="personal-profile-avatar" aria-hidden="true">{initial}</span>
      <div className="personal-profile-identity-copy">
        <h2>{name || t("personal.notSet")}</h2>
        <p><Mail size={18} aria-hidden="true" /><span>{profile.email}</span></p>
        <p><Phone size={18} aria-hidden="true" /><span>{phone || t("personal.notSet")}</span></p>
      </div>
      <Button type="button" className="personal-profile-edit-btn" onClick={() => { setDraft({ ...profile }); setOpen(true); }}><Pencil size={16} aria-hidden="true" />{t("personal.editProfile")}</Button>
    </article>
    <section className="personal-profile-card" aria-labelledby="personal-notify-heading">
      <header className="personal-profile-card-head">
        <span className="personal-profile-card-icon" aria-hidden="true"><Bell size={20} /></span>
        <div>
          <h2 id="personal-notify-heading">{t("personal.notifications")}</h2>
        </div>
      </header>
      <ul className="personal-profile-toggles">
        <li className="personal-profile-toggle">
          <span className="personal-profile-fact-icon" aria-hidden="true"><MessageCircle size={18} /></span>
          <span className="personal-profile-toggle-label">{t("personal.notifyWhatsapp")}</span>
          <span className={profile.notify_whatsapp ? "personal-pref-on" : "personal-pref-off"}>{t(profile.notify_whatsapp ? "personal.prefOn" : "personal.prefOff")}</span>
          <Switch checked={profile.notify_whatsapp} disabled={busy} aria-label={t("personal.notifyWhatsapp")} onCheckedChange={next => void toggle("notify_whatsapp", next)} />
        </li>
        <li className="personal-profile-toggle">
          <span className="personal-profile-fact-icon" aria-hidden="true"><Mail size={18} /></span>
          <span className="personal-profile-toggle-label">{t("personal.notifyEmail")}</span>
          <span className={profile.notify_email ? "personal-pref-on" : "personal-pref-off"}>{t(profile.notify_email ? "personal.prefOn" : "personal.prefOff")}</span>
          <Switch checked={profile.notify_email} disabled={busy} aria-label={t("personal.notifyEmail")} onCheckedChange={next => void toggle("notify_email", next)} />
        </li>
      </ul>
    </section>
    <SidePanel open={open} title={t("personal.editProfileTitle")} description={t("personal.otpHint")} closeLabel={t("personal.cancel")} onClose={close} className="personal-profile-panel" footer={<>
      <Button type="button" variant="outline" disabled={busy} onClick={close}>{t("personal.cancel")}</Button>
      <Button type="submit" form="personal-profile-form" disabled={busy}>{t(busy ? "personal.saving" : "personal.confirmChanges")}</Button>
    </>}>
      <form id="personal-profile-form" className="personal-profile-form" onSubmit={event => void save(event)}>
        <label>{t("personal.contactName")}<input maxLength={120} value={editing.name} placeholder={t("personal.namePlaceholder")} onChange={event => setDraft({ ...editing, name: event.target.value })} /></label>
        <label>{t("personal.contactPhone")}<input type="tel" maxLength={40} value={editing.phone} placeholder={t("personal.phonePlaceholder")} onChange={event => setDraft({ ...editing, phone: event.target.value })} /></label>
        <label>{t("personal.email")}<input type="email" value={editing.email} readOnly /></label>
        {error ? <p role="alert">{error}</p> : null}
      </form>
    </SidePanel>
  </section>;
}

export function ProfileHeroArt() {
  return <svg viewBox="0 0 240 172" role="img" aria-hidden="true" focusable="false">
    <path d="M30 156c-16-34 0-70 42-84-4 40-16 66-42 84z" fill="#bfe0c6" />
    <path d="M58 164c-12-26 0-52 32-63-4 28-13 47-32 63z" fill="#d3ebd8" />
    <rect x="70" y="26" width="126" height="110" rx="18" transform="rotate(-6 133 81)" fill="#bfe5d3" />
    <g transform="rotate(-7 150 92)">
      <rect x="84" y="42" width="130" height="94" rx="16" fill="#f3fbf5" />
      <rect x="84" y="42" width="130" height="94" rx="16" fill="none" stroke="#dcefe0" strokeWidth="2" />
      <circle cx="116" cy="80" r="15" fill="#7db98a" />
      <path d="M99 116c3-12 10-18 17-18s14 6 17 18z" fill="#7db98a" />
      <rect x="146" y="68" width="52" height="8" rx="4" fill="#cfe6d3" />
      <rect x="146" y="85" width="42" height="8" rx="4" fill="#dcece0" />
      <rect x="146" y="102" width="48" height="8" rx="4" fill="#dcece0" />
    </g>
    <path d="M198 26l5 12M214 44l12 5" stroke="#8cc39a" strokeWidth="5" strokeLinecap="round" />
  </svg>;
}

const addressKinds = ["home", "company", "other"] as const;
type AddressKind = (typeof addressKinds)[number];
type AddressDraft = { kind: AddressKind | ""; recipient: string; phone: string; address: string; is_default: boolean };
const emptyDraft: AddressDraft = { kind: "home", recipient: "", phone: "", address: "", is_default: false };
const kindIcons = { home: Home, company: Building2, other: Warehouse };
const addressLimit = 300;

function splitAddressLabel(label: string): { kind: AddressKind | ""; place: string } {
  const match = /^\[(home|company|other)\]\s*([\s\S]*)$/.exec(label);
  if (!match) return { kind: "", place: label };
  return { kind: match[1] as AddressKind, place: match[2] };
}

function joinAddressLabel(kind: AddressKind | "") {
  return kind ? `[${kind}]` : "";
}

export function CustomerPersonalAddressesPage() {
  const { t } = useTranslation();
  const { data, busy, run, refresh } = usePersonalWorkspace();
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState(emptyDraft);
  const [open, setOpen] = useState(false);
  if (!data) return null;

  function close() {
    if (busy) return;
    setDraft(emptyDraft); setEditing(null); setOpen(false);
  }
  function openCreate() { setEditing(null); setDraft(emptyDraft); setOpen(true); }
  function openEdit(row: PersonalAddress) {
    const parsed = splitAddressLabel(row.label);
    setEditing(row.id);
    setDraft({ kind: parsed.kind || "home", recipient: row.recipient, phone: row.phone, address: row.address.slice(0, 1000), is_default: row.is_default });
    setOpen(true);
  }
  const detailLimit = Math.min(1000, Math.max(addressLimit, draft.address.length));

  return <section className="personal-addresses">
    <header className="personal-address-hero">
      <div>
        
        <h1>{t("personal.manageAddresses")}</h1>
        <p>{t("personal.addressIntro")}</p>
        <Button type="button" className="personal-address-create" onClick={openCreate}><Plus size={22} />{t("personal.addAddress")}</Button>
      </div>
      <AddressHeroArt />
    </header>
    <h2 className="personal-address-list-heading">{t("personal.myAddresses")}</h2>
    {data.addresses.length ? <div className="personal-address-list">{[...data.addresses].sort((a, b) => Number(b.is_default) - Number(a.is_default)).map(row => {
      const parsed = splitAddressLabel(row.label);
      const KindIcon = parsed.kind ? kindIcons[parsed.kind] : MapPin;
      const title = row.is_default ? t("personal.defaultAddress") : parsed.place || (parsed.kind ? t(`personal.addressKinds.${parsed.kind}`) : row.recipient);
      return <article className={`personal-address-card${row.is_default ? " is-default" : ""}`} key={row.id}>
        <div className="personal-address-card-main">
          <span className="personal-address-icon" aria-hidden="true"><KindIcon size={18} /></span>
          <div className="personal-address-copy">
            <div className="personal-address-title">
              <strong>{title}</strong>
              {row.is_default ? <em>{t("personal.defaultBadge")}</em> : null}
              {parsed.kind ? <span className="personal-sr">{t(`personal.addressKinds.${parsed.kind}`)}</span> : null}
            </div>
            <p className="personal-address-contact"><strong>{row.recipient}</strong><span>{row.phone}</span></p>
            <p className="personal-address-location"><MapPin size={20} aria-hidden="true" /><span>{row.address}</span></p>
          </div>
        </div>
        <div className="personal-address-actions">
          <button type="button" className="personal-address-edit" disabled={busy} onClick={() => openEdit(row)}><Pencil size={16} aria-hidden="true" />{t("personal.editAddress")}</button>
          <button type="button" className="personal-address-edit personal-address-delete" disabled={busy} onClick={() => void run(async () => { await deletePersonalAddress(row.id); await refresh(); }, t("personal.deleted"))}><Trash2 size={19} aria-hidden="true" />{t("personal.deleteAddress")}</button>
          <button type="button" className="personal-address-edit personal-address-make-default" disabled={busy || row.is_default} onClick={() => void run(async () => { await savePersonalAddress({ ...row, is_default: true }, row.id); await refresh(); }, t("personal.saved"))}><Star size={21} aria-hidden="true" />{t("personal.makeDefault")}</button>
        </div>
      </article>;
    })}</div> : <EmptyState title={t("personal.noAddresses")} />}
    <SidePanel
      open={open}
      className="personal-address-panel"
      title={t(editing ? "personal.editAddressTitle" : "personal.newAddress")}
      closeLabel={t("personal.close")}
      onClose={close}
      footer={<>
        <Button type="button" variant="ghost" disabled={busy} onClick={close}>{t("personal.cancel")}</Button>
        <Button type="submit" form="personal-address-form" className="personal-address-save" disabled={busy}>{t(busy ? "personal.saving" : "personal.saveAddress")}</Button>
      </>}
    >
      <form id="personal-address-form" className="personal-address-form" onSubmit={event => {
        event.preventDefault();
        const address = { label: joinAddressLabel(draft.kind), recipient: draft.recipient.trim(), phone: draft.phone.trim(), address: draft.address.trim(), is_default: draft.is_default };
        void run(async () => { await savePersonalAddress(address, editing); await refresh(); }, t("personal.saved")).then(saved => { if (saved) close(); });
      }}>
        <section className="personal-address-step" aria-labelledby="personal-address-contact">
          <header>
            <span className="personal-address-step-index" aria-hidden="true">01</span>
            <div>
              <h3 id="personal-address-contact">{t("personal.addressSteps.contact")}</h3>
              <p>{t("personal.addressSteps.contactHint")}</p>
            </div>
          </header>
          <div className="personal-address-pair">
            <label>{t("personal.addressFields.recipient")}
              <span className="personal-address-field"><UserRound size={16} aria-hidden="true" /><input required maxLength={120} autoComplete="name" value={draft.recipient} placeholder={t("personal.addressPlaceholders.recipientPlaceholder")} onChange={event => setDraft({ ...draft, recipient: event.target.value })} /></span>
            </label>
            <label>{t("personal.addressFields.phone")}
              <span className="personal-address-field"><Phone size={16} aria-hidden="true" /><input required type="tel" maxLength={40} autoComplete="tel" inputMode="tel" value={draft.phone} placeholder={t("personal.addressPlaceholders.phonePlaceholder")} onChange={event => setDraft({ ...draft, phone: event.target.value })} /></span>
            </label>
          </div>
        </section>
        <section className="personal-address-step" aria-labelledby="personal-address-type">
          <header>
            <span className="personal-address-step-index" aria-hidden="true">02</span>
            <div>
              <h3 id="personal-address-type">{t("personal.addressType")}</h3>
              <p>{t("personal.addressTypeHint")}</p>
            </div>
          </header>
          <div className="personal-address-kinds" role="radiogroup" aria-label={t("personal.addressType")}>
            {addressKinds.map(kind => {
              const KindIcon = kindIcons[kind];
              return <button key={kind} type="button" role="radio" aria-checked={draft.kind === kind} className={draft.kind === kind ? "is-selected" : undefined} onClick={() => setDraft(current => ({ ...current, kind }))}>
                <KindIcon size={18} aria-hidden="true" />
                <span>{t(`personal.addressKinds.${kind}`)}</span>
                <span className="personal-address-radio" aria-hidden="true" />
              </button>;
            })}
          </div>
        </section>
        <section className="personal-address-step">
          <header>
            <span className="personal-address-step-index" aria-hidden="true">03</span>
            <div>
              <h3>{t("personal.addressFields.address")}</h3>
              <p>{t("personal.addressSteps.detailHint")}</p>
            </div>
          </header>
          <label>
            <span className="personal-sr">{t("personal.addressFields.address")}</span>
            <span className="personal-address-field">
              <MapPin size={16} aria-hidden="true" />
              <textarea required rows={4} maxLength={detailLimit} aria-describedby="personal-address-count" value={draft.address} placeholder={t("personal.addressPlaceholders.addressPlaceholder")} onChange={event => setDraft({ ...draft, address: event.target.value.slice(0, detailLimit) })} />
              <span id="personal-address-count" className="personal-address-count">{Math.min(draft.address.length, detailLimit)}/{detailLimit}</span>
            </span>
          </label>
        </section>
        <p className="personal-address-notice"><Info size={18} aria-hidden="true" /><span><strong>{t("personal.addressNoticeTitle")}</strong><span>{t("personal.addressNotice")}</span></span></p>
        <label className="personal-address-default">
          <input type="checkbox" checked={draft.is_default} onChange={event => setDraft({ ...draft, is_default: event.target.checked })} />
          <span><strong>{t("personal.setDefault")}</strong><small>{t("personal.defaultAddressHint")}</small></span>
        </label>
      </form>
    </SidePanel>
  </section>;
}

function AddressHeroArt() {
  return <img className="personal-address-art" src="/assets/customer-personal/address-scooter-fc.png" alt="" aria-hidden="true" />;
}

export function CustomerPersonalEvidencePage() {
  const { t, i18n } = useTranslation();
  const { data, session, busy, run, refresh } = usePersonalWorkspace();
  const [params] = useSearchParams();
  const requestedOrder = params.get("order") || "";
  const [orderId, setOrderId] = useState("");
  const [amount, setAmount] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [fileVersion, setFileVersion] = useState(0);
  const [error, setError] = useState("");
  useEffect(() => {
    if (!data || !requestedOrder) return;
    const eligible = session.orders.some(order => order.id === requestedOrder && order.currency === "HKD" && data.order_states[order.id]?.paid === false);
    if (eligible) setOrderId(requestedOrder);
  }, [data, requestedOrder, session.orders]);
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
      <FileDropField key={fileVersion} className="personal-form-wide" label={t("personal.evidenceFile")} file={file} onFile={setFile} accept="image/jpeg,image/png,application/pdf" required />
      {error && <p role="alert" className="portal-error personal-form-wide">{error}</p>}
      <div className="portal-actions personal-form-wide"><Button disabled={busy || !file || !orderId}>{t(busy ? "personal.submitting" : "personal.submit")}</Button></div>
    </form> : <EmptyState title={t("personal.noUnpaid")} />}
    <h2>{t("personal.evidenceHistory")}</h2>{data.evidence.length ? data.evidence.map(row => <article className="portal-row" key={row.id}><div><strong>{session.orders.find(order => order.id === row.order_id)?.orderNumber || row.order_id}</strong><p>{new Date(row.created_at).toLocaleDateString(i18n.language)}</p>{row.review_reason && <p>{row.review_reason}</p>}</div><span>{t(`personal.status.${row.status}`)}</span><strong>{new Intl.NumberFormat(i18n.language, { style: "currency", currency: "HKD" }).format(row.amount)}</strong></article>) : <EmptyState title={t("personal.noEvidence")} />}
  </section>;
}

