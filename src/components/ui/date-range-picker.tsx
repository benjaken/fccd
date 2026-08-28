import { CalendarRange } from "lucide-react";
import { enUS, zhHK } from "date-fns/locale";
import { useEffect, useState } from "react";
import type { DateRange } from "react-day-picker";
import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { displayDateKey, parseDateKey, toDateKey } from "@/lib/picker-date";

export type DateRangePickerProps = {
  startId: string;
  endId: string;
  startValue: string;
  endValue: string;
  onStartChange: (value: string) => void;
  onEndChange: (value: string) => void;
  startLabel: string;
  endLabel: string;
  legend?: string;
  className?: string;
  disabled?: boolean;
  allowOutOfOrder?: boolean;
};

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
  const { t, i18n } = useTranslation();
  const [open, setOpen] = useState(false);
  const [draftRange, setDraftRange] = useState<DateRange>();
  const from = parseDateKey(startValue);
  const to = parseDateKey(endValue);
  const labelId = `${startId}-${endId}-label`;
  const locale = i18n.language.startsWith("zh") ? zhHK : enUS;

  useEffect(() => {
    if (draftRange?.from && draftRange.to) setOpen(false);
  }, [draftRange]);

  return (
    <div className={cn("date-range-picker", className)} role="group" aria-labelledby={labelId}>
      <span id={labelId} className="date-range-picker-label">
        {legend ?? `${startLabel} – ${endLabel}`}
      </span>
      <Popover
        open={open}
        onOpenChange={(nextOpen) => {
          setOpen(nextOpen);
          setDraftRange(undefined);
        }}
      >
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="outline"
            disabled={disabled}
            className={cn("date-range-picker-trigger", !from && !to && "is-placeholder")}
          >
            <CalendarRange aria-hidden="true" />
            <span id={startId}>{displayDateKey(startValue) || t("common.startDatePlaceholder")}</span>
            <span aria-hidden="true">–</span>
            <span id={endId}>{displayDateKey(endValue) || t("common.endDatePlaceholder")}</span>
          </Button>
        </PopoverTrigger>
        <PopoverContent align="start" className="date-range-picker-popover">
          <Calendar
            mode="range"
            locale={locale}
            selected={draftRange}
            defaultMonth={from ?? to ?? new Date()}
            numberOfMonths={2}
            min={1}
            onSelect={(range) => {
              setDraftRange(range);
              onStartChange(range?.from ? toDateKey(range.from) : "");
              onEndChange(range?.to ? toDateKey(range.to) : "");
            }}
          />
          {startValue || endValue ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="picker-clear"
              onClick={() => {
                onStartChange("");
                onEndChange("");
              }}
            >
              {t("common.clearDateRange")}
            </Button>
          ) : null}
        </PopoverContent>
      </Popover>
    </div>
  );
}
