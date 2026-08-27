import { CalendarDays } from "lucide-react";
import { enUS, zhHK } from "date-fns/locale";
import type { Matcher } from "react-day-picker";
import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { displayDateKey, parseDateKey, toDateKey } from "@/lib/picker-date";

export function DatePicker({
  id,
  value,
  onChange,
  label,
  className,
  disabled = false,
  hideLabel = false,
  min,
  max,
}: {
  id: string;
  value: string;
  onChange: (value: string) => void;
  label: string;
  className?: string;
  disabled?: boolean;
  hideLabel?: boolean;
  min?: string;
  max?: string;
}) {
  const { t, i18n } = useTranslation();
  const selected = parseDateKey(value);
  const minimum = parseDateKey(min ?? "");
  const maximum = parseDateKey(max ?? "");
  const disabledMatchers: Matcher[] = [
    ...(minimum ? [{ before: minimum }] : []),
    ...(maximum ? [{ after: maximum }] : []),
  ];
  const labelId = `${id}-label`;
  const locale = i18n.language.startsWith("zh") ? zhHK : enUS;

  return (
    <div className={cn("date-picker", className)}>
      {hideLabel ? null : <span id={labelId}>{label}</span>}
      <Popover>
        <PopoverTrigger asChild>
          <Button
            id={id}
            type="button"
            variant="outline"
            role="combobox"
            aria-label={hideLabel ? label : undefined}
            aria-labelledby={hideLabel ? undefined : labelId}
            disabled={disabled}
            className={cn("date-picker-trigger", !selected && "is-placeholder")}
          >
            <span>{displayDateKey(value) || t("common.datePickerPlaceholder")}</span>
            <CalendarDays aria-hidden="true" />
          </Button>
        </PopoverTrigger>
        <PopoverContent align="start" className="date-picker-popover">
          <Calendar
            mode="single"
            locale={locale}
            selected={selected}
            defaultMonth={selected ?? parseDateKey(max ?? "") ?? new Date()}
            startMonth={minimum}
            endMonth={maximum}
            disabled={disabledMatchers}
            onSelect={(date) => {
              if (date) onChange(toDateKey(date));
            }}
          />
          {value ? <Button type="button" variant="ghost" size="sm" className="picker-clear" onClick={() => onChange("")}>{t("common.clearDate")}</Button> : null}
        </PopoverContent>
      </Popover>
    </div>
  );
}
