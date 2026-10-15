import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { CustomerWorkspaceHeader } from "@/components/customer-portal/CustomerWorkspaceChrome";
import { Button } from "@/components/ui/button";
import { CornerNotice } from "@/components/ui/corner-notice";
import { supabase } from "@/lib/supabase";
import {
  currentOrganizationApplication,
  saveOrganizationApplication,
  submitOrganizationApplication,
  uploadOrganizationBr,
  type OrganizationApplication,
  type OrganizationApplicationAddress,
  type OrganizationApplicationContact,
} from "@/lib/customer-organization-application";

const emptyContact = (): OrganizationApplicationContact => ({ name: "", phone: "", title: "", is_primary: true });
const emptyAddress = (): OrganizationApplicationAddress => ({ label: "", recipient: "", phone: "", address: "" });

function errorKey(error: unknown) {
  const message = error && typeof error === "object" && "message" in error ? String(error.message) : String(error ?? "");
  if (message.includes("invalid_br_attachment")) return "portalApply.invalidAttachment";
  if (message.includes("invalid_br")) return "portalApply.invalidBr";
  if (message.includes("invalid_contact")) return "portalApply.invalidContact";
  if (message.includes("invalid_address")) return "portalApply.invalidAddress";
  if (message.includes("invalid_application")) return "portalApply.invalidApplication";
  if (message.includes("br_expired")) return "portalApply.brExpired";
  if (message.includes("application_locked")) return "portalApply.locked";
  if (message.includes("application_already_approved")) return "portalApply.alreadyApproved";
  if (message.includes("membership_exists")) return "portalApply.membershipExists";
  if (message.includes("email_verification_required")) return "portal.verifyEmail";
  return "portalApply.operationFailed";
}

export function CustomerOrganizationApplicationPage({ loggingOut, onLogout }: { loggingOut?: boolean; onLogout: () => void }) {
  const { t } = useTranslation();
  const [userId, setUserId] = useState("");
  const [application, setApplication] = useState<OrganizationApplication | null>(null);
  const [companyName, setCompanyName] = useState("");
  const [brNumber, setBrNumber] = useState("");
  const [brExpiresOn, setBrExpiresOn] = useState("");
  const [contacts, setContacts] = useState<OrganizationApplicationContact[]>([emptyContact()]);
  const [addresses, setAddresses] = useState<OrganizationApplicationAddress[]>([emptyAddress()]);
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const applyLoaded = useCallback((row: OrganizationApplication | null) => {
    setApplication(row);
    setCompanyName(row?.company_name ?? "");
    setBrNumber(row?.br_number ?? "");
    setBrExpiresOn(row?.br_expires_on ?? "");
    setContacts(row?.contacts.length ? row.contacts : [emptyContact()]);
    setAddresses(row?.addresses.length ? row.addresses : [emptyAddress()]);
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const session = await supabase.auth.getSession();
      setUserId(session.data.session?.user.id ?? "");
      applyLoaded(await currentOrganizationApplication());
    } catch (err) {
      setError(t(errorKey(err)));
    } finally {
      setLoading(false);
    }
  }, [applyLoaded, t]);

  useEffect(() => { void load(); }, [load]);

  const locked = application?.status === "pending_review" || application?.status === "approved";
  const completeContacts = contacts.filter(contact => contact.name.trim() && contact.phone.trim() && contact.title.trim());
  const completeAddresses = addresses.filter(address => address.label.trim() && address.recipient.trim() && address.phone.trim() && address.address.trim());

  async function persist(submit: boolean) {
    if (busy || locked || !userId) return;
    if (submit && (completeContacts.length < 1 || completeAddresses.length < 1 || (!file && !application?.br_object_path))) {
      setError(t("portalApply.invalidApplication"));
      return;
    }
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const primaryCount = completeContacts.filter(contact => contact.is_primary).length;
      const payloadContacts = completeContacts.map((contact, index) => ({
        ...contact,
        is_primary: primaryCount === 1 ? contact.is_primary : index === 0,
      }));
      const id = await saveOrganizationApplication({
        companyName,
        brNumber,
        brExpiresOn: brExpiresOn || null,
        contacts: payloadContacts,
        addresses: completeAddresses,
      });
      if (file) {
        const path = await uploadOrganizationBr(id, userId, file);
        await saveOrganizationApplication({
          companyName,
          brNumber,
          brExpiresOn: brExpiresOn || null,
          brObjectPath: path,
          contacts: payloadContacts,
          addresses: completeAddresses,
        });
      }
      if (submit) await submitOrganizationApplication();
      setFile(null);
      applyLoaded(await currentOrganizationApplication());
      setNotice(t(submit ? "portalApply.submitted" : "portalApply.saved"));
    } catch (err) {
      setError(t(errorKey(err)));
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="customer-portal">
      <CustomerWorkspaceHeader mode="organization" personal={false} loggingOut={loggingOut} onLogout={onLogout} />
      <section>
        <h1>{t("portalApply.title")}</h1>
        <p>{t("portalApply.description")}</p>
        {loading ? <p role="status">{t("portal.loading")}</p> : null}
        {error ? <p role="alert">{error}</p> : null}
        {notice ? <CornerNotice message={notice} onDismiss={() => setNotice("")} /> : null}
        {application ? <p role="status">{t(`portalApply.status.${application.status}`)}{application.review_reason ? ` — ${application.review_reason}` : ""}</p> : null}
        {application?.status === "approved" ? <p>{t("portalApply.approvedHint")}</p> : null}
        {!loading && !locked ? (
          <form onSubmit={event => { event.preventDefault(); void persist(true); }}>
            <label>{t("portalApply.companyName")}<input value={companyName} onChange={event => setCompanyName(event.target.value)} required maxLength={120} /></label>
            <label>{t("portalApply.brNumber")}<input value={brNumber} onChange={event => setBrNumber(event.target.value)} required pattern="[A-Za-z0-9-]{4,40}" /></label>
            <label>{t("portalApply.brExpiresOn")}<input type="date" value={brExpiresOn} onChange={event => setBrExpiresOn(event.target.value)} required /></label>
            <label>{t("portalApply.attachment")}<input type="file" accept=".jpg,.jpeg,.png,.pdf,image/jpeg,image/png,application/pdf" onChange={event => setFile(event.target.files?.[0] ?? null)} /></label>
            {application?.br_object_path ? <p>{t("portalApply.attachmentReady")}</p> : null}
            <h2>{t("portalApply.contacts")}</h2>
            {contacts.map((contact, index) => (
              <div className="portal-row" key={`contact-${index}`}>
                <label>{t("portalApply.contactName")}<input value={contact.name} onChange={event => setContacts(rows => rows.map((row, rowIndex) => rowIndex === index ? { ...row, name: event.target.value } : row))} /></label>
                <label>{t("portalApply.contactPhone")}<input value={contact.phone} onChange={event => setContacts(rows => rows.map((row, rowIndex) => rowIndex === index ? { ...row, phone: event.target.value } : row))} /></label>
                <label>{t("portalApply.contactTitle")}<input value={contact.title} onChange={event => setContacts(rows => rows.map((row, rowIndex) => rowIndex === index ? { ...row, title: event.target.value } : row))} /></label>
                <label><input type="radio" name="primary-contact" checked={contact.is_primary} onChange={() => setContacts(rows => rows.map((row, rowIndex) => ({ ...row, is_primary: rowIndex === index })))} />{t("portalApply.primaryContact")}</label>
              </div>
            ))}
            <Button type="button" variant="outline" onClick={() => setContacts(rows => rows.length >= 10 ? rows : [...rows, { ...emptyContact(), is_primary: false }])}>{t("portalApply.addContact")}</Button>
            <h2>{t("portalApply.addresses")}</h2>
            {addresses.map((address, index) => (
              <div className="portal-row" key={`address-${index}`}>
                <label>{t("portal.addressFields.label")}<input value={address.label} onChange={event => setAddresses(rows => rows.map((row, rowIndex) => rowIndex === index ? { ...row, label: event.target.value } : row))} /></label>
                <label>{t("portal.addressFields.recipient")}<input value={address.recipient} onChange={event => setAddresses(rows => rows.map((row, rowIndex) => rowIndex === index ? { ...row, recipient: event.target.value } : row))} /></label>
                <label>{t("portal.addressFields.phone")}<input value={address.phone} onChange={event => setAddresses(rows => rows.map((row, rowIndex) => rowIndex === index ? { ...row, phone: event.target.value } : row))} /></label>
                <label>{t("portal.addressFields.address")}<input value={address.address} onChange={event => setAddresses(rows => rows.map((row, rowIndex) => rowIndex === index ? { ...row, address: event.target.value } : row))} /></label>
              </div>
            ))}
            <Button type="button" variant="outline" onClick={() => setAddresses(rows => rows.length >= 20 ? rows : [...rows, emptyAddress()])}>{t("portalApply.addAddress")}</Button>
            <div className="portal-actions">
              <Button type="button" variant="outline" disabled={busy} onClick={() => void persist(false)}>{t("portalApply.saveDraft")}</Button>
              <Button type="submit" disabled={busy}>{t("portalApply.submit")}</Button>
            </div>
          </form>
        ) : null}
      </section>
    </main>
  );
}
