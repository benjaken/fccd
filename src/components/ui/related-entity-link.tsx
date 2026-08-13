import type { ReactNode } from "react";
import { Link } from "react-router-dom";

import { cn } from "@/lib/utils";

/** Clickable related-record link used across catalog list/detail tables. */
export function RelatedEntityLink({
  to,
  children,
  className,
}: {
  to: string | null | undefined;
  children: ReactNode;
  className?: string;
}) {
  if (!to) {
    return <span className={className}>{children}</span>;
  }

  return (
    <Link className={cn("order-link", className)} to={to}>
      {children}
    </Link>
  );
}

export function catalogChannelPath(
  channelId: string,
  scope: "products" | "packages" = "products",
) {
  const base = scope === "packages" ? "/products/packages" : "/products";
  return `${base}?channel=${encodeURIComponent(channelId)}`;
}

export function catalogProductTypePath(productTypeId: string) {
  return `/products?type=${encodeURIComponent(productTypeId)}`;
}

export function catalogProductPath(productId: string) {
  return `/products/${productId}`;
}

export function catalogPackagePath(packageId: string) {
  return `/products/packages/${packageId}`;
}
