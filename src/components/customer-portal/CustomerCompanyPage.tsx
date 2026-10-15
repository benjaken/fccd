import { useEffect, useState, type FormEvent } from "react";
import { useOutletContext } from "react-router-dom";
import { Building2, CalendarClock, Pencil, Plus, Trash2, Upload } from "lucide-react";
import type { CustomerPortalController } from "@/components/CustomerPortalPage";
import { FileDropField } from "@/components/customer-portal/FileDropField";
import { PersonalPageSkeleton } from "@/components/customer-portal/PersonalPageSkeleton";
import { ProfileHeroArt } from "@/components/customer-portal/CustomerPersonalSettingsPages";
import { Button } from "@/components/ui/button";
import { CornerNotice } from "@/components/ui/corner-notice";
import { EmptyState } from "@/components/ui/empty-state";
import { SidePanel } from "@/components/ui/side-panel";
import { supabase } from "@/lib/supabase";
import {
  fetchPortalCompany, savePortalCompanyContacts, submitPortalCompanyBr, uploadPortalCompanyBr,
  type PortalCompany, type PortalCompanyContact,
} from "@/lib/customer-portal";

const emptyContact: PortalCompanyContact = { name: "", phone: "", title: "", primary: false };
const brPattern = "[-A-Za-z0-9]{4,40}";

function contactErrorKey(error: unknown) {
  const message = error && typeof error === "object" && "message" in error ? String(error.message) : String(error ?? "");
  if (message.includes("invalid_contact")) return "portal.invalidContact";
  if (message.includes("invalid_br_attachment")) return "portal.invalidBr";
  if (message.includes("invalid_br")) return "portal.invalidBr";
  if (message.includes("customer_membership_required")) return "portal.membershipRequired";
  return "portal.operationFailed";
}

export function CustomerCompanyPage() {
  const { t, data } = useOutletContext<CustomerPortalController>();
  const admin = data?.role === "admin";
  const orgId = data?.organization.id;
  const [company, setCompany] = useState<PortalCompany | null>(null);
  const [failed, setFailed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [contactOpen, setContactOpen] = useState(false);
  const [contactIndex, setContactIndex] = useState(-1);
  const [contactDraft, setContactDraft] = useState<PortalCompanyContact>(emptyContact);
  const [brOpen, setBrOpen] = useState(false);
  const [brNumber, setBrNumber] = useState("");
  const [brExpiresOn, setBrExpiresOn] = useState("");
  const [brFile, setBrFile] = useState<File | null>(null);

  useEffect(() => {
    if (!orgId) return;
    let active = true;
    setFailed(false);
    void fetchPortalCompany(orgId)
      .then(row => { if (active) setCompany(row); })
      .catch(() => { if (active) setFailed(true); });
    return () => { active = false; };
  }, [orgId]);

  async function reload() {
    if (orgId) setCompany(await fetchPortalCompany(orgId));
  }

  function openNewContact() {
    setContactIndex(-1); setContactDraft(emptyContact); setError(""); setContactOpen(true);
  }
  function openEditContact(index: number) {
    if (!company) return;
    setContactIndex(index); setContactDraft({ ...company.contacts[index] }); setError(""); setContactOpen(true);
  }
  function closeContact() { if (!busy) setContactOpen(false); }

  async function persistContacts(next: PortalCompanyContact[], successKey: string) {
    setBusy(true); setError(""); setNotice("");
    try {
      await savePortalCompanyContacts(next, orgId);
      await reload();
      setNotice(t(successKey));
      setContactOpen(false);
    } catch (err) {
      setError(t(contactErrorKey(err)));
    } finally {
      setBusy(false);
    }
  }

  function saveContact(event: FormEvent) {
    event.preventDefault();
    if (!company) return;
    const entry: PortalCompanyContact = {
      name: contactDraft.name.trim(), phone: contactDraft.phone.trim(), title: contactDraft.title.trim(), primary: contactDraft.primary,
    };
    if (!entry.name || !entry.title || !/^\+?[0-9 -]{8,20}$/.test(entry.phone)) { setError(t("portal.invalidContact")); return; }
    const list = contactIndex >= 0
      ? company.contacts.map((contact, index) => index === contactIndex ? entry : contact)
      : [...company.contacts, entry];
    const primaryIndex = entry.primary ? (contactIndex >= 0 ? contactIndex : list.length - 1) : -1;
    const next = primaryIndex >= 0 ? list.map((contact, index) => ({ ...contact, primary: index === primaryIndex })) : list;
    void persistContacts(next, "portal.contactSaved");
  }

  function removeContact(index: number) {
    if (!company) return;
    void persistContacts(company.contacts.filter((_, position) => position !== index), "portal.contactDeleted");
  }

  function openBr() {
    if (!company) return;
    setBrNumber(company.brNumber); setBrExpiresOn(company.brExpiresOn ?? ""); setBrFile(null); setError(""); setBrOpen(true);
  }
  function closeBr() { if (!busy) setBrOpen(false); }

  async function submitBr(event: FormEvent) {
    event.preventDefault();
    if (!/^[-A-Za-z0-9]{4,40}$/.test(brNumber) || !brExpiresOn || !brFile) { setError(t("portal.invalidBr")); return; }
    setBusy(true); setError(""); setNotice("");
    try {
      const session = await supabase.auth.getSession();
      const userId = session.data.session?.user.id;
      if (!userId || !orgId) throw new Error("customer_membership_required");
      const path = await uploadPortalCompanyBr(orgId, userId, brFile);
      await submitPortalCompanyBr({ brNumber, brExpiresOn, objectPath: path }, orgId);
      await reload();
      setBrFile(null); setBrOpen(false);
      setNotice(t("portal.brSubmitted"));
    } catch (err) {
      setError(t(contactErrorKey(err)));
    } finally {
      setBusy(false);
    }
  }

  if (!company && !failed) return <PersonalPageSkeleton variant="company" label={t("portal.loading")} />;
  const cycle = company?.settlementCycle;
  return <section className="personal-profile">
    <div className="personal-profile-banner">
      <div className="personal-profile-banner-copy">
        <h1>{t("portal.company")}</h1>
        <p>{t(admin ? "portal.companyAdminHint" : "portal.companyReadOnly")}</p>
      </div>
      <div className="personal-profile-banner-art" aria-hidden="true"><ProfileHeroArt /></div>
    </div>
    {failed ? <CornerNotice message={t("portal.companyLoadFailed")} tone="error" onDismiss={() => setFailed(false)} /> : null}
    {error ? <CornerNotice message={error} tone="error" onDismiss={() => setError("")} /> : null}
    {notice ? <CornerNotice message={notice} onDismiss={() => setNotice("")} /> : null}
    {company ? <>
      <article className="personal-profile-card">
        <div className="personal-profile-identity">
          <span className="personal-profile-avatar" aria-hidden="true">{company.name.trim().slice(0, 1).toUpperCase()}</span>
          <div className="personal-profile-identity-copy">
            <h2>{company.name}</h2>
            <p><Building2 size={18} aria-hidden="true" /><span>{t("portal.brNumber")}：{company.brNumber || t("portal.companyMissing")}</span></p>
            <p><CalendarClock size={18} aria-hidden="true" /><span>{t("portal.brExpires")}：{company.brExpiresOn ? new Date(company.brExpiresOn).toLocaleDateString("zh-HK", { timeZone: "Asia/Hong_Kong" }) : t("portal.companyMissing")}</span></p>
            <p><CalendarClock size={18} aria-hidden="true" /><span>{t("portal.settlementCycle")}：{cycle ? t(`portal.cycles.${cycle}`) : t("portal.companyMissing")}</span></p>
          </div>
        </div>
        {admin ? <Button type="button" className="personal-company-action" disabled={busy} onClick={openBr}><Upload size={16} aria-hidden="true" />{t("portal.editBr")}</Button> : null}
      </article>
      {company.pendingBr ? <p className="personal-profile-note" role="status">{t("portal.brPending")}</p> : null}
      <section className="personal-profile-card" aria-labelledby="company-contacts-heading">
        <header className="personal-profile-card-head">
          <span className="personal-profile-card-icon" aria-hidden="true"><Building2 size={20} /></span>
          <div>
            <h2 id="company-contacts-heading">{t("portal.companyContacts")}</h2>
          </div>
        </header>
        {company.contacts.length === 0 ? <p>{t("portal.noCompanyContacts")}</p> : <ul className="personal-profile-toggles">
          {company.contacts.map((contact, index) => (
            <li className="personal-profile-toggle" key={`${contact.name}-${contact.phone}-${index}`}>
              <span className="personal-profile-fact-icon" aria-hidden="true"><Building2 size={18} /></span>
              <span className="personal-profile-toggle-label">{contact.name} · {contact.title} · {contact.phone}{contact.primary ? `（${t("portal.primaryContact")}）` : ""}</span>
              {admin ? <>
                <button type="button" className="personal-address-edit" disabled={busy} aria-label={t("portal.editContact")} title={t("portal.editContact")} onClick={() => openEditContact(index)}><Pencil size={16} aria-hidden="true" /></button>
                <button type="button" className="personal-address-edit personal-address-delete" disabled={busy} aria-label={t("portal.deleteContact")} title={t("portal.deleteContact")} onClick={() => removeContact(index)}><Trash2 size={16} aria-hidden="true" /></button>
              </> : null}
            </li>
          ))}
        </ul>}
        {admin ? <Button type="button" className="personal-company-action" disabled={busy} onClick={openNewContact}><Plus size={16} aria-hidden="true" />{t("portal.addContact")}</Button> : null}
      </section>
    </> : null}
    <SidePanel open={contactOpen} title={t(contactIndex >= 0 ? "portal.editContact" : "portal.addContact")} closeLabel={t("portal.close")} onClose={closeContact} className="personal-profile-panel" footer={<>
      <Button type="button" variant="outline" disabled={busy} onClick={closeContact}>{t("portal.cancel")}</Button>
      <Button type="submit" form="company-contact-form" disabled={busy}>{t("portal.save")}</Button>
    </>}>
      <form id="company-contact-form" className="personal-profile-form" onSubmit={saveContact}>
        <label>{t("portal.contactName")}<input required maxLength={80} value={contactDraft.name} onChange={event => setContactDraft({ ...contactDraft, name: event.target.value })} /></label>
        <label>{t("portal.contactPhone")}<input required type="tel" maxLength={20} value={contactDraft.phone} onChange={event => setContactDraft({ ...contactDraft, phone: event.target.value })} /></label>
        <label>{t("portal.contactTitle")}<input required maxLength={80} value={contactDraft.title} onChange={event => setContactDraft({ ...contactDraft, title: event.target.value })} /></label>
        <label className="portal-ops-switch"><span>{t("portal.primaryContact")}</span><input type="checkbox" checked={contactDraft.primary} onChange={event => setContactDraft({ ...contactDraft, primary: event.target.checked })} /></label>
      </form>
    </SidePanel>
    <SidePanel open={brOpen} title={t("portal.editBr")} description={t("portal.brReviewHint")} closeLabel={t("portal.close")} onClose={closeBr} className="personal-profile-panel" footer={<>
      <Button type="button" variant="outline" disabled={busy} onClick={closeBr}>{t("portal.cancel")}</Button>
      <Button type="submit" form="company-br-form" disabled={busy}>{t("portal.submitBr")}</Button>
    </>}>
      <form id="company-br-form" className="personal-profile-form" onSubmit={submitBr}>
        <label>{t("portal.brNumber")}<input required pattern={brPattern} value={brNumber} onChange={event => setBrNumber(event.target.value)} /></label>
        <label>{t("portal.brExpires")}<input required type="date" value={brExpiresOn} onChange={event => setBrExpiresOn(event.target.value)} /></label>
        <FileDropField label={t("portal.brAttachment")} file={brFile} onFile={setBrFile} required />
      </form>
    </SidePanel>
  </section>;
}
