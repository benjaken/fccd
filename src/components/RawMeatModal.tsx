import { useEffect, type ReactNode } from "react";
import { X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function RawMeatModal({
  open,
  title,
  onClose,
  closeLabel,
  children,
  footer,
  className,
}: {
  open: boolean;
  title: string;
  onClose: () => void;
  closeLabel: string;
  children: ReactNode;
  footer?: ReactNode;
  className?: string;
}) {
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose, open]);

  if (!open) return null;

  return (
    <div className="raw-meat-options-modal-root" role="presentation">
      <button
        type="button"
        className="raw-meat-options-modal-backdrop"
        aria-label={closeLabel}
        onClick={onClose}
      />
      <div
        className={cn("raw-meat-options-modal panel raw-meat-form-modal", className)}
        role="dialog"
        aria-modal="true"
        aria-labelledby="raw-meat-form-title"
      >
        <header className="raw-meat-form-modal-header">
          <h2 id="raw-meat-form-title">{title}</h2>
          <Button
            type="button"
            variant="outline"
            size="icon"
            onClick={onClose}
            aria-label={closeLabel}
          >
            <X />
          </Button>
        </header>
        <div className="raw-meat-form-modal-body">{children}</div>
        {footer ? (
          <footer className="raw-meat-form-modal-footer">{footer}</footer>
        ) : null}
      </div>
    </div>
  );
}
