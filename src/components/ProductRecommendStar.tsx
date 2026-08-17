import { Star } from "lucide-react";

import { cn } from "@/lib/utils";

export function ProductRecommendStar({
  recommended,
  label,
  onToggle,
  disabled = false,
}: {
  recommended: boolean;
  label: string;
  onToggle?: () => void;
  disabled?: boolean;
}) {
  const className = cn("product-recommend-star", recommended && "is-on");
  const icon = <Star fill={recommended ? "currentColor" : "none"} />;

  if (!onToggle) {
    return (
      <span className={className} aria-label={label} title={label}>
        {icon}
      </span>
    );
  }

  return (
    <button
      type="button"
      className={className}
      aria-label={label}
      aria-pressed={recommended}
      title={label}
      disabled={disabled}
      onClick={(event) => {
        event.preventDefault();
        event.stopPropagation();
        onToggle();
      }}
    >
      {icon}
    </button>
  );
}
