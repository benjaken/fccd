import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const BUCKET = "customer-reward-catalog";
const MAX_PROMPT = 800;

function json(body: unknown, status = 200) {
  return Response.json(body, { status, headers: cors });
}

function env(...names: string[]) {
  for (const name of names) {
    const value = Deno.env.get(name)?.trim();
    if (value) return value;
  }
  return "";
}

function createAdminClient(): SupabaseClient {
  const key = env("SUPABASE_SERVICE_ROLE_KEY", "SUPABASE_SECRET_KEYS");
  return createClient(env("SUPABASE_URL"), key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

async function requireCatalogEdit(request: Request, admin: SupabaseClient) {
  const authorization = request.headers.get("Authorization");
  if (!authorization?.startsWith("Bearer ")) throw json({ error: "authentication_required" }, 401);
  const token = authorization.slice(7);
  const { data, error } = await admin.auth.getUser(token);
  if (error || !data.user) throw json({ error: "authentication_required" }, 401);
  const role = typeof data.user.app_metadata?.role === "string" ? data.user.app_metadata.role : "";
  if (role !== "Super Admin") {
    const { data: permission, error: permissionError } = await admin
      .from("role_page_permissions")
      .select("can_access")
      .eq("role", role)
      .eq("page_key", "settings.customer_portal.edit")
      .maybeSingle();
    if (permissionError || !permission?.can_access) {
      throw json({ error: "page_access_required" }, 403);
    }
  }
  return data.user.id;
}

function buildPrompt(body: { name?: string; description?: string; kind?: string; prompt?: string }) {
  const custom = typeof body.prompt === "string" ? body.prompt.trim() : "";
  if (custom) return custom.slice(0, MAX_PROMPT);
  const name = typeof body.name === "string" ? body.name.trim() : "";
  const description = typeof body.description === "string" ? body.description.trim() : "";
  const voucher = body.kind === "voucher";
  const parts = [
    voucher
      ? (name
        ? `Hong Kong cash voucher. Only on-image text:「${name}」(Traditional Chinese Hong Kong).`
        : "Hong Kong cash voucher with one Traditional Chinese (Hong Kong) prize title on the image.")
      : (name
        ? `Physical gift product only: ${name}. No text, letters, numbers, captions, watermarks, or logos on the image.`
        : "Physical gift product only. No text, letters, numbers, captions, watermarks, or logos on the image."),
    voucher
      ? "Do not invent prices, ¥/円, HK$, expiry lines, Japanese, Korean, Simplified Chinese, or extra slogans."
      : "Do not invent labels, price tags, packaging copy, or any writing.",
    "Square 1:1 composition. Keep the full subject inside the frame with clear margin; nothing cropped or overflowing.",
    voucher
      ? "Flat 2D Hong Kong coupon / loyalty voucher illustration, soft anime, vector-like, even lighting, minimal depth,"
      : "Flat 2D product catalog illustration, soft anime, vector-like, even lighting, minimal depth,",
    "front-facing centered subject, plain soft background, no 3D, no strong shadows, no brand logo, no extra props.",
    description ? `Visual details only${voucher ? " (do not print as extra copy)" : ""}: ${description}.` : "",
  ].filter(Boolean);
  return parts.join(" ").slice(0, MAX_PROMPT);
}

async function generateImageBytes(prompt: string) {
  const apiKey = env(
    "REWARD_CATALOG_IMAGE_API_KEY",
    "XAI_API_KEY",
    "CUSTOMER_SERVICE_AI_API_KEY",
    "REPORT_AI_API_KEY",
  );
  if (!apiKey) throw json({ error: "image_provider_unconfigured" }, 503);
  const endpoint = env("REWARD_CATALOG_IMAGE_ENDPOINT") || "https://api.x.ai/v1/images/generations";
  const model = env("REWARD_CATALOG_IMAGE_MODEL") || "grok-imagine-image-2.0";
  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      prompt,
      n: 1,
      aspect_ratio: "1:1",
      response_format: "b64_json",
    }),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = typeof payload?.error?.message === "string"
      ? payload.error.message
      : "image_generation_failed";
    throw json({ error: message }, 502);
  }
  const item = Array.isArray(payload?.data) ? payload.data[0] : null;
  if (item?.b64_json && typeof item.b64_json === "string") {
    const binary = atob(item.b64_json);
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
    return { bytes, contentType: "image/png", extension: "png" as const };
  }
  if (item?.url && typeof item.url === "string") {
    const downloaded = await fetch(item.url);
    if (!downloaded.ok) throw json({ error: "image_download_failed" }, 502);
    const bytes = new Uint8Array(await downloaded.arrayBuffer());
    const contentType = downloaded.headers.get("content-type") || "image/png";
    const extension = contentType.includes("webp") ? "webp" : contentType.includes("jpeg") ? "jpg" : "png";
    return { bytes, contentType, extension };
  }
  throw json({ error: "image_generation_failed" }, 502);
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (request.method !== "POST") return json({ error: "method_not_allowed" }, 405);
  try {
    const admin = createAdminClient();
    const userId = await requireCatalogEdit(request, admin);
    const body = await request.json().catch(() => ({}));
    if (body?.action && body.action !== "generate") {
      return json({ error: "unsupported_action" }, 400);
    }
    const prompt = buildPrompt(body ?? {});
    if (!prompt) return json({ error: "invalid_prompt" }, 400);
    const image = await generateImageBytes(prompt);
    const path = `${userId}/ai/${crypto.randomUUID()}.${image.extension}`;
    const uploaded = await admin.storage.from(BUCKET).upload(path, image.bytes, {
      contentType: image.contentType,
      upsert: false,
    });
    if (uploaded.error) throw uploaded.error;
    const signed = await admin.storage.from(BUCKET).createSignedUrl(path, 60 * 60);
    if (signed.error || !signed.data?.signedUrl) {
      await admin.storage.from(BUCKET).remove([path]);
      throw signed.error ?? new Error("signed_url_failed");
    }
    return json({ objectPath: path, signedUrl: signed.data.signedUrl });
  } catch (error) {
    if (error instanceof Response) return error;
    return json({ error: error instanceof Error ? error.message : "image_generation_failed" }, 400);
  }
});
