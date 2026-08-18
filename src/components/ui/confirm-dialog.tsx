import type { ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";

export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel,
  cancelLabel,
  onConfirm,
  onCancel,
  busy = false,
  busyLabel,
  variant = "default",
  children,
  closeLabel,
}: {
  open: boolean;
  title: string;
  description?: ReactNode;
  confirmLabel: string;
  cancelLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
  busy?: boolean;
  busyLabel?: string;
  variant?: "default" | "destructive";
  children?: ReactNode;
  closeLabel: string;
}) {
  return (
    <Modal
      open={open}
      title={title}
      description={description}
      onClose={onCancel}
      closeLabel={closeLabel}
      size="sm"
      role="alertdialog"
      closeOnBackdrop={!busy}
      closeOnEscape={!busy}
    >
      {children ? <div className="modal-result">{children}</div> : null}
      <div className="modal-actions">
        <Button
          type="button"
          variant="outline"
          onClick={onCancel}
          disabled={busy}
        >
          {cancelLabel}
        </Button>
        <Button
          type="button"
          variant={variant}
          onClick={onConfirm}
          disabled={busy}
        >
          {busy && busyLabel ? busyLabel : confirmLabel}
        </Button>
      </div>
    </Modal>
  );
}
