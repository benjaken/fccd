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
}: DateRangePickerProps) {
  const rangeLabel = legend ?? `${startLabel} — ${endLabel}`;

  return (
    <fieldset
      className={cn("date-range-picker", className)}
      disabled={disabled}
    >
      <legend>{rangeLabel}</legend>
      <div className="date-range-picker-control">
        <input
          id={startId}
          type="date"
          aria-label={startLabel}
          value={startValue}
          max={endValue || undefined}
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
          min={startValue || undefined}
          disabled={disabled}
          onChange={(event) => onEndChange(event.target.value)}
        />
      </div>
    </fieldset>
  );
}
