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
  /** Keep filters in the side panel even on wide screens. */
  filtersAlwaysInDrawer?: boolean;
  /** Commit mobile filter drafts, then the drawer closes. */
  onConfirmFilters?: () => void;
  /** Restore mobile filter drafts when the drawer is dismissed. */
  onDismissFilters?: () => void;
};

/**
 * Standard operational-list toolbar search: in-field icon + submit button.
 * On mobile the field stays visible; extra filters move behind a trailing icon.
 * Changing those filters is a draft until 確定, which applies them and closes
 * the drawer.
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
  filtersAlwaysInDrawer = false,
  onConfirmFilters,
  onDismissFilters,
}: ListSearchBarProps) {
  const { t } = useTranslation();
  const isMobile = useIsMobile();
  const [open, setOpen] = useState(false);

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    onSubmit();
  };

  const dismissFilters = () => {
    onDismissFilters?.();
    setOpen(false);
  };

  const applyFilters = () => {
    onConfirmFilters?.();
    setOpen(false);
  };

  const showFilterDrawer = Boolean(filters) && (isMobile || filtersAlwaysInDrawer);

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
        {showFilterDrawer ? (
          <Button
            type="button"
            variant="outline"
            size={filtersAlwaysInDrawer ? "default" : "icon"}
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
            {filtersAlwaysInDrawer ? <span>{filtersTitle ?? t("common.filters")}</span> : null}
          </Button>
        ) : null}
      </form>
      {filters && !showFilterDrawer ? (
        <div className="list-search-filters">{filters}</div>
      ) : null}
      {showFilterDrawer ? (
        <SidePanel
          open={open}
          title={filtersTitle ?? t("common.filters")}
          onClose={dismissFilters}
          closeLabel={t("common.closeFilters")}
          footer={
            <Button
              type="button"
              className="list-search-filter-apply"
              onClick={applyFilters}
            >
              {t("common.applyFilters")}
            </Button>
          }
        >
          <div className="list-search-filter-drawer">{filters}</div>
        </SidePanel>
      ) : null}
    </div>
  );
}
