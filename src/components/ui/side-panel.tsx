import { useEffect, useRef, type ReactNode } from "react";
import { X } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { cn } from "@/lib/utils";

export function SidePanel({
  open,
  title,
  description,
  onClose,
  children,
  headerActions,
  footer,
  closeLabel,
  wide = false,
  extraWide = false,
  half = false,
  className,
}: {
  open: boolean;
  title: string;
  description?: string;
  onClose: () => void;
  children: ReactNode;
  headerActions?: ReactNode;
  footer?: ReactNode;
  closeLabel: string;
  wide?: boolean;
  extraWide?: boolean;
  half?: boolean;
  className?: string;
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

  useEffect(() => {
    if (!open) return;
    const previousDocumentOverflow = document.documentElement.style.overflow;
    const previousBodyOverflow = document.body.style.overflow;
    document.documentElement.style.overflow = "hidden";
    document.body.style.overflow = "hidden";
    return () => {
      document.documentElement.style.overflow = previousDocumentOverflow;
      document.body.style.overflow = previousBodyOverflow;
    };
  }, [open]);

  if (!open) return null;

  return (
    <Sheet
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen) onClose();
      }}
    >
      <SheetContent
        className={cn(
          wide && "side-panel-wide",
          extraWide && "side-panel-xl",
          half && "side-panel-half",
          className,
        )}
        {...(!description ? { "aria-describedby": undefined } : {})}
        onCloseAutoFocus={(event) => {
          const returnTarget = returnFocusRef.current;
          if (returnTarget && returnTarget !== document.body) {
            event.preventDefault();
            returnTarget.focus();
          }
        }}
      >
        <SheetHeader>
          <div>
            <SheetTitle asChild><h2>{title}</h2></SheetTitle>
            {description ? (
              <SheetDescription asChild><p>{description}</p></SheetDescription>
            ) : null}
          </div>
          <div className="side-panel-header-controls">
            {headerActions ? (
              <div className="side-panel-header-actions">{headerActions}</div>
            ) : null}
            <SheetClose asChild>
              <Button
                type="button"
                variant="outline"
                size="icon"
                aria-label={closeLabel}
              >
                <X />
              </Button>
            </SheetClose>
          </div>
        </SheetHeader>
        <div className="side-panel-body">{children}</div>
        {footer ? <SheetFooter>{footer}</SheetFooter> : null}
      </SheetContent>
    </Sheet>
  );
}
