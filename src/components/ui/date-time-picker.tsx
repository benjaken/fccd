import { DatePicker } from "@/components/ui/date-picker";
import { TimePicker } from "@/components/ui/time-picker";
import { cn } from "@/lib/utils";

export function DateTimePicker({ id, value, onChange, label, className, disabled = false, required = false }: {
  id: string;
  value: string;
  onChange: (value: string) => void;
  label: string;
  className?: string;
  disabled?: boolean;
  required?: boolean;
}) {
  const [date = "", time = ""] = value.split("T");
  return (
    <div className={cn("date-time-picker", className)}>
      <span className="date-time-picker-label">{label}{required ? <em>*</em> : null}</span>
      <div className="date-time-picker-control">
        <DatePicker id={`${id}-date`} value={date} label={label} hideLabel disabled={disabled} onChange={(nextDate) => onChange(nextDate ? `${nextDate}T${time || "00:00"}` : "")} />
        <TimePicker id={`${id}-time`} value={time.slice(0, 5)} label={label} hideLabel disabled={disabled || !date} onChange={(nextTime) => onChange(date ? `${date}T${nextTime}` : "")} />
      </div>
    </div>
  );
}
