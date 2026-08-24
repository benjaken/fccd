import { useEffect, useMemo, useRef, useState } from "react";
import { Check, ChevronDown, Plus } from "lucide-react";
import { useTranslation } from "react-i18next";

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
}: SearchSelectProps) {
  const { t } = useTranslation();
  const resolvedPlaceholder = placeholder ?? t("common.selectPlaceholder");
  const resolvedSearchPlaceholder = searchPlaceholder ?? t("common.searchSelectPlaceholder");
  const resolvedEmptyLabel = emptyLabel ?? t("common.noMatchingOptions");
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [highlightedIndex, setHighlightedIndex] = useState(0);
  const selectedOption = options.find((option) => option.id === value);
  const filteredOptions = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase();
    if (!normalizedQuery) return options;
    return options.filter((option) => `${option.name} ${option.id}`.toLocaleLowerCase().includes(normalizedQuery));
  }, [options, query]);
  const createName = query.trim();
  const canCreate = Boolean(onCreate && createName
    && !options.some((option) => option.name.toLocaleLowerCase() === createName.toLocaleLowerCase()));

  useEffect(() => {
    if (!open) return;
    const closeOnOutsideClick = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
        setQuery("");
      }
    };
    document.addEventListener("mousedown", closeOnOutsideClick);
    return () => document.removeEventListener("mousedown", closeOnOutsideClick);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    setHighlightedIndex(0);
    inputRef.current?.focus();
  }, [open, query]);

  const chooseOption = (option: SearchSelectOption) => {
    onChange(option);
    setOpen(false);
    setQuery("");
  };

  const handleKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === "Escape") {
      event.preventDefault();
      setOpen(false);
      setQuery("");
      return;
    }
    if (event.key === "ArrowDown") {
      event.preventDefault();
      if (!open) setOpen(true);
      else setHighlightedIndex((current) => Math.min(current + 1, filteredOptions.length - 1));
      return;
    }
    if (event.key === "ArrowUp") {
      event.preventDefault();
      setHighlightedIndex((current) => Math.max(current - 1, 0));
      return;
    }
    if (event.key === "Enter" && open && filteredOptions[highlightedIndex]) {
      event.preventDefault();
      chooseOption(filteredOptions[highlightedIndex]);
    }
  };

  return (
    <div ref={rootRef} className={cn("multi-select mt-1", open && "is-open")} onKeyDown={handleKeyDown}>
      <button
        id={id}
        type="button"
        role="combobox"
        aria-label={label}
        aria-expanded={open}
        aria-controls={`${id}-options`}
        aria-haspopup="listbox"
        className="multi-select-trigger h-9 min-h-9 bg-white font-normal text-slate-800"
        disabled={disabled}
        onClick={() => setOpen((current) => !current)}
      >
        <span className={cn("truncate", !selectedOption && "multi-select-placeholder")}>{selectedOption?.name ?? resolvedPlaceholder}</span>
        <ChevronDown aria-hidden="true" />
      </button>
      {open ? (
        <div className="multi-select-menu">
          <input
            ref={inputRef}
            type="search"
            value={query}
            aria-label={resolvedSearchPlaceholder}
            placeholder={resolvedSearchPlaceholder}
            onChange={(event) => setQuery(event.target.value)}
          />
          {filteredOptions.length ? (
            <ul id={`${id}-options`} role="listbox" aria-label={`${label}選項`}>
              {filteredOptions.map((option, index) => (
                <li key={option.id} role="presentation">
                  <button
                    type="button"
                    role="option"
                    aria-selected={option.id === value}
                    className={cn("multi-select-option", index === highlightedIndex && "is-active")}
                    onMouseEnter={() => setHighlightedIndex(index)}
                    onClick={() => chooseOption(option)}
                  >
                    <span className={cn("multi-select-check", option.id === value && "is-checked")}>
                      {option.id === value ? <Check aria-hidden="true" /> : null}
                    </span>
                    <span>{option.name}</span>
                  </button>
                </li>
              ))}
            </ul>
          ) : !canCreate ? <div className="multi-select-empty">{resolvedEmptyLabel}</div> : null}
          {canCreate ? (
            <button
              type="button"
              className="multi-select-option border-t border-slate-100 font-semibold text-emerald-700"
              onClick={() => {
                onCreate?.(createName);
                setOpen(false);
                setQuery("");
              }}
            >
              <Plus aria-hidden="true" className="size-4" />
              <span>新增「{createName}」</span>
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
