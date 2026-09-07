import { useMemo, useRef, useState, type KeyboardEvent } from "react";
import { Check, ChevronDown, X } from "lucide-react";

import {
  Command,
  CommandEmpty,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

export type MultiSelectOption = {
  id: string;
  name: string;
};

export function MultiSelect({
  id,
  labelledBy,
  options,
  value,
  onChange,
  placeholder: triggerPlaceholder,
  searchPlaceholder,
  emptyLabel,
  disabled = false,
}: {
  id: string;
  labelledBy?: string;
  options: MultiSelectOption[];
  value: string[];
  onChange: (value: string[]) => void;
  placeholder: string;
  searchPlaceholder?: string;
  emptyLabel: string;
  disabled?: boolean;
}) {
  const valueRef = useRef(value);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  valueRef.current = value;

  const selected = useMemo(() => new Set(value), [value]);
  const selectedOptions = useMemo(
    () => options.filter((item) => selected.has(item.id)),
    [options, selected],
  );

  const toggle = (itemId: string) => {
    const current = valueRef.current;
    const next = current.includes(itemId)
      ? current.filter((entry) => entry !== itemId)
      : [...current, itemId];
    valueRef.current = next;
    onChange(next);
  };

  const handleTriggerKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setOpen(true);
    }
  };

  return (
    <Popover
      open={open}
      onOpenChange={(nextOpen) => {
        setOpen(nextOpen);
        if (!nextOpen) setQuery("");
      }}
    >
      <div className={cn("multi-select", open && "is-open")}>
        <PopoverTrigger asChild>
          <div
            id={id}
            className="multi-select-trigger"
            role="combobox"
            tabIndex={disabled ? -1 : 0}
            aria-labelledby={labelledBy}
            aria-haspopup="listbox"
            aria-expanded={open}
            aria-controls={`${id}-listbox`}
            aria-placeholder={triggerPlaceholder}
            aria-disabled={disabled || undefined}
            data-disabled={disabled ? "" : undefined}
            onKeyDown={handleTriggerKeyDown}
          >
            {selectedOptions.length === 0 ? (
              <span className="multi-select-placeholder">{triggerPlaceholder}</span>
            ) : (
              <span className="multi-select-chips">
                {selectedOptions.map((item) => (
                  <span key={item.id} className="multi-select-chip">
                    {item.name}
                    <button
                      type="button"
                      aria-label={item.name}
                      onClick={(event) => {
                        event.stopPropagation();
                        toggle(item.id);
                      }}
                    >
                      <X />
                    </button>
                  </span>
                ))}
              </span>
            )}
            <ChevronDown aria-hidden="true" />
          </div>
        </PopoverTrigger>
      </div>
      <PopoverContent
        align="start"
        sideOffset={4}
        className="multi-select-menu multi-select-menu-portal"
        style={{
          width: "var(--radix-popover-trigger-width)",
          maxHeight: "var(--radix-popover-content-available-height)",
        }}
      >
        <Command label={searchPlaceholder ?? triggerPlaceholder}>
          {searchPlaceholder ? (
            <CommandInput
              value={query}
              onValueChange={setQuery}
              placeholder={searchPlaceholder}
              aria-label={searchPlaceholder}
              autoFocus
            />
          ) : null}
          <CommandList
            id={`${id}-listbox`}
            role="listbox"
            label={searchPlaceholder ?? triggerPlaceholder}
            aria-multiselectable="true"
          >
            <CommandEmpty>{emptyLabel}</CommandEmpty>
            {options.map((item) => {
              const isSelected = selected.has(item.id);
              return (
                <CommandItem
                  key={item.id}
                  value={`${item.name} ${item.id}`}
                  aria-selected={isSelected}
                  onSelect={() => toggle(item.id)}
                >
                  <span
                    className={cn("multi-select-check", isSelected && "is-checked")}
                    aria-hidden="true"
                  >
                    {isSelected ? <Check /> : null}
                  </span>
                  <span>{item.name}</span>
                </CommandItem>
              );
            })}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
