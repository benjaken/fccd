import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SYSTEM_ROLES = [
  "Super Admin",
  "Admin",
  "Accounting",
  "Factory",
  "Shop manager",
  "Customer_Main",
  "Customer_Sub",
] as const;

type SystemRole = (typeof SYSTEM_ROLES)[number];

type CreatePayload = {
  action: "create";
  email: string;
  password: string;
  userName: string;
  phone?: string | null;
  role: SystemRole;
  shopRestroLegacyId?: string | null;
};

type UpdatePasswordPayload = {
  action: "updatePassword";
  userId: string;
  password: string;
};

type Payload = CreatePayload | UpdatePasswordPayload;

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function secretKey() {
  const legacy = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")?.trim();
  if (legacy) return legacy;
  const configured = Deno.env.get("SUPABASE_SECRET_KEYS");
  if (configured) {
    const keys = JSON.parse(configured) as Record<string, string>;
    if (keys.default) return keys.default;
  }
  throw new Error("Supabase server secret is not configured.");
}

function createAdminClient() {
  return createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    secretKey(),
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
}

type AdminClient = ReturnType<typeof createAdminClient>;

function isEmailValid(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function normalizePhone(value: string | null | undefined) {
  if (value == null) return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function isPhoneValid(value: string | null) {
  if (!value) return true;
  if (!/^[0-9+\-\s()]+$/.test(value)) return false;
  const digits = value.replace(/\D/g, "");
  return digits.length >= 8 && digits.length <= 15;
}

function isPasswordValid(value: string) {
  return value.length >= 8 && /[A-Za-z]/.test(value) && /\d/.test(value);
}

function isSystemRole(value: string): value is SystemRole {
  return (SYSTEM_ROLES as readonly string[]).includes(value);
}

async function requireSuperAdmin(request: Request, admin: AdminClient) {
  const authorization = request.headers.get("Authorization");
  if (!authorization?.startsWith("Bearer ")) {
    throw jsonResponse({ error: "missing_authorization" }, 401);
  }
  const token = authorization.slice("Bearer ".length);
  const {
    data: { user },
    error,
  } = await admin.auth.getUser(token);
  if (error || !user) {
    throw jsonResponse({ error: "invalid_authorization" }, 401);
  }
  if (user.app_metadata?.role !== "Super Admin") {
    throw jsonResponse({ error: "super_admin_required" }, 403);
  }
  return user;
}

function parsePayload(value: unknown): Payload {
  if (!value || typeof value !== "object") {
    throw jsonResponse({ error: "invalid_payload" }, 400);
  }
  const body = value as Record<string, unknown>;
  if (body.action === "create") {
    return {
      action: "create",
      email: typeof body.email === "string" ? body.email.trim() : "",
      password: typeof body.password === "string" ? body.password : "",
      userName: typeof body.userName === "string" ? body.userName.trim() : "",
      phone: normalizePhone(
        typeof body.phone === "string" ? body.phone : null,
      ),
      role: typeof body.role === "string" ? (body.role as SystemRole) : "Admin",
      shopRestroLegacyId:
        typeof body.shopRestroLegacyId === "string"
          ? body.shopRestroLegacyId.trim() || null
          : null,
    };
  }
  if (body.action === "updatePassword") {
    return {
      action: "updatePassword",
      userId: typeof body.userId === "string" ? body.userId.trim() : "",
      password: typeof body.password === "string" ? body.password : "",
    };
  }
  throw jsonResponse({ error: "unsupported_action" }, 400);
}

async function createUser(admin: AdminClient, payload: CreatePayload) {
  if (!isEmailValid(payload.email)) {
    throw jsonResponse({ error: "invalid_email" }, 400);
  }
  if (!payload.userName) {
    throw jsonResponse({ error: "invalid_user_name" }, 400);
  }
  if (!isPhoneValid(payload.phone)) {
    throw jsonResponse({ error: "invalid_phone" }, 400);
  }
  if (!isPasswordValid(payload.password)) {
    throw jsonResponse({ error: "invalid_password" }, 400);
  }
  if (!isSystemRole(payload.role)) {
    throw jsonResponse({ error: "invalid_role" }, 400);
  }

  const { data, error } = await admin.auth.admin.createUser({
    email: payload.email,
    password: payload.password,
    email_confirm: true,
    app_metadata: { role: payload.role },
    user_metadata: {
      user_name: payload.userName,
      phone: payload.phone,
    },
  });
  if (error || !data.user) {
    const message = error?.message?.toLowerCase() ?? "";
    if (message.includes("already") || message.includes("registered")) {
      throw jsonResponse({ error: "email_already_registered" }, 409);
    }
    throw jsonResponse(
      { error: "user_create_failed", detail: error?.message ?? null },
      500,
    );
  }

  const { error: profileError } = await admin
    .from("user_profiles")
    .update({
      user_name: payload.userName,
      phone: payload.phone,
      role: payload.role,
      shop_restro_legacy_id: payload.shopRestroLegacyId,
    })
    .eq("id", data.user.id);
  if (profileError) {
    throw jsonResponse(
      { error: "profile_update_failed", detail: profileError.message },
      500,
    );
  }

  return {
    id: data.user.id,
    email: data.user.email ?? payload.email,
    userName: payload.userName,
    phone: payload.phone,
    role: payload.role,
    shopRestroLegacyId: payload.shopRestroLegacyId,
  };
}

async function updatePassword(
  admin: AdminClient,
  payload: UpdatePasswordPayload,
) {
  if (!payload.userId) {
    throw jsonResponse({ error: "invalid_user_id" }, 400);
  }
  if (!isPasswordValid(payload.password)) {
    throw jsonResponse({ error: "invalid_password" }, 400);
  }

  const { data, error } = await admin.auth.admin.updateUserById(payload.userId, {
    password: payload.password,
  });
  if (error || !data.user) {
    throw jsonResponse(
      { error: "password_update_failed", detail: error?.message ?? null },
      500,
    );
  }
  return { id: data.user.id };
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  if (request.method !== "POST") {
    return jsonResponse({ error: "method_not_allowed" }, 405);
  }

  try {
    const admin = createAdminClient();
    await requireSuperAdmin(request, admin);
    const payload = parsePayload(await request.json());
    if (payload.action === "create") {
      return jsonResponse({ user: await createUser(admin, payload) }, 201);
    }
    return jsonResponse({ user: await updatePassword(admin, payload) });
  } catch (error) {
    if (error instanceof Response) return error;
    return jsonResponse(
      {
        error: "admin_users_failed",
        detail: error instanceof Error ? error.message : String(error),
      },
      500,
    );
  }
});
