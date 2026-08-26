import {
  Children,
  Fragment,
  isValidElement,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ReactElement,
  type ReactNode,
  type SelectHTMLAttributes,
} from "react";
import { createPortal } from "react-dom";
import { Check, ChevronDown, Search } from "lucide-react";
import { useTranslation } from "react-i18next";

import { cn } from "@/lib/utils";

type OptionElement = ReactElement<{
  children?: ReactNode;
  disabled?: boolean;
  value?: string | number;
}>;

function optionElements(children: ReactNode): OptionElement[] {
  return Children.toArray(children).flatMap((child) => {
    if (!isValidElement(child)) return [];
    const element = child as ReactElement<{ children?: ReactNode }>;
    if (child.type === "option") return [child as OptionElement];
    if (child.type === Fragment) return optionElements(element.props.children);
    return [];
  });
}

function textContent(value: ReactNode): string {
  return Children.toArray(value).map((child) => {
    if (typeof child === "string" || typeof child === "number") return String(child);
    if (isValidElement(child)) {
      return textContent((child as ReactElement<{ children?: ReactNode }>).props.children);
    }
    return "";
  }).join(" ");
}

export function FilterableSelect({
  children,
  className,
  disabled,
  value,
  defaultValue,
  onChange,
  searchPlaceholder,
  emptyLabel,
  ...selectProps
}: Omit<SelectHTMLAttributes<HTMLSelectElement>, "children"> & {
  children: ReactNode;
  searchPlaceholder?: string;
  emptyLabel?: string;
}) {
  const { t } = useTranslation();
  const rootRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const selectRef = useRef<HTMLSelectElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [localValue, setLocalValue] = useState(String(defaultValue ?? ""));
  const [inferredLabel, setInferredLabel] = useState("");
  const [menuStyle, setMenuStyle] = useState<CSSProperties>({});
  const resolvedSearchPlaceholder = searchPlaceholder ?? t("common.searchSelectPlaceholder");
  const resolvedEmptyLabel = emptyLabel ?? t("common.noMatchingOptions");
  const options = useMemo(() => optionElements(children), [children]);
  const selectedValue = String(value ?? localValue);
  const selectedOption = options.find((option) => String(option.props.value ?? "") === selectedValue);
  const visibleOptions = useMemo(() => {
    const term = query.trim().toLocaleLowerCase();
    if (!term) return options;
    return options.filter((option) => textContent(option.props.children).toLocaleLowerCase().includes(term));
  }, [options, query]);

  useLayoutEffect(() => {
    if (typeof selectProps["aria-label"] === "string") return;
    const outerLabel = rootRef.current?.closest("label");
    setInferredLabel(outerLabel?.querySelector(":scope > span")?.textContent?.trim() ?? "");
  }, [selectProps["aria-label"]]);

  const accessibleLabel = typeof selectProps["aria-label"] === "string"
    ? selectProps["aria-label"]
    : inferredLabel;

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
    inputRef.current?.focus();
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

  const chooseOption = (optionValue: string) => {
    const select = selectRef.current;
    if (!select) return;
    setLocalValue(optionValue);
    select.value = optionValue;
    select.dispatchEvent(new Event("change", { bubbles: true }));
    setOpen(false);
    setQuery("");
  };

  if (options.length <= 10) {
    return (
      <select
        {...selectProps}
        className={className}
        disabled={disabled}
        value={value}
        defaultValue={defaultValue}
        onChange={onChange}
      >
        {children}
      </select>
    );
  }

  return (
    <div ref={rootRef} className={cn("filterable-select multi-select", disabled && "is-disabled", open && "is-open")}>
      <select
        {...selectProps}
        ref={selectRef}
        aria-label={accessibleLabel || undefined}
        className="sr-only"
        disabled={disabled}
        value={value ?? localValue}
        onChange={(event) => {
          setLocalValue(event.target.value);
          onChange?.(event);
        }}
      >
        {children}
      </select>
      <button
        type="button"
        className={cn("multi-select-trigger", className)}
        aria-haspopup="listbox"
        aria-expanded={open}
        disabled={disabled}
        onClick={() => setOpen((current) => !current)}
      >
        <span className="min-w-0 flex-1 truncate leading-5">{selectedOption ? textContent(selectedOption.props.children) : ""}</span>
        <ChevronDown aria-hidden="true" />
      </button>
      {open ? createPortal(
        <div ref={menuRef} className="multi-select-menu multi-select-menu-portal" style={menuStyle}>
          <div className="filterable-select-menu-search">
            <Search aria-hidden="true" />
            <input
              ref={inputRef}
              type="search"
              role="searchbox"
              aria-label={t("common.filterSelectSearchLabel")}
              placeholder={resolvedSearchPlaceholder}
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
          </div>
          {visibleOptions.length ? (
            <ul role="listbox" aria-label={accessibleLabel || undefined}>
              {visibleOptions.map((option, index) => {
                const optionValue = String(option.props.value ?? "");
                const selected = optionValue === selectedValue;
                return (
                  <li key={`${optionValue}-${index}`} role="presentation">
                    <button
                      type="button"
                      role="option"
                      aria-selected={selected}
                      className="multi-select-option"
                      disabled={option.props.disabled}
                      onClick={() => chooseOption(optionValue)}
                    >
                      <span className={cn("multi-select-check", selected && "is-checked")}>
                        {selected ? <Check aria-hidden="true" /> : null}
                      </span>
                      <span>{option.props.children}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          ) : <div className="multi-select-empty">{resolvedEmptyLabel}</div>}
        </div>,
        document.body,
      ) : null}
    </div>
  );
}
