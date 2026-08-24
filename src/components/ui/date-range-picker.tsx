import { cn } from "@/lib/utils";

export type DateRangePickerProps = {
  startId: string;
  endId: string;
  startValue: string;
  endValue: string;
  onStartChange: (value: string) => void;
  onEndChange: (value: string) => void;
  startLabel: string;
  endLabel: string;
  /** Visible group label for the single range control. */
  legend?: string;
  className?: string;
  disabled?: boolean;
  allowOutOfOrder?: boolean;
};

/**
 * One start–end date range control (native date inputs in a single field).
 * Prefer this over two stacked standalone date pickers on list/report toolbars.
 */
export function DateRangePicker({
  startId,
  endId,
  startValue,
  endValue,
  onStartChange,
  onEndChange,
  startLabel,
  endLabel,
  legend,
  className,
  disabled = false,
  allowOutOfOrder = false,
}: DateRangePickerProps) {
  const rangeLabel = legend ?? `${startLabel} — ${endLabel}`;
  const labelId = `${startId}-${endId}-label`;

  return (
    <div
      className={cn("date-range-picker", className)}
      role="group"
      aria-labelledby={labelId}
    >
      <span id={labelId} className="date-range-picker-label">{rangeLabel}</span>
      <div className="date-range-picker-control">
        <input
          id={startId}
          type="date"
          aria-label={startLabel}
          value={startValue}
          max={!allowOutOfOrder && endValue ? endValue : undefined}
          disabled={disabled}
          onChange={(event) => onStartChange(event.target.value)}
        />
        <span className="date-range-picker-separator" aria-hidden="true">
          —
        </span>
        <input
          id={endId}
          type="date"
          aria-label={endLabel}
          value={endValue}
          min={!allowOutOfOrder && startValue ? startValue : undefined}
          disabled={disabled}
          onChange={(event) => onEndChange(event.target.value)}
        />
      </div>
    </div>
  );
}
