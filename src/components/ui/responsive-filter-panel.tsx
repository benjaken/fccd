import { useState, type ReactNode } from "react";
import { SlidersHorizontal } from "lucide-react";
import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/button";
import { SidePanel } from "@/components/ui/side-panel";
import { useIsMobile } from "@/lib/use-media-query";
import { cn } from "@/lib/utils";

export function ResponsiveFilterPanel({
  children,
  active = false,
  className,
}: {
  children: ReactNode;
  active?: boolean;
  className?: string;
}) {
  const { t } = useTranslation();
  const isMobile = useIsMobile();
  const [open, setOpen] = useState(false);

  if (!isMobile) return <div className={cn("responsive-filter-desktop", className)}>{children}</div>;

  return (
    <div className={cn("responsive-filter-host", className)}>
      <Button
        type="button"
        variant="outline"
        className={cn("responsive-filter-trigger", active && "is-active")}
        onClick={() => setOpen(true)}
        aria-label={t("common.openFilters")}
        aria-expanded={open}
        aria-haspopup="dialog"
      >
        <SlidersHorizontal />
        <span>{t("common.filters")}</span>
      </Button>
      <SidePanel
        open={open}
        title={t("common.filters")}
        onClose={() => setOpen(false)}
        closeLabel={t("common.closeFilters")}
        footer={<Button type="button" className="responsive-filter-apply" onClick={() => setOpen(false)}>{t("common.applyFilters")}</Button>}
      >
        <div className="responsive-filter-drawer">{children}</div>
      </SidePanel>
    </div>
  );
}
