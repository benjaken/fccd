import { useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { Bell, Building2, Home, Lightbulb, Mail, MapPin, Pencil, Phone, Plus, Star, UserRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SidePanel } from "@/components/ui/side-panel";
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
  const initial = (name || profile.email || "?").slice(0, 1);
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
  return <section className="personal-profile">
    <div className="personal-profile-banner">
      <div>
        <h1>{t("personal.profile")}</h1>
        <p>{t("personal.profileIntro")}</p>
      </div>
      <div className="personal-hero-art" aria-hidden="true">
        <svg viewBox="0 0 320 180" role="img">
          <rect width="320" height="180" rx="28" fill="#d7ecd9" />
          <ellipse cx="214" cy="118" rx="78" ry="28" fill="#c5e2c4" />
          <circle cx="168" cy="78" r="28" fill="#6aa84f" />
          <circle cx="214" cy="64" r="22" fill="#8fbf6a" />
          <circle cx="248" cy="86" r="18" fill="#d9783a" />
          <path d="M150 132c28 18 92 16 124-6" fill="none" stroke="#2f6b45" strokeWidth="6" strokeLinecap="round" />
        </svg>
      </div>
    </div>
    <div className="personal-profile-body">
      <div className="personal-profile-identity">
        <span className="personal-profile-avatar" aria-hidden="true">{initial}</span>
        <div>
          <h2>{name || t("personal.notSet")}</h2>
          <p><Mail size={16} />{profile.email}</p>
          <p><Phone size={16} />{phone || t("personal.notSet")}</p>
        </div>
        <Button type="button" variant="outline" onClick={() => { setDraft({ ...profile }); setOpen(true); }}><Pencil size={16} />{t("personal.editProfile")}</Button>
      </div>
      <section className="personal-profile-section" aria-labelledby="personal-contact-heading">
        <h2 id="personal-contact-heading"><UserRound size={18} />{t("personal.contactSection")}</h2>
        <p>{t("personal.contactHint")}</p>
        <dl className="personal-profile-facts">
          <div><dt>{t("personal.contactName")}</dt><dd>{name || t("personal.notSet")}</dd></div>
          <div><dt>{t("personal.contactPhone")}</dt><dd>{phone || t("personal.notSet")}</dd></div>
          <div><dt>{t("personal.email")}</dt><dd>{profile.email}</dd></div>
        </dl>
      </section>
      <section className="personal-profile-section" aria-labelledby="personal-notify-heading">
        <h2 id="personal-notify-heading"><Bell size={18} />{t("personal.notifications")}</h2>
        <p>{t("personal.notificationHint")}</p>
        <ul className="personal-profile-prefs">
          <li><span>{t("personal.notifyWhatsapp")}</span><strong className={profile.notify_whatsapp ? "personal-pref-on" : "personal-pref-off"}>{t(profile.notify_whatsapp ? "personal.prefOn" : "personal.prefOff")}</strong></li>
          <li><span>{t("personal.notifyEmail")}</span><strong className={profile.notify_email ? "personal-pref-on" : "personal-pref-off"}>{t(profile.notify_email ? "personal.prefOn" : "personal.prefOff")}</strong></li>
        </ul>
      </section>
    </div>
    <SidePanel open={open} title={t("personal.editProfileTitle")} description={t("personal.otpHint")} closeLabel={t("personal.cancel")} onClose={close} className="personal-profile-panel" footer={<>
      <Button type="button" variant="outline" disabled={busy} onClick={close}>{t("personal.cancel")}</Button>
      <Button type="submit" form="personal-profile-form" disabled={busy}>{t(busy ? "personal.saving" : "personal.confirmChanges")}</Button>
    </>}>
      <form id="personal-profile-form" className="personal-profile-form" onSubmit={event => void save(event)}>
        <label>{t("personal.contactName")}<input maxLength={120} value={editing.name} placeholder={t("personal.namePlaceholder")} onChange={event => setDraft({ ...editing, name: event.target.value })} /></label>
        <label>{t("personal.contactPhone")}<input type="tel" maxLength={40} value={editing.phone} placeholder={t("personal.phonePlaceholder")} onChange={event => setDraft({ ...editing, phone: event.target.value })} /></label>
        <label>{t("personal.email")}<input type="email" value={editing.email} readOnly /></label>
        <fieldset className="personal-notifications">
          <legend>{t("personal.notifications")}</legend>
          <label><input type="checkbox" checked={editing.notify_whatsapp} onChange={event => setDraft({ ...editing, notify_whatsapp: event.target.checked })} />{t("personal.notifyWhatsapp")}</label>
          <label><input type="checkbox" checked={editing.notify_email} onChange={event => setDraft({ ...editing, notify_email: event.target.checked })} />{t("personal.notifyEmail")}</label>
          <p>{t("personal.notificationHint")}</p>
        </fieldset>
        {error ? <p role="alert">{error}</p> : null}
      </form>
    </SidePanel>
  </section>;
}

const addressKinds = ["home", "company", "other"] as const;
type AddressKind = (typeof addressKinds)[number];
type AddressDraft = { kind: AddressKind | ""; place: string; recipient: string; phone: string; address: string; is_default: boolean };
const emptyDraft: AddressDraft = { kind: "home", place: "", recipient: "", phone: "", address: "", is_default: false };
const kindIcons = { home: Home, company: Building2, other: MapPin };

function splitAddressLabel(label: string): { kind: AddressKind | ""; place: string } {
  const match = /^\[(home|company|other)\]\s*([\s\S]*)$/.exec(label);
  if (!match) return { kind: "", place: label };
  return { kind: match[1] as AddressKind, place: match[2] };
}

function joinAddressLabel(kind: AddressKind | "", place: string) {
  const name = place.trim();
  return kind ? `[${kind}] ${name}` : name;
}

export function CustomerPersonalAddressesPage() {
  const { t } = useTranslation();
  const { data, busy, run, refresh } = usePersonalWorkspace();
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState(emptyDraft);
  const [open, setOpen] = useState(false);
  if (!data) return null;

  function close() { setDraft(emptyDraft); setEditing(null); setOpen(false); }
  function openCreate() { setEditing(null); setDraft(emptyDraft); setOpen(true); }
  function openEdit(row: PersonalAddress) {
    const parsed = splitAddressLabel(row.label);
    setEditing(row.id);
    setDraft({ kind: parsed.kind, place: parsed.place, recipient: row.recipient, phone: row.phone, address: row.address, is_default: row.is_default });
    setOpen(true);
  }
  const placeMax = 80 - (draft.kind ? `[${draft.kind}] `.length : 0);

  return <section className="personal-addresses">
    <header className="personal-address-hero">
      <div>
        <p className="personal-address-brand">{t("personal.addressBrand")}</p>
        <h1>{t("personal.addresses")}</h1>
        <p>{t("personal.addressIntro")}</p>
      </div>
      <AddressHeroArt />
    </header>
    <div className="personal-address-tip">
      <span className="personal-address-tip-icon" aria-hidden="true"><Lightbulb size={18} /></span>
      <div>
        <strong>{t("personal.addressTipTitle")}</strong>
        <p>{t("personal.addressTip")}</p>
      </div>
    </div>
    <p className="personal-address-note">{t("personal.addressHint")}</p>
    <p className="personal-integration-note">{t("personal.syncPending")}</p>
    <Button type="button" className="personal-address-create" onClick={openCreate}><Plus size={16} />{t("personal.addAddress")}</Button>
    {data.addresses.length ? <div className="personal-address-list">{data.addresses.map(row => {
      const parsed = splitAddressLabel(row.label);
      const KindIcon = parsed.kind ? kindIcons[parsed.kind] : MapPin;
      return <article className="personal-address-card" key={row.id}>
        <header>
          <span className="personal-address-icon" aria-hidden="true"><KindIcon size={18} /></span>
          <div>
            <div className="personal-address-title">
              <strong>{row.recipient}</strong>
              <span>{row.phone}</span>
              {row.is_default ? <em>{t("personal.defaultAddress")}</em> : null}
              {parsed.kind ? <em>{t(`personal.addressKinds.${parsed.kind}`)}</em> : null}
            </div>
            <p>{parsed.place}</p>
          </div>
        </header>
        <p className="personal-address-line"><MapPin size={16} aria-hidden="true" />{row.address}</p>
        <div className="personal-address-actions">
          <Button type="button" variant="outline" disabled={busy} onClick={() => openEdit(row)}>{t("personal.editAddress")}</Button>
          <Button type="button" variant="outline" disabled={busy} onClick={() => void run(async () => { await deletePersonalAddress(row.id); await refresh(); if (editing === row.id) close(); }, t("personal.deleted"))}>{t("personal.deleteAddress")}</Button>
          {row.is_default
            ? <span className="personal-address-default-set"><Star size={14} aria-hidden="true" />{t("personal.defaultSet")}</span>
            : <Button type="button" variant="outline" className="personal-address-make-default" disabled={busy} onClick={() => void run(async () => { await savePersonalAddress({ ...row, is_default: true }, row.id); await refresh(); }, t("personal.saved"))}><Star size={14} />{t("personal.makeDefault")}</Button>}
        </div>
      </article>;
    })}</div> : <p className="personal-empty">{t("personal.noAddresses")}</p>}
    <SidePanel
      open={open}
      className="personal-address-panel"
      title={t(editing ? "personal.editAddressTitle" : "personal.newAddress")}
      closeLabel={t("personal.close")}
      onClose={close}
      footer={<>
        <Button type="button" variant="outline" disabled={busy} onClick={close}>{t("personal.cancel")}</Button>
        <Button type="submit" form="personal-address-form" className="personal-address-save" disabled={busy}>{t(busy ? "personal.saving" : "personal.saveAddress")}</Button>
      </>}
    >
      <form id="personal-address-form" className="personal-address-form" onSubmit={event => {
        event.preventDefault();
        const address = { label: joinAddressLabel(draft.kind, draft.place), recipient: draft.recipient.trim(), phone: draft.phone.trim(), address: draft.address.trim(), is_default: draft.is_default };
        void run(async () => { await savePersonalAddress(address, editing); await refresh(); }, t("personal.saved")).then(saved => { if (saved) close(); });
      }}>
        <label>{t("personal.addressFields.recipient")}<span aria-hidden="true"> *</span>
          <input required maxLength={120} value={draft.recipient} placeholder={t("personal.addressPlaceholders.recipientPlaceholder")} onChange={event => setDraft({ ...draft, recipient: event.target.value })} />
        </label>
        <label>{t("personal.addressFields.phone")}<span aria-hidden="true"> *</span>
          <input required type="tel" maxLength={40} value={draft.phone} placeholder={t("personal.addressPlaceholders.phonePlaceholder")} onChange={event => setDraft({ ...draft, phone: event.target.value })} />
        </label>
        <fieldset>
          <legend>{t("personal.addressType")}</legend>
          <div className="personal-address-kinds" role="radiogroup" aria-label={t("personal.addressType")}>
            {addressKinds.map(kind => <button key={kind} type="button" role="radio" aria-checked={draft.kind === kind} className={draft.kind === kind ? "is-selected" : undefined} onClick={() => setDraft(current => ({ ...current, kind }))}>{t(`personal.addressKinds.${kind}`)}</button>)}
          </div>
        </fieldset>
        <label>{t("personal.addressFields.label")}<span aria-hidden="true"> *</span>
          <input required maxLength={placeMax} value={draft.place} placeholder={t("personal.addressPlaceholders.labelPlaceholder")} onChange={event => setDraft({ ...draft, place: event.target.value })} />
        </label>
        <label>{t("personal.addressFields.address")}<span aria-hidden="true"> *</span>
          <textarea required rows={4} maxLength={1000} value={draft.address} placeholder={t("personal.addressPlaceholders.addressPlaceholder")} onChange={event => setDraft({ ...draft, address: event.target.value })} />
        </label>
        <label className="personal-address-default"><input type="checkbox" checked={draft.is_default} onChange={event => setDraft({ ...draft, is_default: event.target.checked })} />{t("personal.defaultAddress")}</label>
      </form>
    </SidePanel>
  </section>;
}

function AddressHeroArt() {
  return <svg className="personal-address-art" viewBox="0 0 280 150" role="img" aria-hidden="true">
    <rect x="18" y="78" width="150" height="46" rx="10" fill="#d7efe2" />
    <rect x="34" y="58" width="46" height="36" rx="6" fill="#b7e0c8" />
    <rect x="92" y="48" width="58" height="46" rx="6" fill="#8fcfa8" />
    <rect x="168" y="86" width="86" height="28" rx="8" fill="#1f7a45" />
    <circle cx="190" cy="118" r="8" fill="#12382f" />
    <circle cx="232" cy="118" r="8" fill="#12382f" />
    <rect x="176" y="92" width="28" height="12" rx="3" fill="#e7f6ee" />
    <path d="M214 70c0-16 22-16 22 2 0 14-11 18-11 28h-8c0-10-11-14-11-28 0-2 2-4 8-2z" fill="#1f7a45" />
    <circle cx="225" cy="64" r="6" fill="#fff" />
  </svg>;
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
