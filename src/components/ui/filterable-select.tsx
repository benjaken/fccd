import {
  Children,
  Fragment,
  isValidElement,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactElement,
  type ReactNode,
  type SelectHTMLAttributes,
} from "react";
import { Check, ChevronDown } from "lucide-react";
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
  return Children.toArray(value)
    .map((child) => {
      if (typeof child === "string" || typeof child === "number") return String(child);
      if (isValidElement(child)) {
        return textContent((child as ReactElement<{ children?: ReactNode }>).props.children);
      }
      return "";
    })
    .join(" ");
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
  const selectRef = useRef<HTMLSelectElement>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [localValue, setLocalValue] = useState(String(defaultValue ?? ""));
  const [inferredLabel, setInferredLabel] = useState("");
  const resolvedSearchPlaceholder = searchPlaceholder ?? t("common.searchSelectPlaceholder");
  const resolvedEmptyLabel = emptyLabel ?? t("common.noMatchingOptions");
  const options = useMemo(() => optionElements(children), [children]);
  const selectedValue = String(value ?? localValue);
  const selectedOption = options.find(
    (option) => String(option.props.value ?? "") === selectedValue,
  );

  useLayoutEffect(() => {
    if (typeof selectProps["aria-label"] === "string") return;
    const outerLabel = rootRef.current?.closest("label");
    setInferredLabel(outerLabel?.querySelector(":scope > span")?.textContent?.trim() ?? "");
  }, [selectProps["aria-label"]]);

  const accessibleLabel =
    typeof selectProps["aria-label"] === "string"
      ? selectProps["aria-label"]
      : inferredLabel;

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
    <Popover
      open={open}
      onOpenChange={(nextOpen) => {
        if (disabled) return;
        setOpen(nextOpen);
        if (!nextOpen) setQuery("");
      }}
    >
      <div
        ref={rootRef}
        className={cn(
          "filterable-select multi-select",
          disabled && "is-disabled",
          open && "is-open",
        )}
      >
        <select
          {...selectProps}
          ref={selectRef}
          aria-label={undefined}
          aria-hidden="true"
          tabIndex={-1}
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
        <PopoverTrigger asChild>
          <button
            type="button"
            className={cn("multi-select-trigger", className)}
            role="combobox"
            aria-label={accessibleLabel || undefined}
            aria-haspopup="listbox"
            aria-expanded={open}
            disabled={disabled}
          >
            <span className="min-w-0 flex-1 truncate leading-5">
              {selectedOption ? textContent(selectedOption.props.children) : ""}
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
        <Command label={t("common.filterSelectSearchLabel")}>
          <CommandInput
            value={query}
            onValueChange={setQuery}
            aria-label={t("common.filterSelectSearchLabel")}
            placeholder={resolvedSearchPlaceholder}
            autoFocus
          />
          <CommandList role="listbox" label={accessibleLabel || undefined}>
            <CommandEmpty>{resolvedEmptyLabel}</CommandEmpty>
            {options.map((option, index) => {
              const optionValue = String(option.props.value ?? "");
              const optionLabel = textContent(option.props.children);
              const selected = optionValue === selectedValue;
              return (
                <CommandItem
                  key={`${optionValue}-${index}`}
                  value={`${optionLabel} ${optionValue}`}
                  disabled={option.props.disabled}
                  aria-selected={selected}
                  onSelect={() => chooseOption(optionValue)}
                >
                  <span className={cn("multi-select-check", selected && "is-checked")}>
                    {selected ? <Check aria-hidden="true" /> : null}
                  </span>
                  <span>{option.props.children}</span>
                </CommandItem>
              );
            })}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
