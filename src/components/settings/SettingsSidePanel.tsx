import { useEffect, type ReactNode } from "react";
import { X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function SettingsSidePanel({
  open,
  title,
  description,
  onClose,
  children,
  footer,
  wide = false,
}: {
  open: boolean;
  title: string;
  description?: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  wide?: boolean;
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
    <div className="settings-side-panel-root" role="presentation">
      <button
        type="button"
        className="settings-side-panel-backdrop"
        aria-label="Close"
        onClick={onClose}
      />
      <aside
        className={cn("settings-side-panel", wide && "settings-side-panel-wide")}
        role="dialog"
        aria-modal="true"
        aria-labelledby="settings-side-panel-title"
      >
        <header className="settings-side-panel-header">
          <div>
            <h2 id="settings-side-panel-title">{title}</h2>
            {description ? <p>{description}</p> : null}
          </div>
          <Button
            type="button"
            variant="outline"
            size="icon"
            onClick={onClose}
            aria-label="Close"
          >
            <X />
          </Button>
        </header>
        <div className="settings-side-panel-body">{children}</div>
        {footer ? (
          <footer className="settings-side-panel-footer">{footer}</footer>
        ) : null}
      </aside>
    </div>
  );
}
