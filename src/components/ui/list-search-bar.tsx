import type { FormEvent } from "react";

import { Button } from "@/components/ui/button";
import { SearchField } from "@/components/ui/search-field";
import { cn } from "@/lib/utils";

export type ListSearchBarProps = {
  id: string;
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  label: string;
  placeholder?: string;
  submitLabel: string;
  className?: string;
  disabled?: boolean;
};

/**
 * Standard operational-list toolbar search: in-field icon + submit button.
 * Use across orders, quotes, products, settings lists, etc.
 */
export function ListSearchBar({
  id,
  value,
  onChange,
  onSubmit,
  label,
  placeholder,
  submitLabel,
  className,
  disabled = false,
}: ListSearchBarProps) {
  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    onSubmit();
  };

  return (
    <form className={cn("list-search", className)} onSubmit={handleSubmit}>
      <SearchField
        id={id}
        value={value}
        onChange={onChange}
        label={label}
        placeholder={placeholder}
        disabled={disabled}
      />
      <Button type="submit" variant="outline" disabled={disabled}>
        {submitLabel}
      </Button>
    </form>
  );
}
