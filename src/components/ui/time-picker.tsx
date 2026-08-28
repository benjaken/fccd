import { Clock3 } from "lucide-react";
import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

export function TimePicker({ id, value, onChange, label, className, disabled = false, hideLabel = false }: {
  id: string;
  value: string;
  onChange: (value: string) => void;
  label: string;
  className?: string;
  disabled?: boolean;
  hideLabel?: boolean;
}) {
  const { t } = useTranslation();
  const [hour = "", minute = ""] = value.split(":");
  const labelId = `${id}-label`;
  const setPart = (nextHour: string, nextMinute: string) => onChange(`${nextHour || "00"}:${nextMinute || "00"}`);
  return (
    <div className={cn("time-picker", className)}>
      {hideLabel ? null : <span id={labelId} className="time-picker-label">{label}</span>}
      <Popover>
        <PopoverTrigger asChild>
          <Button id={id} type="button" variant="outline" aria-label={hideLabel ? label : undefined} aria-labelledby={hideLabel ? undefined : labelId} disabled={disabled} className={cn("time-picker-trigger", !value && "is-placeholder")}>
            <span>{value || t("common.timePickerPlaceholder")}</span><Clock3 aria-hidden="true" />
          </Button>
        </PopoverTrigger>
        <PopoverContent align="start" className="time-picker-popover">
          <div className="time-picker-column" aria-label={t("common.hour")}>
            {Array.from({ length: 24 }, (_, index) => String(index).padStart(2, "0")).map((item) => <Button key={item} type="button" size="sm" variant={item === hour ? "default" : "ghost"} onClick={() => setPart(item, minute)}>{item}</Button>)}
          </div>
          <span aria-hidden="true">:</span>
          <div className="time-picker-column" aria-label={t("common.minute")}>
            {Array.from({ length: 60 }, (_, index) => String(index).padStart(2, "0")).map((item) => <Button key={item} type="button" size="sm" variant={item === minute ? "default" : "ghost"} onClick={() => setPart(hour, item)}>{item}</Button>)}
          </div>
          {value ? <Button type="button" variant="ghost" size="sm" className="picker-clear" onClick={() => onChange("")}>{t("common.clearTime")}</Button> : null}
        </PopoverContent>
      </Popover>
    </div>
  );
}
