import { forwardRef } from "react";
import { Link, useLocation, type LinkProps } from "react-router-dom";

import { detailFromLocation } from "@/lib/detail-navigation";

export const DetailLink = forwardRef<HTMLAnchorElement, LinkProps>(
  function DetailLink({ state, target, rel, ...props }, ref) {
    const location = useLocation();
    const extra = state && typeof state === "object" ? state : null;
    const pathname = typeof props.to === "string" ? props.to.split(/[?#]/, 1)[0] : props.to.pathname;
    const opensInNewPage = /^\/(?:orders|quotes)\/[^/]+\/?$/.test(pathname ?? "");
    return (
      <Link
        ref={ref}
        {...props}
        state={{ ...detailFromLocation(location), ...extra }}
        target={target ?? (opensInNewPage ? "_blank" : undefined)}
        rel={rel ?? (opensInNewPage ? "noopener noreferrer" : undefined)}
      />
    );
  },
);
