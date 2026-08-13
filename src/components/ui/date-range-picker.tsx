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
  /** Accessible name for the range group. */
  legend?: string;
  className?: string;
  disabled?: boolean;
};

/**
 * Shared start–end date range control (native date inputs as one picker range).
 * Prefer this over two standalone date filters on list/report toolbars.
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
  return (
    <fieldset
      className={cn("date-range-picker", className)}
      disabled={disabled}
      aria-label={legend}
    >
      {legend ? <legend className="sr-only">{legend}</legend> : null}
      <label className="date-range-picker-field" htmlFor={startId}>
        <span>{startLabel}</span>
        <input
          id={startId}
          type="date"
          value={startValue}
          max={endValue || undefined}
          disabled={disabled}
          onChange={(event) => onStartChange(event.target.value)}
        />
      </label>
      <span className="date-range-picker-separator" aria-hidden="true">
        —
      </span>
      <label className="date-range-picker-field" htmlFor={endId}>
        <span>{endLabel}</span>
        <input
          id={endId}
          type="date"
          value={endValue}
          min={startValue || undefined}
          disabled={disabled}
          onChange={(event) => onEndChange(event.target.value)}
        />
      </label>
    </fieldset>
  );
}
