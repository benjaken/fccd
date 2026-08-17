import { statusBadgeStyle, type OrderStatusView } from "@/lib/order-statuses";

export function OrderStatusBadges({
  statuses,
  empty,
}: {
  statuses: readonly OrderStatusView[] | null | undefined;
  empty?: string | null;
}) {
  const items = statuses ?? [];
  if (items.length === 0) {
    if (!empty) return null;
    return <span className="status-badge blue">{empty}</span>;
  }

  return (
    <span className="order-status-list">
      {items.map((status, index) => (
        <span
          className="status-badge"
          key={`${status.name}-${index}`}
          style={statusBadgeStyle(status.color)}
        >
          {status.name}
        </span>
      ))}
    </span>
  );
}
