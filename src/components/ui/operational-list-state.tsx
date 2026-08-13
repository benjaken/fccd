import type { ReactNode } from "react";
import { RefreshCw, type LucideIcon } from "lucide-react";

import { Button } from "@/components/ui/button";

export function OperationalListState({
  icon: Icon,
  title,
  description,
  loading = false,
  retryLabel,
  onRetry,
}: {
  icon: LucideIcon;
  title: ReactNode;
  description?: ReactNode;
  loading?: boolean;
  retryLabel?: string;
  onRetry?: () => void;
}) {
  return (
    <div
      className="operational-list-state"
      role={loading ? "status" : undefined}
    >
      {loading ? <RefreshCw className="spin" /> : <Icon />}
      <div>
        <strong>{title}</strong>
        {description && <span>{description}</span>}
      </div>
      {onRetry && retryLabel && (
        <Button variant="outline" onClick={onRetry}>
          <RefreshCw />
          {retryLabel}
        </Button>
      )}
    </div>
  );
}
