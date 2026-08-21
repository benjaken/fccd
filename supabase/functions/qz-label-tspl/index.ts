import iconv from "npm:iconv-lite@0.6.3";

import { buildFactoryLabelTspl, type FactoryLabelTsplInput } from "./tspl.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function encodeBase64(bytes: Uint8Array): string {
  let binary = "";
  for (let offset = 0; offset < bytes.length; offset += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
  }
  return btoa(binary);
}

function isValidInput(value: unknown): value is FactoryLabelTsplInput {
  if (!value || typeof value !== "object") return false;
  const input = value as Record<string, unknown>;
  return typeof input.orderNumber === "string" &&
    typeof input.deliveryDate === "string" &&
    typeof input.labelName === "string" &&
    Array.isArray(input.remarks) && input.remarks.every((entry) => typeof entry === "string") &&
    typeof input.copies === "number";
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST") return jsonResponse({ error: "method_not_allowed" }, 405);
  if (!request.headers.get("Authorization")?.startsWith("Bearer ")) {
    return jsonResponse({ error: "authentication_required" }, 401);
  }

  try {
    const body = await request.json();
    if (!isValidInput(body)) return jsonResponse({ error: "invalid_label_input" }, 400);
    if (body.orderNumber.length > 100 || body.labelName.length > 500 || body.remarks.join("").length > 1000) {
      return jsonResponse({ error: "label_input_too_large" }, 413);
    }
    const tspl = buildFactoryLabelTspl(body);
    const cp950Bytes = iconv.encode(tspl, "cp950");
    return jsonResponse({ commandBase64: encodeBase64(cp950Bytes) });
  } catch (error) {
    return jsonResponse({
      error: "label_generation_failed",
      detail: error instanceof Error ? error.message : String(error),
    }, 500);
  }
});
