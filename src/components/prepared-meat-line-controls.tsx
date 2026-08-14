import { useState } from "react";

import { coercePreparedMeatQuantityInput } from "@/lib/prepared-meat-inventory";

export type PreparedMeatSearchOption = {
  id: string;
  name: string;
  sku?: string | null;
};

export function PreparedMeatQuantityInput({
  value,
  onChange,
  disabled,
  placeholder,
  ariaLabel,
}: {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  placeholder: string;
  ariaLabel: string;
}) {
  return (
    <input
      type="text"
      inputMode="decimal"
      autoComplete="off"
      pattern="[0-9]*[.]?[0-9]*"
      value={value}
      disabled={disabled}
      placeholder={placeholder}
      aria-label={ariaLabel}
      onBeforeInput={(event) => {
        if (
          typeof event.data === "string" &&
          event.data.length > 0 &&
          !/[\d.０-９．]/.test(event.data)
        ) {
          event.preventDefault();
        }
      }}
      onChange={(event) =>
        onChange(coercePreparedMeatQuantityInput(event.target.value))
      }
    />
  );
}

export function PreparedMeatItemSearchSelect({
  label,
  placeholder,
  value,
  options,
  disabled,
  onChange,
}: {
  label: string;
  placeholder: string;
  value: string;
  options: PreparedMeatSearchOption[];
  disabled?: boolean;
  onChange: (id: string) => void;
}) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const selected = options.find((option) => option.id === value) ?? null;
  const needle = query.trim().toLocaleLowerCase("zh-HK");
  const available = options.filter((option) => {
    if (!needle) return true;
    return (
      option.name.toLocaleLowerCase("zh-HK").includes(needle) ||
      (option.sku ?? "").toLocaleLowerCase("zh-HK").includes(needle)
    );
  });

  return (
    <div className="prepared-meat-outbound-item-picker">
      <input
        role="combobox"
        aria-label={label}
        aria-expanded={open}
        aria-autocomplete="list"
        autoComplete="off"
        disabled={disabled}
        placeholder={placeholder}
        value={open ? query : (selected?.name ?? "")}
        onFocus={() => {
          setQuery("");
          setOpen(true);
        }}
        onChange={(event) => {
          setQuery(event.target.value);
          setOpen(true);
          if (value) onChange("");
        }}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            const first = available[0];
            if (first) {
              onChange(first.id);
              setQuery("");
              setOpen(false);
            }
          }
          if (event.key === "Escape") setOpen(false);
        }}
        onBlur={() => {
          window.setTimeout(() => setOpen(false), 120);
        }}
      />
      {open && !disabled ? (
        <ul className="raw-meat-tag-menu" role="listbox" aria-label={label}>
          {available.length === 0 ? (
            <li className="raw-meat-tag-empty">{placeholder}</li>
          ) : (
            available.map((option) => (
              <li key={option.id} role="presentation">
                <button
                  type="button"
                  role="option"
                  aria-selected={option.id === value}
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => {
                    onChange(option.id);
                    setQuery("");
                    setOpen(false);
                  }}
                >
                  {option.name}
                </button>
              </li>
            ))
          )}
        </ul>
      ) : null}
    </div>
  );
}
