import { supabase } from "@/lib/supabase";

export const SETTINGS_PAGE_SIZE = 15;

export const SYSTEM_ROLES = [
  "Super Admin",
  "Admin",
  "Accounting",
  "Factory",
  "Shop manager",
  "Customer_Main",
  "Customer_Sub",
] as const;

export type SystemRole = (typeof SYSTEM_ROLES)[number];

export type PageKind = "page" | "subpage" | "tab";

export type UserListItem = {
  id: string;
  email: string | null;
  userName: string | null;
  role: string | null;
  shopRestroLegacyId: string | null;
  createdAt: string;
  updatedAt: string;
};

export type AttachmentListItem = {
  id: string;
  originalFilename: string | null;
  sourceType: string;
  sourceField: string;
  ownerType: string | null;
  ownerLegacyId: string | null;
  bucketId: string;
  objectPath: string | null;
  mimeType: string | null;
  sizeBytes: number | null;
  migrationStatus: string;
  lastErrorCode: string | null;
  verifiedAt: string | null;
  updatedAt: string;
};

export type RolePagePermission = {
  role: SystemRole;
  pageKey: string;
  parentPageKey: string | null;
  pageKind: PageKind;
  displayName: string;
  route: string;
  sortOrder: number;
  isHighRisk: boolean;
  canAccess: boolean;
  canManage: boolean;
  depth: number;
};

type UserRow = {
  id: string;
  email: string | null;
  user_name: string | null;
  role: string | null;
  shop_restro_legacy_id: string | null;
  created_at: string;
  updated_at: string;
};

type AttachmentRow = {
  id: string;
  original_filename: string | null;
  source_type: string;
  source_field: string;
  owner_type: string | null;
  owner_legacy_id: string | null;
  bucket_id: string;
  object_path: string | null;
  mime_type: string | null;
  size_bytes: number | string | null;
  migration_status: string;
  last_error_code: string | null;
  verified_at: string | null;
  updated_at: string;
};

type PermissionRow = {
  role: SystemRole;
  page_key: string;
  can_access: boolean;
  can_manage: boolean;
  app_pages:
    | {
        display_name: string;
        route: string;
        sort_order: number;
        is_high_risk: boolean;
        parent_page_key: string | null;
        page_kind: PageKind | null;
      }
    | {
        display_name: string;
        route: string;
        sort_order: number;
        is_high_risk: boolean;
        parent_page_key: string | null;
        page_kind: PageKind | null;
      }[];
};

function safeSearchTerm(value: string) {
  return value
    .replace(/[^\p{L}\p{N}\s@._+\-]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function isReservedPageKey(pageKey: string) {
  return (
    pageKey === "settings" ||
    pageKey.startsWith("settings.") ||
    pageKey === "migration"
  );
}

function normalizePageKind(value: string | null | undefined): PageKind {
  if (value === "subpage" || value === "tab") return value;
  return "page";
}

function permissionDepth(
  pageKey: string,
  parentByKey: Map<string, string | null>,
) {
  let depth = 0;
  let current = parentByKey.get(pageKey) ?? null;
  const seen = new Set<string>();
  while (current && !seen.has(current)) {
    seen.add(current);
    depth += 1;
    current = parentByKey.get(current) ?? null;
  }
  return depth;
}

/** Collect pageKey plus every descendant key from a flat permission list. */
export function collectDescendantPageKeys(
  pageKey: string,
  permissions: Array<Pick<RolePagePermission, "pageKey" | "parentPageKey">>,
) {
  const childrenByParent = new Map<string, string[]>();
  for (const item of permissions) {
    if (!item.parentPageKey) continue;
    const list = childrenByParent.get(item.parentPageKey) ?? [];
    list.push(item.pageKey);
    childrenByParent.set(item.parentPageKey, list);
  }

  const keys = new Set<string>([pageKey]);
  const queue = [pageKey];
  while (queue.length) {
    const current = queue.shift()!;
    for (const child of childrenByParent.get(current) ?? []) {
      if (keys.has(child)) continue;
      keys.add(child);
      queue.push(child);
    }
  }
  return [...keys];
}

/** When enabling a child, also enable every ancestor. */
export function collectAncestorPageKeys(
  pageKey: string,
  permissions: Array<Pick<RolePagePermission, "pageKey" | "parentPageKey">>,
) {
  const parentByKey = new Map(
    permissions.map((item) => [item.pageKey, item.parentPageKey]),
  );
  const keys: string[] = [];
  let current = parentByKey.get(pageKey) ?? null;
  const seen = new Set<string>();
  while (current && !seen.has(current)) {
    seen.add(current);
    keys.push(current);
    current = parentByKey.get(current) ?? null;
  }
  return keys;
}

export function isPagePermissionLocked(
  role: SystemRole,
  pageKey: string,
) {
  return role === "Super Admin" || isReservedPageKey(pageKey);
}

export async function fetchUsers({
  page,
  search,
  role,
}: {
  page: number;
  search: string;
  role: string;
}) {
  const start = (page - 1) * SETTINGS_PAGE_SIZE;
  const end = start + SETTINGS_PAGE_SIZE - 1;
  let query = supabase
    .from("user_profiles")
    .select(
      "id,email,user_name,role,shop_restro_legacy_id,created_at,updated_at",
      { count: "exact" },
    )
    .order("user_name", { ascending: true, nullsFirst: false })
    .order("email", { ascending: true, nullsFirst: false })
    .range(start, end);

  const term = safeSearchTerm(search);
  if (term) {
    query = query.or(`user_name.ilike.%${term}%,email.ilike.%${term}%`);
  }
  if (role) query = query.eq("role", role);

  const { data, count, error } = await query;
  if (error) throw error;

  return {
    total: count ?? 0,
    items: ((data ?? []) as UserRow[]).map((row) => ({
      id: row.id,
      email: row.email,
      userName: row.user_name,
      role: row.role,
      shopRestroLegacyId: row.shop_restro_legacy_id,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    })) satisfies UserListItem[],
  };
}

export async function fetchAttachments({
  page,
  search,
  status,
}: {
  page: number;
  search: string;
  status: string;
}) {
  const start = (page - 1) * SETTINGS_PAGE_SIZE;
  const end = start + SETTINGS_PAGE_SIZE - 1;
  let query = supabase
    .from("attachments")
    .select(
      "id,original_filename,source_type,source_field,owner_type,owner_legacy_id,bucket_id,object_path,mime_type,size_bytes,migration_status,last_error_code,verified_at,updated_at",
      { count: "exact" },
    )
    .order("updated_at", { ascending: false })
    .range(start, end);

  const term = safeSearchTerm(search);
  if (term) {
    query = query.or(
      `original_filename.ilike.%${term}%,source_type.ilike.%${term}%,owner_legacy_id.ilike.%${term}%`,
    );
  }
  if (status) query = query.eq("migration_status", status);

  const { data, count, error } = await query;
  if (error) throw error;

  return {
    total: count ?? 0,
    items: ((data ?? []) as AttachmentRow[]).map((row) => ({
      id: row.id,
      originalFilename: row.original_filename,
      sourceType: row.source_type,
      sourceField: row.source_field,
      ownerType: row.owner_type,
      ownerLegacyId: row.owner_legacy_id,
      bucketId: row.bucket_id,
      objectPath: row.object_path,
      mimeType: row.mime_type,
      sizeBytes:
        row.size_bytes === null ? null : Number.parseInt(String(row.size_bytes), 10),
      migrationStatus: row.migration_status,
      lastErrorCode: row.last_error_code,
      verifiedAt: row.verified_at,
      updatedAt: row.updated_at,
    })) satisfies AttachmentListItem[],
  };
}

export async function createAttachmentUrl(attachment: AttachmentListItem) {
  if (!attachment.objectPath) throw new Error("attachment_path_missing");
  const { data, error } = await supabase.storage
    .from(attachment.bucketId)
    .createSignedUrl(attachment.objectPath, 60);
  if (error) throw error;
  return data.signedUrl;
}

export async function fetchRolePagePermissions() {
  const { data, error } = await supabase
    .from("role_page_permissions")
    .select(
      "role,page_key,can_access,can_manage,app_pages!inner(display_name,route,sort_order,is_high_risk,parent_page_key,page_kind)",
    );
  if (error) throw error;

  const mapped = ((data ?? []) as unknown as PermissionRow[]).map((row) => {
    const page = Array.isArray(row.app_pages)
      ? row.app_pages[0]
      : row.app_pages;
    return {
      role: row.role,
      pageKey: row.page_key,
      parentPageKey: page.parent_page_key ?? null,
      pageKind: normalizePageKind(page.page_kind),
      displayName: page.display_name,
      route: page.route,
      sortOrder: page.sort_order,
      isHighRisk: page.is_high_risk,
      canAccess: row.can_access,
      canManage: row.can_manage,
      depth: 0,
    } satisfies RolePagePermission;
  });

  const parentByKey = new Map(
    mapped.map((item) => [item.pageKey, item.parentPageKey]),
  );

  return mapped
    .map((item) => ({
      ...item,
      depth: permissionDepth(item.pageKey, parentByKey),
    }))
    .sort((left, right) => {
      const roleOrder =
        SYSTEM_ROLES.indexOf(left.role) - SYSTEM_ROLES.indexOf(right.role);
      if (roleOrder) return roleOrder;
      if (left.sortOrder !== right.sortOrder) {
        return left.sortOrder - right.sortOrder;
      }
      return left.pageKey.localeCompare(right.pageKey);
    });
}

export async function updateRolePagePermission(
  role: SystemRole,
  pageKey: string,
  values: { canAccess: boolean; canManage: boolean },
) {
  const { error } = await supabase
    .from("role_page_permissions")
    .update({
      can_access: values.canAccess,
      can_manage: values.canAccess && values.canManage,
    })
    .eq("role", role)
    .eq("page_key", pageKey);
  if (error) throw error;
}

/**
 * Update a permission row and cascade:
 * - parent access ON → all descendants access ON (children fully opened)
 * - parent access OFF → descendants access+manage OFF
 * - parent manage ON/OFF → descendants manage matches (access forced ON when manage ON)
 * - child access/manage ON → ancestors access ON (manage cascades up only for manage)
 */
export async function updateRolePagePermissionCascade(
  role: SystemRole,
  pageKey: string,
  field: "canAccess" | "canManage",
  checked: boolean,
  permissions: RolePagePermission[],
  savePermission: typeof updateRolePagePermission = updateRolePagePermission,
) {
  const rolePermissions = permissions.filter((item) => item.role === role);
  const current = rolePermissions.find((item) => item.pageKey === pageKey);
  if (!current) throw new Error("permission_not_found");

  const descendantKeys = collectDescendantPageKeys(pageKey, rolePermissions);
  const ancestorKeys = collectAncestorPageKeys(pageKey, rolePermissions);
  const updates = new Map<string, { canAccess: boolean; canManage: boolean }>();

  for (const key of descendantKeys) {
    const row = rolePermissions.find((item) => item.pageKey === key);
    const isRoot = key === pageKey;
    if (field === "canAccess") {
      updates.set(key, {
        canAccess: checked,
        canManage: isRoot
          ? checked
            ? Boolean(row?.canManage)
            : false
          : // Children fully open when parent access is selected.
            checked,
      });
    } else {
      updates.set(key, {
        canAccess: checked ? true : Boolean(row?.canAccess),
        canManage: checked,
      });
    }
  }

  if (checked) {
    for (const key of ancestorKeys) {
      const row = rolePermissions.find((item) => item.pageKey === key);
      updates.set(key, {
        canAccess: true,
        canManage:
          field === "canManage" ? true : Boolean(row?.canManage),
      });
    }
  }

  for (const [key, value] of [...updates.entries()]) {
    if (role === "Super Admin") {
      updates.set(key, { canAccess: true, canManage: true });
    } else if (isPagePermissionLocked(role, key)) {
      updates.set(key, { canAccess: false, canManage: false });
    } else {
      updates.set(key, {
        canAccess: value.canAccess,
        canManage: value.canAccess && value.canManage,
      });
    }
  }

  await Promise.all(
    [...updates.entries()].map(([key, value]) =>
      savePermission(role, key, value),
    ),
  );

  return updates;
}
