import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

import { SidePanel } from "@/components/ui/side-panel";
import { Switch } from "@/components/ui/switch";
import type { PreparedMeatItemOption } from "@/lib/prepared-meat-inventory";

type ItemFlagsSaver = (itemId: string, isActive: boolean) => Promise<void>;

export function PreparedMeatOptionsModal({
  open,
  items,
  onClose,
  onSaveFlags,
}: {
  open: boolean;
  items: PreparedMeatItemOption[];
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

  const updateActive = async (itemId: string, isActive: boolean) => {
    const current = rows.find((row) => row.id === itemId);
    if (!current || current.isActive === isActive) return;
    setRows((list) =>
      list.map((row) => (row.id === itemId ? { ...row, isActive } : row)),
    );
    setSavingId(itemId);
    setError(null);
    try {
      await onSaveFlags(itemId, isActive);
    } catch (saveError) {
      setRows((list) =>
        list.map((row) => (row.id === itemId ? current : row)),
      );
      setError(
        saveError instanceof Error
          ? saveError.message
          : t("preparedMeatInventory.optionsSaveError"),
      );
    } finally {
      setSavingId(null);
    }
  };

  return (
    <SidePanel
      open={open}
      title={t("preparedMeatInventory.items")}
      onClose={onClose}
      closeLabel={t("preparedMeatInventory.closeOptions")}
      wide
    >
      {error ? (
        <p className="raw-meat-options-panel-error" role="alert">
          {error}
        </p>
      ) : null}

      <div className="raw-meat-options-table-wrap">
        <table className="raw-meat-options-table">
          <thead>
            <tr>
              <th>{t("preparedMeatInventory.optionsColumns.sort")}</th>
              <th>{t("preparedMeatInventory.optionsColumns.name")}</th>
              <th>{t("preparedMeatInventory.optionsColumns.active")}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id}>
                <td>
                  {row.sortOrder === null ? "" : String(row.sortOrder)}
                </td>
                <td>
                  <strong>{row.name}</strong>
                </td>
                <td>
                  <Switch
                    checked={row.isActive}
                    disabled={savingId === row.id}
                    onCheckedChange={(checked) => {
                      void updateActive(row.id, checked);
                    }}
                    aria-label={`${row.name} ${t("preparedMeatInventory.optionsColumns.active")}`}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </SidePanel>
  );
}
