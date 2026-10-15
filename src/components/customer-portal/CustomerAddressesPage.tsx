import { useEffect, useRef, useState } from "react";
import { useOutletContext } from "react-router-dom";
import { Info, MapPin, MoreVertical, Pencil, Phone, Plus, Star, Trash2, UserRound, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { SidePanel } from "@/components/ui/side-panel";
import { archivePortalAddress, archivePortalDeliveryPoint, savePortalAddress, savePortalDeliveryPoint, splitPortalAddressLabel, updatePortalAddress, type PortalSnapshot } from "@/lib/customer-portal";
import type { CustomerPortalController } from "@/components/CustomerPortalPage";

type PointDraft = { id: string | null; name: string };
type AddressDraft = { points: PointDraft[]; recipient: string; phone: string; address: string; is_default: boolean };
const emptyPoints = (): PointDraft[] => [{ id: null, name: "" }];
const emptyDraft = (): AddressDraft => ({ points: emptyPoints(), recipient: "", phone: "", address: "", is_default: false });
const addressLimit = 1000;

export function CustomerAddressesPage() {
  const portal = useOutletContext<CustomerPortalController>();
  const { t, busy, refresh, run } = portal;
  const data = portal.data;
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState<AddressDraft>(emptyDraft);
  const [open, setOpen] = useState(false);
  const [menuId, setMenuId] = useState<string | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!menuId) return;
    function onPointer(event: PointerEvent) {
      if (!menuRef.current?.contains(event.target as Node)) setMenuId(null);
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") setMenuId(null);
    }
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [menuId]);
  if (!data) return null;

  function close() {
    if (busy) return;
    setDraft(emptyDraft()); setEditing(null); setOpen(false);
  }
  function openCreate() { setMenuId(null); setEditing(null); setDraft(emptyDraft()); setOpen(true); }
  function openEdit(row: PortalSnapshot["addresses"][number]) {
    setMenuId(null);
    setEditing(row.id);
    setDraft({
      points: row.delivery_points.length ? row.delivery_points.map(point => ({ id: point.id, name: point.name })) : emptyPoints(),
      recipient: row.recipient, phone: row.phone, address: row.address, is_default: row.is_default,
    });
    setOpen(true);
  }
  function setPointName(index: number, name: string) {
    setDraft(current => ({ ...current, points: current.points.map((point, i) => i === index ? { ...point, name } : point) }));
  }
  function addPoint() { setDraft(current => ({ ...current, points: [...current.points, { id: null, name: "" }] })); }
  function removePoint(index: number) {
    setDraft(current => ({ ...current, points: current.points.length > 1 ? current.points.filter((_, i) => i !== index) : emptyPoints() }));
  }

  const points = draft.points.map(point => ({ id: point.id, name: point.name.trim() })).filter(point => point.name.length > 0);
  const canSubmit = !busy && points.length > 0 && draft.recipient.trim().length > 0 && draft.phone.trim().length > 0 && draft.address.trim().length > 0;
  const detailLimit = Math.min(1000, Math.max(addressLimit, draft.address.length));

  async function submit() {
    const base = { label: points[0].name.slice(0, 80), recipient: draft.recipient.trim(), phone: draft.phone.trim(), address: draft.address.trim(), is_default: draft.is_default };
    if (editing) {
      const existing = data!.addresses.find(address => address.id === editing)?.delivery_points ?? [];
      const keep = new Set(points.map(point => point.id).filter(Boolean));
      await updatePortalAddress(editing, base, data!.organization.id);
      for (const point of existing) if (!keep.has(point.id)) await archivePortalDeliveryPoint(point.id, data!.organization.id);
      for (const point of points) await savePortalDeliveryPoint(point.id ? { id: point.id, addressId: editing, name: point.name } : { addressId: editing, name: point.name }, data!.organization.id);
    } else {
      const id = await savePortalAddress(base, data!.organization.id);
      // The new address is seeded with a delivery point named after the label, so only the rest are created.
      for (const point of points.slice(1)) await savePortalDeliveryPoint({ addressId: id, name: point.name }, data!.organization.id);
    }
    await refresh();
  }

  return <section className="personal-addresses">
    <header className="personal-address-hero">
      <div>
        <h1>{t("portal.addresses")}</h1>
        <p>{t("portal.addressIntro")}</p>
        <Button type="button" className="personal-address-create" onClick={openCreate}><Plus size={22} />{t("portal.addAddress")}</Button>
      </div>
      <img className="personal-address-art" src="/assets/customer-personal/address-scooter-fc.png" alt="" aria-hidden="true" />
    </header>
    <h2 className="personal-address-list-heading">{t("portal.myAddresses")}</h2>
    {data.addresses.length ? <div className="personal-address-list">{[...data.addresses].sort((a, b) => Number(b.is_default) - Number(a.is_default)).map(row => {
      const parsed = splitPortalAddressLabel(row.label);
      const title = row.is_default
        ? t("portal.defaultAddress")
        : parsed.place || (parsed.kind ? t(`portal.addressKinds.${parsed.kind}`) : row.recipient);
      return <article className={`personal-address-card${row.is_default ? " is-default" : ""}`} key={row.id}>
        <div className="personal-address-card-main">
          <span className="personal-address-icon" aria-hidden="true"><MapPin size={18} /></span>
          <div className="personal-address-copy">
            <div className="personal-address-title">
              <strong>{title}</strong>
              {row.is_default ? <em>{t("portal.defaultBadge")}</em> : null}
            </div>
            <p className="personal-address-contact"><strong>{row.recipient}</strong><span>{row.phone}</span></p>
            <p className="personal-address-location"><MapPin size={20} aria-hidden="true" /><span>{row.address}</span></p>
          </div>
        </div>
        <div className="personal-address-points">
          <span className="personal-address-points-title">{t("portal.deliveryPoints")}</span>
          {row.delivery_points.length ? <ul className="personal-address-points-list">{row.delivery_points.map(point => (
            <li key={point.id}><span>{point.name}</span></li>
          ))}</ul> : <EmptyState className="personal-address-points-empty" title={t("portal.noDeliveryPoints")} />}
        </div>
        <div className="personal-address-actions">
          <button type="button" className="personal-address-edit" disabled={busy} onClick={() => openEdit(row)}><Pencil size={16} aria-hidden="true" />{t("portal.editAddress")}</button>
          <div className="personal-address-menu-wrap" ref={menuId === row.id ? menuRef : undefined}>
            <button type="button" className="personal-address-menu-trigger" aria-haspopup="menu" aria-expanded={menuId === row.id} aria-label={t("portal.addressMenu")} disabled={busy} onClick={() => setMenuId(current => current === row.id ? null : row.id)}><MoreVertical size={18} /></button>
            {menuId === row.id ? <div className="personal-address-menu" role="menu">
              {row.is_default ? null : <button type="button" role="menuitem" disabled={busy} onClick={() => { setMenuId(null); void run(async () => { await updatePortalAddress(row.id, { ...row, is_default: true }, data.organization.id); await refresh(); }, t("portal.saved")); }}><Star size={16} aria-hidden="true" />{t("portal.makeDefault")}</button>}
              <button type="button" role="menuitem" disabled={busy} onClick={() => { setMenuId(null); void run(async () => { await archivePortalAddress(row.id, data.organization.id); if (editing === row.id) close(); await refresh(); }, t("portal.addressArchived")); }}><Trash2 size={16} aria-hidden="true" />{t("portal.deleteAddress")}</button>
            </div> : null}
          </div>
        </div>
      </article>;
    })}</div> : <EmptyState title={t("portal.noAddresses")} />}

    <SidePanel
      open={open}
      className="personal-address-panel"
      title={t(editing ? "portal.editAddressTitle" : "portal.newAddress")}
      closeLabel={t("portal.close")}
      onClose={close}
      footer={<>
        <Button type="button" variant="ghost" disabled={busy} onClick={close}>{t("portal.cancel")}</Button>
        <Button type="submit" form="portal-address-form" className="personal-address-save" disabled={!canSubmit}>{t(busy ? "portal.saving" : "portal.saveAddress")}</Button>
      </>}
    >
      <form id="portal-address-form" className="personal-address-form" onSubmit={event => {
        event.preventDefault();
        if (!canSubmit) return;
        void run(submit, t("portal.saved")).then(saved => { if (saved) close(); });
      }}>
        <section className="personal-address-step" aria-labelledby="portal-address-contact">
          <header>
            <span className="personal-address-step-index" aria-hidden="true">01</span>
            <div>
              <h3 id="portal-address-contact">{t("portal.addressSteps.contact")}</h3>
              <p>{t("portal.addressSteps.contactHint")}</p>
            </div>
          </header>
          <div className="personal-address-pair">
            <label>{t("portal.addressFields.recipient")}
              <span className="personal-address-field"><UserRound size={16} aria-hidden="true" /><input required maxLength={120} autoComplete="name" value={draft.recipient} placeholder={t("portal.addressPlaceholders.recipient")} onChange={event => setDraft({ ...draft, recipient: event.target.value })} /></span>
            </label>
            <label>{t("portal.addressFields.phone")}
              <span className="personal-address-field"><Phone size={16} aria-hidden="true" /><input required type="tel" maxLength={40} autoComplete="tel" inputMode="tel" value={draft.phone} placeholder={t("portal.addressPlaceholders.phone")} onChange={event => setDraft({ ...draft, phone: event.target.value })} /></span>
            </label>
          </div>
        </section>
        <section className="personal-address-step" aria-labelledby="portal-address-points">
          <header>
            <span className="personal-address-step-index" aria-hidden="true">02</span>
            <div>
              <h3 id="portal-address-points">{t("portal.deliveryPoints")}</h3>
              <p>{t("portal.deliveryPointsHint")}</p>
            </div>
          </header>
          <div className="personal-address-points-edit">
            {draft.points.map((point, index) => (
              <div className="personal-address-point-row" key={point.id ?? `new-${index}`}>
                <span className="personal-address-field"><MapPin size={16} aria-hidden="true" /><input maxLength={80} value={point.name} aria-label={index === 0 ? t("portal.deliveryPointName") : `${t("portal.deliveryPointName")} ${index + 1}`} placeholder={t("portal.deliveryPointPlaceholder")} onChange={event => setPointName(index, event.target.value)} /></span>
                <button type="button" aria-label={t("portal.removeDeliveryPoint", { name: point.name.trim() || index + 1 })} disabled={busy} onClick={() => removePoint(index)}><X size={16} aria-hidden="true" /></button>
              </div>
            ))}
            <Button type="button" variant="outline" disabled={busy || draft.points.length >= 20} onClick={addPoint}><Plus size={16} aria-hidden="true" />{t("portal.addDeliveryPoint")}</Button>
          </div>
        </section>
        <section className="personal-address-step">
          <header>
            <span className="personal-address-step-index" aria-hidden="true">03</span>
            <div>
              <h3>{t("portal.addressFields.address")}</h3>
              <p>{t("portal.addressSteps.detailHint")}</p>
            </div>
          </header>
          <label>
            <span className="personal-sr">{t("portal.addressFields.address")}</span>
            <span className="personal-address-field">
              <MapPin size={16} aria-hidden="true" />
              <textarea required rows={4} maxLength={detailLimit} aria-describedby="portal-address-count" value={draft.address} placeholder={t("portal.addressPlaceholders.address")} onChange={event => setDraft({ ...draft, address: event.target.value.slice(0, detailLimit) })} />
              <span id="portal-address-count" className="personal-address-count">{Math.min(draft.address.length, detailLimit)}/{detailLimit}</span>
            </span>
          </label>
        </section>
        <p className="personal-address-notice"><Info size={18} aria-hidden="true" /><span><strong>{t("portal.addressNoticeTitle")}</strong><span>{t("portal.addressNotice")}</span></span></p>
        <label className="personal-address-default">
          <input type="checkbox" checked={draft.is_default} onChange={event => setDraft({ ...draft, is_default: event.target.checked })} />
          <span><strong>{t("portal.setDefault")}</strong><small>{t("portal.defaultAddressHint")}</small></span>
        </label>
      </form>
    </SidePanel>
  </section>;
}
