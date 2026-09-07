import { AlertCircle, CheckCircle2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";

export function AlertDialog({
  open,
  title,
  message,
  tone = "success",
  confirmLabel,
  closeLabel,
  onClose,
}: {
  open: boolean;
  title: string;
  message: string;
  tone?: "success" | "error";
  confirmLabel: string;
  closeLabel: string;
  onClose: () => void;
}) {
  const Icon = tone === "error" ? AlertCircle : CheckCircle2;

  return (
    <Modal
      open={open}
      title={title}
      onClose={onClose}
      closeLabel={closeLabel}
      size="sm"
      role="alertdialog"
      className={`ui-alert-dialog is-${tone}`}
      footer={<Button type="button" onClick={onClose}>{confirmLabel}</Button>}
    >
      <div className="ui-alert-dialog-message">
        <span className="ui-alert-dialog-icon" aria-hidden="true"><Icon /></span>
        <p>{message}</p>
      </div>
    </Modal>
  );
}
