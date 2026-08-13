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
  displayName: string;
  route: string;
  sortOrder: number;
  isHighRisk: boolean;
  canAccess: boolean;
  canManage: boolean;
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
      }
    | {
        display_name: string;
        route: string;
        sort_order: number;
        is_high_risk: boolean;
      }[];
};

function safeSearchTerm(value: string) {
  return value
    .replace(/[^\p{L}\p{N}\s@._+\-]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
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
      "role,page_key,can_access,can_manage,app_pages!inner(display_name,route,sort_order,is_high_risk)",
    );
  if (error) throw error;

  return ((data ?? []) as unknown as PermissionRow[])
    .map((row) => {
      const page = Array.isArray(row.app_pages)
        ? row.app_pages[0]
        : row.app_pages;
      return {
        role: row.role,
        pageKey: row.page_key,
        displayName: page.display_name,
        route: page.route,
        sortOrder: page.sort_order,
        isHighRisk: page.is_high_risk,
        canAccess: row.can_access,
        canManage: row.can_manage,
      } satisfies RolePagePermission;
    })
    .sort((left, right) => {
      const roleOrder =
        SYSTEM_ROLES.indexOf(left.role) - SYSTEM_ROLES.indexOf(right.role);
      return roleOrder || left.sortOrder - right.sortOrder;
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
