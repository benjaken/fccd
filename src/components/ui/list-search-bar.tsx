import { useState, type FormEvent } from "react";
import { Search } from "lucide-react";
import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/button";
import { SearchField } from "@/components/ui/search-field";
import { SidePanel } from "@/components/ui/side-panel";
import { useIsMobile } from "@/lib/use-media-query";
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
 * On mobile the field is hidden behind a trigger that opens a side drawer.
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
  const { t } = useTranslation();
  const isMobile = useIsMobile();
  const [open, setOpen] = useState(false);

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    onSubmit();
    setOpen(false);
  };

  const form = (
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

  if (!isMobile) return form;

  return (
    <div className="list-search-mobile">
      <Button
        type="button"
        variant="outline"
        size="icon"
        className={cn("list-search-trigger", value.trim() && "is-active")}
        onClick={() => setOpen(true)}
        aria-label={t("common.openSearch")}
        aria-expanded={open}
        aria-haspopup="dialog"
        disabled={disabled}
      >
        <Search />
      </Button>
      <SidePanel
        open={open}
        title={label}
        onClose={() => setOpen(false)}
        closeLabel={t("common.closeSearch")}
      >
        {form}
      </SidePanel>
    </div>
  );
}
