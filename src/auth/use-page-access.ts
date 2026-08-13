import { useEffect, useMemo, useState } from "react";

import { supabase } from "@/lib/supabase";

type PermissionValue = {
  canAccess: boolean;
  canManage: boolean;
};

export function pageAccessKey(pathname: string) {
  if (pathname === "/" || pathname.startsWith("/follow-up")) return "overview";
  if (pathname.startsWith("/profile")) return "profile";
  if (pathname.startsWith("/settings/users")) return "settings.users";
  if (pathname.startsWith("/settings/roles")) return "settings.roles";
  if (pathname.startsWith("/settings/attachments")) {
    return "settings.attachments";
  }
  if (pathname.startsWith("/finance")) return "finance";
  if (pathname.startsWith("/inventory")) return "inventory";

  const segment = pathname.split("/")[1];
  return segment || "overview";
}

export function usePageAccess(role: string | null | undefined) {
  const isSuperAdmin = role === "Super Admin";
  const [permissions, setPermissions] = useState<Map<string, PermissionValue>>(
    new Map(),
  );
  const [loading, setLoading] = useState(!isSuperAdmin);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isSuperAdmin) {
      setPermissions(new Map());
      setLoading(false);
      setError(null);
      return;
    }
    if (!role) {
      setPermissions(new Map());
      setLoading(false);
      return;
    }

    let active = true;
    setLoading(true);
    setError(null);
    void supabase
      .from("role_page_permissions")
      .select("page_key,can_access,can_manage")
      .eq("role", role)
      .then(({ data, error: loadError }) => {
        if (!active) return;
        if (loadError) {
          setPermissions(new Map());
          setError(loadError.code || "page_permissions_failed");
        } else {
          setPermissions(
            new Map(
              (data ?? []).map((item) => [
                item.page_key,
                {
                  canAccess: item.can_access,
                  canManage: item.can_manage,
                },
              ]),
            ),
          );
        }
        setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [isSuperAdmin, role]);

  return useMemo(
    () => ({
      isSuperAdmin,
      loading,
      error,
      canAccess: (pageKey: string) =>
        pageKey === "profile" ||
        isSuperAdmin ||
        permissions.get(pageKey)?.canAccess === true,
      canManage: (pageKey: string) =>
        isSuperAdmin || permissions.get(pageKey)?.canManage === true,
    }),
    [error, isSuperAdmin, loading, permissions],
  );
}
