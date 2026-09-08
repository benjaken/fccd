import { createContext, useContext, useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
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
  /** @deprecated Search is submitted automatically after typing stops. */
  submitLabel?: string;
  className?: string;
  disabled?: boolean;
  filters?: ReactNode;
  actions?: ReactNode;
  filtersActive?: boolean;
  filtersTitle?: string;
  /** Keep filters in the side panel even on wide screens. */
  filtersAlwaysInDrawer?: boolean;
  /** Commit mobile filter drafts, then the drawer closes. */
  onConfirmFilters?: () => void;
  /** Restore mobile filter drafts when the drawer is dismissed. */
  onDismissFilters?: () => void;
};

const ListSearchBarActionsContext = createContext<ReactNode>(null);

export function ListSearchBarActionsProvider({
  actions,
  children,
}: {
  actions: ReactNode;
  children: ReactNode;
}) {
  return (
    <ListSearchBarActionsContext.Provider value={actions}>
      {children}
    </ListSearchBarActionsContext.Provider>
  );
}

/**
 * Standard operational-list toolbar search with debounced auto-submit.
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
  className,
  disabled = false,
  filters,
  actions,
  filtersActive = false,
  filtersTitle,
  filtersAlwaysInDrawer = false,
  onConfirmFilters,
  onDismissFilters,
}: ListSearchBarProps) {
  const { t } = useTranslation();
  const inheritedActions = useContext(ListSearchBarActionsContext);
  const toolbarActions = actions ?? inheritedActions;
  const isMobile = useIsMobile();
  const [open, setOpen] = useState(false);
  const submitTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onSubmitRef = useRef(onSubmit);
  onSubmitRef.current = onSubmit;

  const cancelScheduledSubmit = () => {
    if (submitTimerRef.current !== null) {
      clearTimeout(submitTimerRef.current);
      submitTimerRef.current = null;
    }
  };

  useEffect(() => cancelScheduledSubmit, []);

  const handleChange = (nextValue: string) => {
    onChange(nextValue);
    cancelScheduledSubmit();
    if (disabled) return;

    submitTimerRef.current = setTimeout(() => {
      submitTimerRef.current = null;
      onSubmitRef.current();
    }, 300);
  };

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    cancelScheduledSubmit();
    onSubmitRef.current();
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
          onChange={handleChange}
          label={label}
          placeholder={placeholder}
          disabled={disabled}
        />
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
      {toolbarActions ? <div className="list-search-actions">{toolbarActions}</div> : null}
      {showFilterDrawer ? (
        <SidePanel
          open={open}
          title={filtersTitle ?? t("common.filters")}
          onClose={dismissFilters}
          closeLabel={t("common.closeFilters")}
          className="list-search-filter-panel"
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
