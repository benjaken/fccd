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

export type PageKind = "page" | "subpage" | "tab" | "action";

export type UserListItem = {
  id: string;
  email: string | null;
  userName: string | null;
  phone: string | null;
  role: string | null;
  shopRestroLegacyId: string | null;
  createdAt: string;
  updatedAt: string;
};

export type RestaurantOption = {
  legacyId: string;
  name: string;
  isActive: boolean;
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
  sourceModifiedAt: string | null;
  updatedAt: string;
};

export const ATTACHMENT_FILE_TYPES = [
  "image",
  "pdf",
  "csv",
  "document",
  "other",
] as const;

export type AttachmentFileType = (typeof ATTACHMENT_FILE_TYPES)[number];

export function attachmentFileType(
  attachment: Pick<AttachmentListItem, "mimeType" | "originalFilename">,
): AttachmentFileType {
  const mime = (attachment.mimeType ?? "").toLowerCase();
  const name = (attachment.originalFilename ?? "").toLowerCase();

  if (mime.startsWith("image/") || /\.(png|jpe?g|gif|webp|svg|bmp)$/.test(name)) {
    return "image";
  }
  if (mime.includes("pdf") || name.endsWith(".pdf")) {
    return "pdf";
  }
  if (
    mime === "text/csv" ||
    mime.includes("csv") ||
    mime.includes("spreadsheet") ||
    mime.includes("excel") ||
    /\.(csv|xlsx?|ods)$/.test(name)
  ) {
    return "csv";
  }
  if (
    mime.startsWith("text/") ||
    mime.includes("word") ||
    mime.includes("document") ||
    /\.(docx?|txt|rtf|md)$/.test(name)
  ) {
    return "document";
  }
  return "other";
}

export function attachmentFileTypeLabelKey(type: AttachmentFileType) {
  return `settings.attachments.fileTypes.${type}` as const;
}

function hongKongDayStartIso(date: string) {
  return `${date}T00:00:00+08:00`;
}

function hongKongNextDayStartIso(date: string) {
  const [year, month, day] = date.split("-").map(Number);
  const next = new Date(Date.UTC(year, month - 1, day));
  next.setUTCDate(next.getUTCDate() + 1);
  const yyyy = next.getUTCFullYear();
  const mm = String(next.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(next.getUTCDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}T00:00:00+08:00`;
}

export const LOGIN_LOG_EVENT_TYPES = [
  "login_success",
  "login_failure",
  "logout",
  "password_reset_request",
] as const;

export type LoginLogEventType = (typeof LOGIN_LOG_EVENT_TYPES)[number];

export type LoginLogItem = {
  id: string;
  eventType: LoginLogEventType;
  email: string | null;
  userId: string | null;
  userName: string | null;
  role: string | null;
  ipAddress: string | null;
  userAgent: string | null;
  errorCode: string | null;
  createdAt: string;
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
  phone: string | null;
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
  source_modified_at: string | null;
  updated_at: string;
};

type LoginLogRow = {
  id: string;
  event_type: LoginLogEventType;
  email: string | null;
  user_id: string | null;
  user_name: string | null;
  role: string | null;
  ip_address: string | null;
  user_agent: string | null;
  error_code: string | null;
  created_at: string;
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

export function isValidEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

export function normalizePhoneInput(value: string) {
  return value.trim();
}

/** Hong Kong phone: 8 digits (2–9…), optional +852 / 852 country code. */
export function isValidPhone(value: string) {
  const trimmed = normalizePhoneInput(value);
  if (!trimmed) return true;
  if (!/^[0-9+\-\s()]+$/.test(trimmed)) return false;
  let digits = trimmed.replace(/\D/g, "");
  if (digits.startsWith("852") && digits.length === 11) {
    digits = digits.slice(3);
  }
  return /^[2-9]\d{7}$/.test(digits);
}

export function isValidPassword(value: string) {
  return value.length >= 8 && /[A-Za-z]/.test(value) && /\d/.test(value);
}

export type CreateUserInput = {
  email: string;
  password: string;
  userName: string;
  phone?: string;
  role: SystemRole;
  shopRestroLegacyId?: string;
};

export type UpdateUserProfileInput = {
  userId: string;
  userName: string;
  role: SystemRole;
  phone?: string;
  shopRestroLegacyId?: string;
};

/** Action-level permission keys under the users settings page. */
export const USER_ACTION_PERMISSION_KEYS = {
  create: "settings.users.create",
  edit: "settings.users.edit",
  changePassword: "settings.users.change_password",
} as const;

async function invokeAdminUsers<T>(body: Record<string, unknown>) {
  const {
    data: { session },
    error: sessionError,
  } = await supabase.auth.getSession();
  if (sessionError) throw sessionError;
  if (!session?.access_token) throw new Error("missing_authorization");

  const { data, error } = await supabase.functions.invoke("admin-users", {
    body,
    headers: {
      Authorization: `Bearer ${session.access_token}`,
    },
  });
  if (error) {
    const context = (error as { context?: Response }).context;
    if (context) {
      try {
        const payload = (await context.json()) as { error?: string };
        if (payload.error) throw new Error(payload.error);
      } catch (parseError) {
        if (parseError instanceof Error && parseError.message !== "Unexpected end of JSON input") {
          throw parseError;
        }
      }
    }
    throw error;
  }
  if (data && typeof data === "object" && "error" in data) {
    throw new Error(String((data as { error: string }).error));
  }
  return data as T;
}

export async function createManagedUser(input: CreateUserInput) {
  const email = input.email.trim();
  const userName = input.userName.trim();
  const phone = normalizePhoneInput(input.phone ?? "");
  if (!isValidEmail(email)) throw new Error("invalid_email");
  if (!userName) throw new Error("invalid_user_name");
  if (!isValidPhone(phone)) throw new Error("invalid_phone");
  if (!isValidPassword(input.password)) throw new Error("invalid_password");

  const result = await invokeAdminUsers<{
    user: {
      id: string;
      email: string;
      userName: string;
      phone: string | null;
      role: SystemRole;
      shopRestroLegacyId: string | null;
    };
  }>({
    action: "create",
    email,
    password: input.password,
    userName,
    phone: phone || null,
    role: input.role,
    shopRestroLegacyId: input.shopRestroLegacyId?.trim() || null,
  });
  return result.user;
}

export async function updateManagedUserPassword(
  userId: string,
  password: string,
) {
  if (!userId) throw new Error("invalid_user_id");
  if (!isValidPassword(password)) throw new Error("invalid_password");
  await invokeAdminUsers({
    action: "updatePassword",
    userId,
    password,
  });
}

export async function updateManagedUserProfile(input: UpdateUserProfileInput) {
  const userName = input.userName.trim();
  const phone = normalizePhoneInput(input.phone ?? "");
  if (!input.userId) throw new Error("invalid_user_id");
  if (!userName) throw new Error("invalid_user_name");
  if (!isValidPhone(phone)) throw new Error("invalid_phone");

  const result = await invokeAdminUsers<{
    user: {
      id: string;
      userName: string;
      role: SystemRole;
      phone: string | null;
      shopRestroLegacyId: string | null;
    };
  }>({
    action: "updateProfile",
    userId: input.userId,
    userName,
    role: input.role,
    phone: phone || null,
    shopRestroLegacyId: input.shopRestroLegacyId?.trim() || null,
  });
  return result.user;
}

function isReservedPageKey(pageKey: string) {
  // Only migration remains exclusively Super Admin; settings pages are
  // permission-driven through role_page_permissions.
  return pageKey === "migration";
}

function normalizePageKind(value: string | null | undefined): PageKind {
  if (value === "subpage" || value === "tab" || value === "action") return value;
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
  // Super Admin grants are always on (DB enforced). Migration stays reserved.
  return role === "Super Admin" || isReservedPageKey(pageKey);
}

export async function fetchRestaurantOptions() {
  const { data, error } = await supabase
    .from("restaurants")
    .select("legacy_id,name,is_active")
    .is("archived_at", null)
    .order("name", { ascending: true });
  if (error) throw error;

  return ((data ?? []) as Array<{
    legacy_id: string;
    name: string;
    is_active: boolean;
  }>)
    .filter((row) => row.is_active)
    .map(
      (row) =>
        ({
          legacyId: row.legacy_id,
          name: row.name,
          isActive: row.is_active,
        }) satisfies RestaurantOption,
    );
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
      "id,email,user_name,phone,role,shop_restro_legacy_id,created_at,updated_at",
      { count: "exact" },
    )
    .order("user_name", { ascending: true, nullsFirst: false })
    .order("email", { ascending: true, nullsFirst: false })
    .range(start, end);

  const term = safeSearchTerm(search);
  if (term) {
    query = query.or(
      `user_name.ilike.%${term}%,email.ilike.%${term}%,phone.ilike.%${term}%`,
    );
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
      phone: row.phone,
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
  fileType = "",
  startDate = "",
  endDate = "",
}: {
  page: number;
  search: string;
  status: string;
  fileType?: string;
  startDate?: string;
  endDate?: string;
}) {
  const start = (page - 1) * SETTINGS_PAGE_SIZE;
  const end = start + SETTINGS_PAGE_SIZE - 1;
  let query = supabase
    .from("attachments")
    .select(
      "id,original_filename,source_type,source_field,owner_type,owner_legacy_id,bucket_id,object_path,mime_type,size_bytes,migration_status,last_error_code,verified_at,source_modified_at,updated_at",
      { count: "exact" },
    )
    // Bubble "Modified Date" — original system time, not migration updated_at.
    .order("source_modified_at", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false })
    .range(start, end);

  const term = safeSearchTerm(search);
  if (term) {
    query = query.or(
      `original_filename.ilike.%${term}%,source_type.ilike.%${term}%,owner_legacy_id.ilike.%${term}%`,
    );
  }
  if (status) query = query.eq("migration_status", status);

  if (fileType === "image") {
    query = query.like("mime_type", "image/%");
  } else if (fileType === "pdf") {
    query = query.eq("mime_type", "application/pdf");
  } else if (fileType === "csv") {
    query = query.or(
      "mime_type.eq.text/csv,mime_type.ilike.%csv%,mime_type.ilike.%spreadsheet%,mime_type.ilike.%excel%,original_filename.ilike.%.csv,original_filename.ilike.%.xls,original_filename.ilike.%.xlsx",
    );
  } else if (fileType === "document") {
    query = query.or(
      "mime_type.like.text/%,mime_type.ilike.%word%,mime_type.ilike.%document%,original_filename.ilike.%.doc,original_filename.ilike.%.docx,original_filename.ilike.%.txt,original_filename.ilike.%.rtf,original_filename.ilike.%.md",
    );
    query = query.neq("mime_type", "text/csv");
  } else if (fileType === "other") {
    query = query
      .not("mime_type", "like", "image/%")
      .neq("mime_type", "application/pdf")
      .neq("mime_type", "text/csv")
      .not("mime_type", "like", "text/%");
  }

  if (startDate) {
    query = query.gte("source_modified_at", hongKongDayStartIso(startDate));
  }
  if (endDate) {
    query = query.lt("source_modified_at", hongKongNextDayStartIso(endDate));
  }

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
      sourceModifiedAt: row.source_modified_at,
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

export async function fetchLoginLogs({
  page,
  search,
  eventType,
}: {
  page: number;
  search: string;
  eventType: string;
}) {
  const start = (page - 1) * SETTINGS_PAGE_SIZE;
  const end = start + SETTINGS_PAGE_SIZE - 1;
  let query = supabase
    .from("login_logs")
    .select(
      "id,event_type,email,user_id,user_name,role,ip_address,user_agent,error_code,created_at",
      { count: "exact" },
    )
    .order("created_at", { ascending: false })
    .range(start, end);

  const term = safeSearchTerm(search);
  if (term) {
    query = query.or(
      `email.ilike.%${term}%,user_name.ilike.%${term}%,ip_address.ilike.%${term}%`,
    );
  }
  if (eventType) query = query.eq("event_type", eventType);

  const { data, count, error } = await query;
  if (error) throw error;

  return {
    total: count ?? 0,
    items: ((data ?? []) as LoginLogRow[]).map((row) => ({
      id: row.id,
      eventType: row.event_type,
      email: row.email,
      userId: row.user_id,
      userName: row.user_name,
      role: row.role,
      ipAddress: row.ip_address,
      userAgent: row.user_agent,
      errorCode: row.error_code,
      createdAt: row.created_at,
    })) satisfies LoginLogItem[],
  };
}

export async function recordLoginEvent(input: {
  eventType: LoginLogEventType;
  email?: string | null;
  userId?: string | null;
  errorCode?: string | null;
}) {
  try {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    await supabase.functions.invoke("login-log", {
      body: {
        eventType: input.eventType,
        email: input.email ?? null,
        userId: input.userId ?? null,
        errorCode: input.errorCode ?? null,
      },
      headers: session?.access_token
        ? { Authorization: `Bearer ${session.access_token}` }
        : undefined,
    });
  } catch {
    // Login logging must never block authentication UX.
  }
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
