import { type ComponentPropsWithoutRef, type ReactNode } from "react";
import { PanelLeftClose, PanelLeftOpen } from "lucide-react";

import { cn } from "@/lib/utils";

export function RecordSidebarToggle({
  collapsed,
  onToggle,
  hideLabel,
  showLabel,
  className,
}: {
  collapsed: boolean;
  onToggle: () => void;
  hideLabel: string;
  showLabel: string;
  className?: string;
}) {
  return (
    <button
      type="button"
      className={cn("record-sidebar-toggle", collapsed && "is-reopen", className)}
      aria-expanded={!collapsed}
      aria-label={collapsed ? showLabel : hideLabel}
      onClick={onToggle}
    >
      {collapsed ? <PanelLeftOpen /> : <PanelLeftClose />}
    </button>
  );
}

export function CollapsibleRecordSidebar({
  collapsed,
  onToggle,
  hideLabel,
  showLabel,
  className,
  children,
  ...asideProps
}: {
  collapsed: boolean;
  onToggle: () => void;
  hideLabel: string;
  showLabel: string;
  children: ReactNode;
} & ComponentPropsWithoutRef<"aside">) {
  return (
    <div className={cn("record-sidebar-slot", collapsed && "is-collapsed")}>
      <aside className={className} {...asideProps} aria-hidden={collapsed || undefined}>
        {children}
      </aside>
      {collapsed ? (
        <RecordSidebarToggle
          collapsed
          onToggle={onToggle}
          hideLabel={hideLabel}
          showLabel={showLabel}
        />
      ) : null}
    </div>
  );
}
