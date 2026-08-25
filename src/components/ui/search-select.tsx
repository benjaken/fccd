import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import { createPortal } from "react-dom";
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
  const rootRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [menuStyle, setMenuStyle] = useState<CSSProperties>({});
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

  const updateMenuPosition = useCallback(() => {
    const trigger = rootRef.current?.getBoundingClientRect();
    if (!trigger) return;
    const viewportPadding = 8;
    const gap = 4;
    const availableBelow = window.innerHeight - trigger.bottom - viewportPadding;
    const availableAbove = trigger.top - viewportPadding;
    const openAbove = availableBelow < 180 && availableAbove > availableBelow;
    const availableHeight = openAbove ? availableAbove : availableBelow;
    const width = Math.min(trigger.width, window.innerWidth - viewportPadding * 2);
    const left = Math.min(
      Math.max(viewportPadding, trigger.left),
      Math.max(viewportPadding, window.innerWidth - width - viewportPadding),
    );
    setMenuStyle({
      position: "fixed",
      top: openAbove ? "auto" : trigger.bottom + gap,
      bottom: openAbove ? window.innerHeight - trigger.top + gap : "auto",
      left,
      width,
      maxHeight: Math.min(280, Math.max(120, availableHeight - gap)),
    });
  }, []);

  useLayoutEffect(() => {
    if (!open) return;
    updateMenuPosition();
    window.addEventListener("resize", updateMenuPosition);
    window.addEventListener("scroll", updateMenuPosition, true);
    return () => {
      window.removeEventListener("resize", updateMenuPosition);
      window.removeEventListener("scroll", updateMenuPosition, true);
    };
  }, [open, updateMenuPosition]);

  useEffect(() => {
    if (!open) return;
    const closeOnOutsideClick = (event: PointerEvent) => {
      const target = event.target as Node;
      if (!rootRef.current?.contains(target) && !menuRef.current?.contains(target)) {
        setOpen(false);
        setQuery("");
      }
    };
    document.addEventListener("pointerdown", closeOnOutsideClick);
    return () => document.removeEventListener("pointerdown", closeOnOutsideClick);
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
        aria-required={required || undefined}
        aria-invalid={invalid || undefined}
        className="multi-select-trigger h-9 min-h-9 bg-white font-normal text-slate-800"
        disabled={disabled}
        onClick={() => setOpen((current) => !current)}
      >
        <span className={cn("truncate", !selectedOption && "multi-select-placeholder")}>{selectedOption?.name ?? resolvedPlaceholder}</span>
        <ChevronDown aria-hidden="true" />
      </button>
      {open ? createPortal(
        <div ref={menuRef} className="multi-select-menu multi-select-menu-portal" style={menuStyle}>
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
        </div>,
        document.body,
      ) : null}
    </div>
  );
}
