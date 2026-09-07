import { useMemo, useState } from "react";
import { Check, ChevronDown, Plus } from "lucide-react";
import { useTranslation } from "react-i18next";

import {
  Command,
  CommandEmpty,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

export type SearchSelectOption = {
  id: string;
  name: string;
};

type SearchSelectProps = {
  id: string;
  label: string;
  options: SearchSelectOption[];
  value: string;
  onChange: (option: SearchSelectOption) => void;
  onCreate?: (name: string) => void;
  placeholder?: string;
  searchPlaceholder?: string;
  emptyLabel?: string;
  disabled?: boolean;
  required?: boolean;
  invalid?: boolean;
};

export function SearchSelect({
  id,
  label,
  options,
  value,
  onChange,
  onCreate,
  placeholder,
  searchPlaceholder,
  emptyLabel,
  disabled = false,
  required = false,
  invalid = false,
}: SearchSelectProps) {
  const { t } = useTranslation();
  const resolvedPlaceholder = placeholder ?? t("common.selectPlaceholder");
  const resolvedSearchPlaceholder = searchPlaceholder ?? t("common.searchSelectPlaceholder");
  const resolvedEmptyLabel = emptyLabel ?? t("common.noMatchingOptions");
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const selectedOption = options.find((option) => option.id === value);
  const createName = query.trim();
  const canCreate = Boolean(
    onCreate
      && createName
      && !options.some(
        (option) => option.name.toLocaleLowerCase() === createName.toLocaleLowerCase(),
      ),
  );
  const searchableOptions = useMemo(
    () => options.map((option) => ({ ...option, searchValue: `${option.name} ${option.id}` })),
    [options],
  );

  const close = () => {
    setOpen(false);
    setQuery("");
  };

  return (
    <Popover
      open={open}
      onOpenChange={(nextOpen) => {
        if (disabled) return;
        setOpen(nextOpen);
        if (!nextOpen) setQuery("");
      }}
    >
      <div className={cn("multi-select mt-1", open && "is-open")}>
        <PopoverTrigger asChild>
          <button
            id={id}
            type="button"
            role="combobox"
            aria-label={label}
            aria-expanded={open}
            aria-controls={`${id}-options`}
            aria-haspopup="listbox"
            aria-required={required || undefined}
            aria-invalid={invalid || undefined}
            className="multi-select-trigger h-9 min-h-9 bg-white font-normal text-slate-800"
            disabled={disabled}
          >
            <span className={cn("truncate", !selectedOption && "multi-select-placeholder")}>
              {selectedOption?.name ?? resolvedPlaceholder}
            </span>
            <ChevronDown aria-hidden="true" />
          </button>
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
        <Command label={resolvedSearchPlaceholder}>
          <CommandInput
            value={query}
            onValueChange={setQuery}
            aria-label={resolvedSearchPlaceholder}
            placeholder={resolvedSearchPlaceholder}
            autoFocus
          />
          <CommandList id={`${id}-options`} role="listbox" label={`${label}選項`}>
            {!canCreate ? <CommandEmpty>{resolvedEmptyLabel}</CommandEmpty> : null}
            {searchableOptions.map((option) => (
              <CommandItem
                key={option.id}
                value={option.searchValue}
                aria-selected={option.id === value}
                onSelect={() => {
                  onChange({ id: option.id, name: option.name });
                  close();
                }}
              >
                <span className={cn("multi-select-check", option.id === value && "is-checked")}>
                  {option.id === value ? <Check aria-hidden="true" /> : null}
                </span>
                <span>{option.name}</span>
              </CommandItem>
            ))}
            {canCreate ? (
              <CommandItem
                value={`create ${createName}`}
                className="border-t border-slate-100 font-semibold text-emerald-700"
                onSelect={() => {
                  onCreate?.(createName);
                  close();
                }}
              >
                <Plus aria-hidden="true" className="size-4" />
                <span>新增「{createName}」</span>
              </CommandItem>
            ) : null}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
