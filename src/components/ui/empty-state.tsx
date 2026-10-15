import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import "./empty-state.css";

export interface EmptyStateProps {
  title: ReactNode;
  description?: ReactNode;
  illustration?: ReactNode;
  action?: ReactNode;
  className?: string;
}

/** Shared empty state. Pass localized copy; omit illustration to use the crisp default box. */
export function EmptyState({ title, description, illustration, action, className }: EmptyStateProps) {
  return <div className={cn("empty-state", className)} role="status">
    {illustration === undefined ? <img className="empty-state-illustration" src="/assets/empty-box.svg" alt="" width={240} height={220} /> : illustration}
    <p className="empty-state-title">{title}</p>
    {description ? <p className="empty-state-description">{description}</p> : null}
    {action ? <div className="empty-state-action">{action}</div> : null}
  </div>;
}
