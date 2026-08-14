import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import type { RawMeatItemOption } from "@/lib/raw-meat-inventory";

type ItemFlagsSaver = (
  itemId: string,
  flags: { canShipDirectly: boolean; isActive: boolean },
) => Promise<void>;

export function RawMeatOptionsModal({
  open,
  items,
  onClose,
  onSaveFlags,
}: {
  open: boolean;
  items: RawMeatItemOption[];
  onClose: () => void;
  onSaveFlags: ItemFlagsSaver;
}) {
  const { t } = useTranslation();
  const [rows, setRows] = useState(items);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setRows(items);
      setError(null);
      setSavingId(null);
    }
  }, [items, open]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose, open]);

  if (!open) return null;

  const updateFlags = async (
    itemId: string,
    patch: Partial<Pick<RawMeatItemOption, "canShipDirectly" | "isActive">>,
  ) => {
    const current = rows.find((row) => row.id === itemId);
    if (!current) return;
    const next = {
      canShipDirectly: patch.canShipDirectly ?? current.canShipDirectly,
      isActive: patch.isActive ?? current.isActive,
    };
    setRows((list) =>
      list.map((row) => (row.id === itemId ? { ...row, ...next } : row)),
    );
    setSavingId(itemId);
    setError(null);
    try {
      await onSaveFlags(itemId, next);
    } catch (saveError) {
      setRows((list) =>
        list.map((row) => (row.id === itemId ? current : row)),
      );
      setError(
        saveError instanceof Error
          ? saveError.message
          : t("rawMeatInventory.optionsSaveError"),
      );
    } finally {
      setSavingId(null);
    }
  };

  return (
    <div className="raw-meat-options-modal-root" role="presentation">
      <button
        type="button"
        className="raw-meat-options-modal-backdrop"
        aria-label={t("rawMeatInventory.closeOptions")}
        onClick={onClose}
      />
      <div
        className="raw-meat-options-modal panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby="raw-meat-options-title"
      >
        <header className="raw-meat-options-modal-header">
          <h2 id="raw-meat-options-title">{t("rawMeatInventory.items")}</h2>
          <Button
            type="button"
            variant="outline"
            size="icon"
            onClick={onClose}
            aria-label={t("rawMeatInventory.closeOptions")}
          >
            <X />
          </Button>
        </header>

        {error ? (
          <p className="raw-meat-options-modal-error" role="alert">
            {error}
          </p>
        ) : null}

        <div className="raw-meat-options-table-wrap">
          <table className="raw-meat-options-table">
            <thead>
              <tr>
                <th>{t("rawMeatInventory.optionsColumns.sort")}</th>
                <th>{t("rawMeatInventory.optionsColumns.name")}</th>
                <th>{t("rawMeatInventory.optionsColumns.canShip")}</th>
                <th>{t("rawMeatInventory.optionsColumns.active")}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id}>
                  <td>
                    {row.sortOrder === null
                      ? ""
                      : Number.isInteger(row.sortOrder)
                        ? String(row.sortOrder)
                        : String(row.sortOrder)}
                  </td>
                  <td>
                    <strong>{row.name}</strong>
                  </td>
                  <td>
                    <Switch
                      checked={row.canShipDirectly}
                      disabled={savingId === row.id}
                      onCheckedChange={(checked) => {
                        void updateFlags(row.id, { canShipDirectly: checked });
                      }}
                      aria-label={`${row.name} ${t("rawMeatInventory.optionsColumns.canShip")}`}
                    />
                  </td>
                  <td>
                    <Switch
                      checked={row.isActive}
                      disabled={savingId === row.id}
                      onCheckedChange={(checked) => {
                        void updateFlags(row.id, { isActive: checked });
                      }}
                      aria-label={`${row.name} ${t("rawMeatInventory.optionsColumns.active")}`}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
