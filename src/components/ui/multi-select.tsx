import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { Check, ChevronDown, X } from "lucide-react";

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
  const placeholder = searchPlaceholder ?? triggerPlaceholder;
  const rootRef = useRef<HTMLDivElement>(null);
  const valueRef = useRef(value);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [highlight, setHighlight] = useState(0);
  const selected = useMemo(() => new Set(value), [value]);
  const selectedOptions = useMemo(
    () => options.filter((item) => selected.has(item.id)),
    [options, selected],
  );
  const visibleOptions = useMemo(() => {
    const term = query.trim().toLowerCase();
    if (!term) return options;
    return options.filter((item) => item.name.toLowerCase().includes(term));
  }, [options, query]);

  useEffect(() => {
    setHighlight(0);
  }, [visibleOptions]);

  useEffect(() => {
    valueRef.current = value;
  }, [value]);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
        setQuery("");
      }
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [open]);

  const toggle = (itemId: string) => {
    const current = valueRef.current;
    const next = current.includes(itemId)
      ? current.filter((entry) => entry !== itemId)
      : [...current, itemId];
    valueRef.current = next;
    onChange(next);
  };

  const handleTriggerKey = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "ArrowDown" || event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      setOpen(true);
    }
  };

  const handleListKey = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Escape") {
      setOpen(false);
      setQuery("");
      return;
    }
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setHighlight((index) =>
        visibleOptions.length === 0
          ? 0
          : Math.min(index + 1, visibleOptions.length - 1),
      );
      return;
    }
    if (event.key === "ArrowUp") {
      event.preventDefault();
      setHighlight((index) => Math.max(index - 1, 0));
      return;
    }
    if (event.key === "Enter") {
      const item = visibleOptions[highlight];
      if (item) {
        event.preventDefault();
        toggle(item.id);
      }
    }
  };

  return (
    <div className={cn("multi-select", open && "is-open")} ref={rootRef}>
      <div
        id={id}
        className="multi-select-trigger"
        role="combobox"
        tabIndex={disabled ? -1 : 0}
        aria-labelledby={labelledBy}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={`${id}-listbox`}
        {...{ "aria-placeholder": triggerPlaceholder }}
        aria-disabled={disabled || undefined}
        onClick={() => {
          if (!disabled) setOpen((current) => !current);
        }}
        onKeyDown={handleTriggerKey}
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
      {open ? (
        <div className="multi-select-menu">
          {searchPlaceholder ? (
            <input
              type="text"
              value={query}
              placeholder={placeholder}
              aria-label={placeholder}
              autoComplete="off"
              onChange={(event) => setQuery(event.target.value)}
              onKeyDown={handleListKey}
            />
          ) : null}
          <ul id={`${id}-listbox`} role="listbox" aria-multiselectable="true">
            {visibleOptions.length === 0 ? (
              <li className="multi-select-empty">{emptyLabel}</li>
            ) : (
              visibleOptions.map((item, index) => {
                const isSelected = selected.has(item.id);
                return (
                  <li key={item.id} role="presentation">
                    <button
                      type="button"
                      role="option"
                      aria-selected={isSelected}
                      className={cn(
                        "multi-select-option",
                        index === highlight && "is-active",
                      )}
                      onMouseEnter={() => setHighlight(index)}
                      onMouseDown={(event) => event.preventDefault()}
                      onClick={() => toggle(item.id)}
                    >
                      <span
                        className={cn(
                          "multi-select-check",
                          isSelected && "is-checked",
                        )}
                        aria-hidden="true"
                      >
                        {isSelected ? <Check /> : null}
                      </span>
                      <span>{item.name}</span>
                    </button>
                  </li>
                );
              })
            )}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
