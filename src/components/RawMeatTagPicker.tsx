import { useMemo, useState } from "react";
import { X } from "lucide-react";

import type { RawMeatSupplierOption } from "@/lib/raw-meat-inventory";

export function RawMeatTagPicker({
  label,
  values,
  options,
  onChange,
  multiple = true,
  placeholder,
  disabled,
}: {
  label: string;
  values: string[];
  options: RawMeatSupplierOption[];
  onChange: (next: string[]) => void;
  multiple?: boolean;
  placeholder: string;
  disabled?: boolean;
}) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);

  const selected = useMemo(
    () =>
      values
        .map((id) => options.find((option) => option.id === id))
        .filter((option): option is RawMeatSupplierOption => Boolean(option)),
    [options, values],
  );

  const available = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase("zh-HK");
    return options.filter((option) => {
      if (values.includes(option.id) && multiple) return false;
      if (!needle) return true;
      return option.name.toLocaleLowerCase("zh-HK").includes(needle);
    });
  }, [multiple, options, query, values]);

  const select = (id: string) => {
    if (disabled) return;
    onChange(multiple ? [...values.filter((value) => value !== id), id] : [id]);
    setQuery("");
    if (!multiple) setOpen(false);
  };

  const remove = (id: string) => {
    if (disabled) return;
    onChange(values.filter((value) => value !== id));
  };

  return (
    <div className="raw-meat-tag-picker">
      <span>{label}</span>
      <div
        className={
          disabled ? "raw-meat-tag-field is-disabled" : "raw-meat-tag-field"
        }
      >
        {selected.map((option) => (
          <span key={option.id} className="raw-meat-tag">
            {option.name}
            <button
              type="button"
              aria-label={`移除 ${option.name}`}
              title={option.name}
              disabled={disabled}
              onClick={() => remove(option.id)}
            >
              <X />
            </button>
          </span>
        ))}
        <input
          value={query}
          disabled={disabled}
          placeholder={selected.length === 0 ? placeholder : ""}
          aria-label={label}
          aria-expanded={open}
          aria-haspopup="listbox"
          onFocus={() => setOpen(true)}
          onChange={(event) => {
            setQuery(event.target.value);
            setOpen(true);
          }}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              const first = available[0];
              if (first) select(first.id);
            }
            if (event.key === "Escape") {
              setOpen(false);
            }
          }}
          onBlur={() => {
            window.setTimeout(() => setOpen(false), 120);
          }}
        />
      </div>
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
                  aria-selected={values.includes(option.id)}
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => select(option.id)}
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
