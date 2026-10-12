import { useState } from "react";
import { useOutletContext } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { archivePortalAddress, savePortalAddress, updatePortalAddress } from "@/lib/customer-portal";
import type { CustomerPortalController } from "@/components/CustomerPortalPage";

const emptyAddress = { label: "", recipient: "", phone: "", address: "" };

export function CustomerAddressesPage() {
  const portal = useOutletContext<CustomerPortalController>();
  const { t, busy, address, setAddress, refresh, run } = portal;
  const data = portal.data;
  const [editingId, setEditingId] = useState<string | null>(null);
  if (!data) return null;

  function startEdit(row: (typeof data.addresses)[number]) {
    setEditingId(row.id);
    setAddress({ label: row.label, recipient: row.recipient, phone: row.phone, address: row.address });
  }

  function cancelEdit() {
    setEditingId(null);
    setAddress(emptyAddress);
  }

  return (
    <section>
      <h1>{t("portal.addresses")}</h1>
      {data.addresses.map(row => (
        <div className="portal-row" key={row.id}>
          <div>
            <strong>{row.label}</strong>
            <p>{row.recipient} · {row.phone}</p>
            <p>{row.address}</p>
          </div>
          <div className="portal-actions">
            <Button type="button" variant="outline" disabled={busy} onClick={() => startEdit(row)}>
              {t("portal.editAddress")}
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={busy}
              onClick={() => void run(async () => {
                await archivePortalAddress(row.id);
                if (editingId === row.id) cancelEdit();
                await refresh();
              }, t("portal.addressArchived"))}
            >
              {t("portal.deleteAddress")}
            </Button>
          </div>
        </div>
      ))}
      <h2>{editingId ? t("portal.editAddress") : t("portal.addAddress")}</h2>
      <form
        onSubmit={e => {
          e.preventDefault();
          void run(async () => {
            if (editingId) await updatePortalAddress(editingId, address);
            else await savePortalAddress(address);
            cancelEdit();
            await refresh();
          }, t("portal.saved"));
        }}
      >
        {(["label", "recipient", "phone", "address"] as const).map(key => (
          <label key={key}>
            {t(`portal.addressFields.${key}`)}
            <input
              required
              value={address[key]}
              onChange={e => setAddress({ ...address, [key]: e.target.value })}
              placeholder={t(`portal.addressPlaceholders.${key}`)}
            />
          </label>
        ))}
        <div className="portal-actions">
          <Button disabled={busy}>{t("portal.save")}</Button>
          {editingId ? (
            <Button type="button" variant="outline" disabled={busy} onClick={cancelEdit}>
              {t("portal.cancelEdit")}
            </Button>
          ) : null}
        </div>
      </form>
    </section>
  );
}
