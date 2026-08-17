import { forwardRef } from "react";
import { Link, useLocation, type LinkProps } from "react-router-dom";

import { detailFromLocation } from "@/lib/detail-navigation";

export const DetailLink = forwardRef<HTMLAnchorElement, LinkProps>(
  function DetailLink({ state, ...props }, ref) {
    const location = useLocation();
    const extra = state && typeof state === "object" ? state : null;
    return (
      <Link
        ref={ref}
        {...props}
        state={{ ...detailFromLocation(location), ...extra }}
      />
    );
  },
);
