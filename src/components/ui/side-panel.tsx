import { useEffect, type ReactNode } from "react";
import { X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function SidePanel({
  open,
  title,
  description,
  onClose,
  children,
  footer,
  closeLabel,
  wide = false,
  extraWide = false,
  className,
}: {
  open: boolean;
  title: string;
  description?: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  closeLabel: string;
  wide?: boolean;
  extraWide?: boolean;
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
    <div className="side-panel-root" role="presentation">
      <button
        type="button"
        className="side-panel-backdrop"
        aria-label={closeLabel}
        onClick={onClose}
      />
      <aside
        className={cn(
          "side-panel",
          wide && "side-panel-wide",
          extraWide && "side-panel-xl",
          className,
        )}
        role="dialog"
        aria-modal="true"
        aria-labelledby="side-panel-title"
      >
        <header className="side-panel-header">
          <div>
            <h2 id="side-panel-title">{title}</h2>
            {description ? <p>{description}</p> : null}
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
        <div className="side-panel-body">{children}</div>
        {footer ? <footer className="side-panel-footer">{footer}</footer> : null}
      </aside>
    </div>
  );
}
