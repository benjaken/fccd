import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cron-secret",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

type StaffRow = {
  staff_id: number;
  display_name: string | null;
  full_name: string | null;
  chinese_name: string | null;
  work_email: string | null;
  company_phone: string | null;
  private_email: string | null;
  private_phone: string | null;
  entry_date: string | null;
  termination_date: string | null;
  base_location: string | null;
  company_id: number | null;
  company: string | null;
  brand_ids: string[];
  team_id: string | null;
  team_name: string | null;
  position: string | null;
  image_url: string | null;
  status: string;
  created_at: string;
  updated_at: string;
  role: string | null;
};

type ProfileRow = {
  id: string;
  email: string | null;
  login_enabled: boolean;
  login_disabled_reason: string | null;
};

type ExistingEmployeeRow = {
  source_staff_id: number;
  linked_user_id: string | null;
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function requiredEnv(name: string) {
  const value = Deno.env.get(name)?.trim();
  if (!value) throw new Error(`missing_${name.toLowerCase()}`);
  return value;
}

function serviceKey() {
  const legacy = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")?.trim();
  if (legacy) return legacy;
  const configured = Deno.env.get("SUPABASE_SECRET_KEYS");
  if (configured) {
    const keys = JSON.parse(configured) as Record<string, string>;
    if (keys.default) return keys.default;
  }
  throw new Error("missing_supabase_service_role_key");
}

function adminClient() {
  return createClient(requiredEnv("SUPABASE_URL"), serviceKey(), {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

function sourceClient() {
  return createClient(
    requiredEnv("OTC2_SUPABASE_URL"),
    requiredEnv("OTC2_SERVICE_ROLE_KEY"),
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
}

function normalizeEmail(value: string | null | undefined) {
  const email = value?.trim().toLowerCase() ?? "";
  return email && email !== "n/a" ? email : "";
}

function isActive(row: StaffRow) {
  return row.status.trim().toLowerCase() === "active";
}

async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(value),
  );
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

async function constantTimeEqual(left: string, right: string) {
  const [a, b] = await Promise.all([sha256Hex(left), sha256Hex(right)]);
  let difference = a.length ^ b.length;
  for (let index = 0; index < a.length; index += 1) {
    difference |= a.charCodeAt(index) ^ b.charCodeAt(index);
  }
  return difference === 0;
}

async function authenticateCron(request: Request, admin: SupabaseClient) {
  const supplied = request.headers.get("x-cron-secret")?.trim();
  if (!supplied) return false;
  const { data, error } = await admin
    .from("bubble_incremental_cron_auth")
    .select("secret_sha256")
    .eq("singleton", true)
    .single();
  if (error || !data?.secret_sha256) return false;
  return constantTimeEqual(await sha256Hex(supplied), String(data.secret_sha256));
}

async function fetchAllStaff(source: SupabaseClient) {
  const rows: StaffRow[] = [];
  const pageSize = 1000;
  for (let start = 0; ; start += pageSize) {
    const { data, error } = await source
      .from("staff_sync")
      .select(
        "staff_id,display_name,full_name,chinese_name,work_email,company_phone,private_email,private_phone,entry_date,termination_date,base_location,company_id,company,brand_ids,team_id,team_name,position,image_url,status,created_at,updated_at,role",
      )
      .range(start, start + pageSize - 1);
    if (error) throw new Error(`source_staff_fetch_failed:${error.message}`);
    const page = (data ?? []) as StaffRow[];
    rows.push(...page);
    if (page.length < pageSize) break;
  }
  return rows;
}

function emailsFor(row: StaffRow) {
  return [normalizeEmail(row.work_email), normalizeEmail(row.private_email)]
    .filter(Boolean);
}

async function syncStaff(admin: SupabaseClient, source: SupabaseClient) {
  const sourceRows = await fetchAllStaff(source);
  const activeRows = sourceRows.filter(isActive);
  const activeByEmail = new Map<string, StaffRow>();
  const inactiveEmails = new Set<string>();
  for (const row of sourceRows) {
    for (const email of emailsFor(row)) {
      if (isActive(row)) activeByEmail.set(email, row);
      else inactiveEmails.add(email);
    }
  }

  const [{ data: profilesData, error: profilesError }, { data: existingData, error: existingError }] =
    await Promise.all([
      admin
        .from("user_profiles")
        .select("id,email,login_enabled,login_disabled_reason"),
      admin
        .from("company_employees")
        .select("source_staff_id,linked_user_id")
        .eq("source_system", "otc2"),
    ]);
  if (profilesError) throw new Error(`profile_fetch_failed:${profilesError.message}`);
  if (existingError) throw new Error(`employee_fetch_failed:${existingError.message}`);

  const profiles = (profilesData ?? []) as ProfileRow[];
  const existing = (existingData ?? []) as ExistingEmployeeRow[];
  const profileByEmail = new Map(
    profiles
      .map((profile) => [normalizeEmail(profile.email), profile] as const)
      .filter(([email]) => Boolean(email)),
  );
  const desiredStaffByUser = new Map<string, number>();
  for (const row of activeRows) {
    const profile = emailsFor(row)
      .map((email) => profileByEmail.get(email))
      .find(Boolean);
    if (profile) desiredStaffByUser.set(profile.id, row.staff_id);
  }

  // Clear obsolete links first so a reused company email can move to its
  // current employee without violating the unique linked_user_id constraint.
  const staleLinks = existing.filter(
    (row) =>
      row.linked_user_id &&
      desiredStaffByUser.get(row.linked_user_id) !== row.source_staff_id,
  );
  for (const row of staleLinks) {
    const { error } = await admin
      .from("company_employees")
      .update({ linked_user_id: null })
      .eq("source_system", "otc2")
      .eq("source_staff_id", row.source_staff_id);
    if (error) throw new Error(`employee_unlink_failed:${error.message}`);
  }

  const existingIds = new Set(existing.map((row) => row.source_staff_id));
  const rowsToPersist = sourceRows.filter(
    (row) => isActive(row) || existingIds.has(row.staff_id),
  );
  const syncedAt = new Date().toISOString();
  const payload = rowsToPersist.map((row) => {
    const matchedProfile = isActive(row)
      ? emailsFor(row).map((email) => profileByEmail.get(email)).find(Boolean)
      : undefined;
    const profile =
      matchedProfile &&
      desiredStaffByUser.get(matchedProfile.id) === row.staff_id
        ? matchedProfile
        : undefined;
    return {
      source_system: "otc2",
      source_staff_id: row.staff_id,
      display_name: row.display_name,
      full_name: row.full_name,
      chinese_name: row.chinese_name,
      work_email: row.work_email,
      company_phone: row.company_phone,
      private_email: row.private_email,
      private_phone: row.private_phone,
      entry_date: row.entry_date,
      termination_date: row.termination_date,
      base_location: row.base_location,
      company_id: row.company_id,
      company: row.company,
      brand_ids: row.brand_ids ?? [],
      team_id: row.team_id,
      team_name: row.team_name,
      position: row.position,
      image_url: row.image_url,
      source_role: row.role,
      source_status: row.status,
      is_active: isActive(row),
      source_created_at: row.created_at,
      source_updated_at: row.updated_at,
      linked_user_id: profile?.id ?? null,
      last_synced_at: syncedAt,
    };
  });
  if (payload.length) {
    const { error } = await admin
      .from("company_employees")
      .upsert(payload, { onConflict: "source_system,source_staff_id" });
    if (error) throw new Error(`employee_upsert_failed:${error.message}`);
  }

  let disabled = 0;
  let reenabled = 0;
  for (const profile of profiles) {
    const email = normalizeEmail(profile.email);
    if (!email) continue;
    const hasActiveSource = activeByEmail.has(email);
    const hasInactiveSource = inactiveEmails.has(email);

    if (hasActiveSource && profile.login_disabled_reason === "otc2_inactive") {
      const { error: authError } = await admin.auth.admin.updateUserById(
        profile.id,
        { ban_duration: "none" },
      );
      if (authError) throw new Error(`account_reenable_failed:${authError.message}`);
      const { error: profileError } = await admin
        .from("user_profiles")
        .update({
          login_enabled: true,
          login_disabled_at: null,
          login_disabled_reason: null,
        })
        .eq("id", profile.id);
      if (profileError) throw new Error(`profile_reenable_failed:${profileError.message}`);
      reenabled += 1;
    } else if (!hasActiveSource && hasInactiveSource) {
      // Enforce the Auth ban on every sync, even when the companion profile
      // flag is already false. This self-heals an accidentally removed ban.
      const { error: authError } = await admin.auth.admin.updateUserById(
        profile.id,
        { ban_duration: "876000h" },
      );
      if (authError) throw new Error(`account_disable_failed:${authError.message}`);
      if (
        profile.login_enabled ||
        profile.login_disabled_reason !== "otc2_inactive"
      ) {
        const { error: profileError } = await admin
          .from("user_profiles")
          .update({
            login_enabled: false,
            login_disabled_at: syncedAt,
            login_disabled_reason: "otc2_inactive",
          })
          .eq("id", profile.id);
        if (profileError) throw new Error(`profile_disable_failed:${profileError.message}`);
        disabled += 1;
      }
    }
  }

  return {
    sourceTotal: sourceRows.length,
    activeEmployees: activeRows.length,
    persistedEmployees: rowsToPersist.length,
    linkedAccounts: desiredStaffByUser.size,
    disabledAccounts: disabled,
    reenabledAccounts: reenabled,
    localAccountsUntouched: profiles.filter((profile) => {
      const email = normalizeEmail(profile.email);
      return email && !activeByEmail.has(email) && !inactiveEmails.has(email);
    }).length,
  };
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST") return jsonResponse({ error: "method_not_allowed" }, 405);

  try {
    const admin = adminClient();
    if (!(await authenticateCron(request, admin))) {
      return jsonResponse({ error: "invalid_cron_secret" }, 401);
    }
    return jsonResponse({ ok: true, ...(await syncStaff(admin, sourceClient())) });
  } catch (error) {
    return jsonResponse(
      {
        ok: false,
        error: "otc2_staff_sync_failed",
        detail: error instanceof Error ? error.message : String(error),
      },
      500,
    );
  }
});
