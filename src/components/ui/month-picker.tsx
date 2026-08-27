import { useEffect, useMemo, useState } from "react";
import { CalendarDays, ChevronLeft, ChevronRight } from "lucide-react";
import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

function parseYear(value: string, fallback: number) {
  const year = Number(value.slice(0, 4));
  return Number.isInteger(year) && year > 0 ? year : fallback;
}

export function MonthPicker({
  id,
  value,
  onChange,
  label,
  placeholder,
  clearLabel,
  previousYearLabel,
  nextYearLabel,
  locale,
  min,
  max,
  className,
  disabled = false,
  hideLabel = false,
}: {
  id: string;
  value: string;
  onChange: (value: string) => void;
  label: string;
  placeholder?: string;
  clearLabel?: string;
  previousYearLabel?: string;
  nextYearLabel?: string;
  locale?: string;
  min?: string;
  max?: string;
  className?: string;
  disabled?: boolean;
  hideLabel?: boolean;
}) {
  const { t, i18n } = useTranslation();
  const pickerLocale = locale ?? i18n.language;
  const pickerPlaceholder = placeholder ?? t("common.monthPickerPlaceholder");
  const pickerClearLabel = clearLabel ?? t("common.clearMonth");
  const pickerPreviousYearLabel = previousYearLabel ?? t("common.previousYear");
  const pickerNextYearLabel = nextYearLabel ?? t("common.nextYear");
  const fallbackYear = new Date().getFullYear();
  const [open, setOpen] = useState(false);
  const [visibleYear, setVisibleYear] = useState(() => parseYear(value || max || min || "", fallbackYear));
  const labelId = `${id}-label`;
  const monthFormatter = useMemo(
    () => new Intl.DateTimeFormat(pickerLocale, { month: "short", timeZone: "UTC" }),
    [pickerLocale],
  );
  const valueFormatter = useMemo(
    () => new Intl.DateTimeFormat(pickerLocale, { year: "numeric", month: "long", timeZone: "UTC" }),
    [pickerLocale],
  );

  useEffect(() => {
    if (open) setVisibleYear(parseYear(value || max || min || "", fallbackYear));
  }, [fallbackYear, max, min, open, value]);

  const displayValue = /^\d{4}-\d{2}$/.test(value)
    ? valueFormatter.format(new Date(`${value}-01T00:00:00Z`))
    : pickerPlaceholder;
  const previousDisabled = Boolean(min && `${visibleYear - 1}-12` < min);
  const nextDisabled = Boolean(max && `${visibleYear + 1}-01` > max);

  return (
    <div className={cn("month-picker", className)}>
      {hideLabel ? null : <span id={labelId} className="month-picker-label">{label}</span>}
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            id={id}
            type="button"
            variant="outline"
            role="combobox"
            aria-label={hideLabel ? label : undefined}
            aria-labelledby={hideLabel ? undefined : labelId}
            aria-expanded={open}
            disabled={disabled}
            className={cn("month-picker-trigger", !value && "is-placeholder")}
          >
            <span>{displayValue}</span>
            <CalendarDays aria-hidden="true" />
          </Button>
        </PopoverTrigger>
        <PopoverContent align="end" className="month-picker-popover">
          <div className="month-picker-year-nav">
            <Button
              type="button"
              size="icon"
              variant="ghost"
              aria-label={pickerPreviousYearLabel}
              disabled={previousDisabled}
              onClick={() => setVisibleYear((year) => year - 1)}
            >
              <ChevronLeft />
            </Button>
            <strong>{visibleYear}</strong>
            <Button
              type="button"
              size="icon"
              variant="ghost"
              aria-label={pickerNextYearLabel}
              disabled={nextDisabled}
              onClick={() => setVisibleYear((year) => year + 1)}
            >
              <ChevronRight />
            </Button>
          </div>
          <div className="month-picker-grid" role="grid">
            {Array.from({ length: 12 }, (_, index) => {
              const month = String(index + 1).padStart(2, "0");
              const monthKey = `${visibleYear}-${month}`;
              const selected = monthKey === value;
              const unavailable = Boolean((min && monthKey < min) || (max && monthKey > max));
              return (
                <Button
                  key={monthKey}
                  type="button"
                  size="sm"
                  variant={selected ? "default" : "ghost"}
                  role="gridcell"
                  aria-selected={selected}
                  disabled={unavailable}
                  className="month-picker-month"
                  onClick={() => {
                    onChange(monthKey);
                    setOpen(false);
                  }}
                >
                  {monthFormatter.format(new Date(Date.UTC(2020, index, 1)))}
                </Button>
              );
            })}
          </div>
          {value ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="month-picker-clear"
              onClick={() => {
                onChange("");
                setOpen(false);
              }}
            >
              {pickerClearLabel}
            </Button>
          ) : null}
        </PopoverContent>
      </Popover>
    </div>
  );
}
