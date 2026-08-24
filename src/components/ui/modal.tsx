import { useEffect, useId, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function Modal({
  open,
  title,
  description,
  onClose,
  children,
  footer,
  closeLabel,
  size = "md",
  role = "dialog",
  closeOnBackdrop = true,
  closeOnEscape = true,
  className,
  rootClassName,
}: {
  open: boolean;
  title: string;
  description?: ReactNode;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  closeLabel: string;
  size?: "sm" | "md" | "lg";
  role?: "dialog" | "alertdialog";
  closeOnBackdrop?: boolean;
  closeOnEscape?: boolean;
  className?: string;
  rootClassName?: string;
}) {
  const titleId = useId();
  const descriptionId = useId();

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && closeOnEscape) onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [closeOnEscape, onClose, open]);

  if (!open) return null;

  const handleBackdropClick = () => {
    if (closeOnBackdrop) onClose();
  };

  return createPortal(
    <div className={cn("modal-root", rootClassName)} role="presentation">
      <button
        type="button"
        className="modal-backdrop"
        aria-label={closeLabel}
        onClick={handleBackdropClick}
        tabIndex={-1}
      />
      <section
        className={cn("modal-panel", `modal-size-${size}`, className)}
        role={role}
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={description ? descriptionId : undefined}
      >
        <header className="modal-header">
          <div>
            <h2 id={titleId}>{title}</h2>
            {description ? (
              <div id={descriptionId} className="modal-description">
                {description}
              </div>
            ) : null}
          </div>
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
        {children ? <div className="modal-body">{children}</div> : null}
        {footer ? <footer className="modal-footer">{footer}</footer> : null}
      </section>
    </div>,
    document.body,
  );
}
