import { useRef, type ReactNode } from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
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
  const wasOpenRef = useRef(false);
  const returnFocusRef = useRef<HTMLElement | null>(null);

  if (open && !wasOpenRef.current && typeof document !== "undefined") {
    returnFocusRef.current =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
  }
  wasOpenRef.current = open;

  if (!open) return null;

  return (
    <DialogPrimitive.Root
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen) onClose();
      }}
    >
      <DialogPrimitive.Portal>
        <div className={cn("modal-root", rootClassName)} role="presentation">
          <DialogPrimitive.Overlay className="modal-backdrop" />
          <DialogPrimitive.Content
            className={cn("modal-panel", `modal-size-${size}`, className)}
            role={role}
            {...(!description ? { "aria-describedby": undefined } : {})}
            onEscapeKeyDown={(event) => {
              if (!closeOnEscape) event.preventDefault();
            }}
            onPointerDownOutside={(event) => {
              if (!closeOnBackdrop) event.preventDefault();
            }}
            onCloseAutoFocus={(event) => {
              const returnTarget = returnFocusRef.current;
              if (returnTarget && returnTarget !== document.body) {
                event.preventDefault();
                returnTarget.focus();
              }
            }}
          >
            <header className="modal-header">
              <div>
                <DialogPrimitive.Title asChild>
                  <h2>{title}</h2>
                </DialogPrimitive.Title>
                {description ? (
                  <DialogPrimitive.Description asChild>
                    <div className="modal-description">{description}</div>
                  </DialogPrimitive.Description>
                ) : null}
              </div>
              <DialogPrimitive.Close asChild>
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  aria-label={closeLabel}
                >
                  <X />
                </Button>
              </DialogPrimitive.Close>
            </header>
            {children ? <div className="modal-body">{children}</div> : null}
            {footer ? <footer className="modal-footer">{footer}</footer> : null}
          </DialogPrimitive.Content>
        </div>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
