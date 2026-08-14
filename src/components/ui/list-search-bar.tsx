import { useState, type FormEvent, type ReactNode } from "react";
import { SlidersHorizontal } from "lucide-react";
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
  filters?: ReactNode;
  filtersActive?: boolean;
  filtersTitle?: string;
};

/**
 * Standard operational-list toolbar search: in-field icon + submit button.
 * On mobile the field stays visible; extra filters move behind a trailing icon.
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
  filters,
  filtersActive = false,
  filtersTitle,
}: ListSearchBarProps) {
  const { t } = useTranslation();
  const isMobile = useIsMobile();
  const [open, setOpen] = useState(false);

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    onSubmit();
  };

  return (
    <div className={cn("list-search-host", className)}>
      <form className="list-search" onSubmit={handleSubmit}>
        <SearchField
          id={id}
          value={value}
          onChange={onChange}
          label={label}
          placeholder={placeholder}
          disabled={disabled}
        />
        <Button
          type="submit"
          variant="outline"
          className="list-search-submit"
          disabled={disabled}
        >
          {submitLabel}
        </Button>
        {filters && isMobile ? (
          <Button
            type="button"
            variant="outline"
            size="icon"
            className={cn(
              "list-search-filter-trigger",
              filtersActive && "is-active",
            )}
            onClick={() => setOpen(true)}
            aria-label={t("common.openFilters")}
            aria-expanded={open}
            aria-haspopup="dialog"
            disabled={disabled}
          >
            <SlidersHorizontal />
          </Button>
        ) : null}
      </form>
      {filters && !isMobile ? (
        <div className="list-search-filters">{filters}</div>
      ) : null}
      {filters && isMobile ? (
        <SidePanel
          open={open}
          title={filtersTitle ?? t("common.filters")}
          onClose={() => setOpen(false)}
          closeLabel={t("common.closeFilters")}
        >
          <div className="list-search-filter-drawer">{filters}</div>
        </SidePanel>
      ) : null}
    </div>
  );
}
