import { cn } from "@/lib/utils";

/** A labelled single-date control, paired with DateRangePicker for ranges. */
export function DatePicker({
  id,
  value,
  onChange,
  label,
  className,
  disabled = false,
  hideLabel = false,
}: {
  id: string;
  value: string;
  onChange: (value: string) => void;
  label: string;
  className?: string;
  disabled?: boolean;
  hideLabel?: boolean;
}) {
  return (
    <label className={cn("date-picker", className)}>
      {hideLabel ? null : <span>{label}</span>}
      <input
        id={id}
        type="date"
        value={value}
        disabled={disabled}
        aria-label={hideLabel ? label : undefined}
        onChange={(event) => onChange(event.target.value)}
      />
    </label>
  );
}
