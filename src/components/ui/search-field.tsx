import type { InputHTMLAttributes } from "react";
import { Search } from "lucide-react";

import { cn } from "@/lib/utils";

export type SearchFieldProps = Omit<
  InputHTMLAttributes<HTMLInputElement>,
  "id" | "value" | "onChange" | "type"
> & {
  id: string;
  value: string;
  onChange: (value: string) => void;
  /** Accessible name; rendered as sr-only text inside the field. */
  label: string;
};

/**
 * Shared toolbar search input with the magnifying-glass icon inside the field.
 * Do not place a loose Search icon beside this control.
 */
export function SearchField({
  id,
  value,
  onChange,
  label,
  className,
  placeholder,
  ...inputProps
}: SearchFieldProps) {
  return (
    <label className={cn("search-field", className)} htmlFor={id}>
      <Search aria-hidden="true" />
      <span className="sr-only">{label}</span>
      <input
        id={id}
        type="search"
        value={value}
        placeholder={placeholder}
        onChange={(event) => onChange(event.target.value)}
        {...inputProps}
      />
    </label>
  );
}
