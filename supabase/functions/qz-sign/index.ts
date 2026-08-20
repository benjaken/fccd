const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function decodePem(pem: string) {
  const base64 = pem
    .replace(/-----BEGIN PRIVATE KEY-----/g, "")
    .replace(/-----END PRIVATE KEY-----/g, "")
    .replace(/\s/g, "");
  if (!base64) throw new Error("QZ_PRIVATE_KEY is empty or invalid.");
  const binary = atob(base64);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

function encodeBase64(bytes: ArrayBuffer) {
  const array = new Uint8Array(bytes);
  let binary = "";
  for (let offset = 0; offset < array.length; offset += 0x8000) {
    binary += String.fromCharCode(...array.subarray(offset, offset + 0x8000));
  }
  return btoa(binary);
}

let signingKey: Promise<CryptoKey> | null = null;

function loadSigningKey() {
  if (signingKey) return signingKey;
  const pem = Deno.env.get("QZ_PRIVATE_KEY")?.trim();
  if (!pem) throw new Error("QZ_PRIVATE_KEY is not configured.");
  signingKey = crypto.subtle.importKey(
    "pkcs8",
    decodePem(pem),
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-512" },
    false,
    ["sign"],
  );
  return signingKey;
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  if (request.method !== "POST") {
    return jsonResponse({ error: "method_not_allowed" }, 405);
  }
  if (!request.headers.get("Authorization")?.startsWith("Bearer ")) {
    return jsonResponse({ error: "authentication_required" }, 401);
  }

  try {
    const body = (await request.json()) as { request?: unknown };
    if (typeof body.request !== "string" || !body.request) {
      return jsonResponse({ error: "request_required" }, 400);
    }
    if (body.request.length > 1_000_000) {
      return jsonResponse({ error: "request_too_large" }, 413);
    }

    const signature = await crypto.subtle.sign(
      "RSASSA-PKCS1-v1_5",
      await loadSigningKey(),
      new TextEncoder().encode(body.request),
    );
    return jsonResponse({ signature: encodeBase64(signature) });
  } catch (error) {
    return jsonResponse(
      {
        error: "qz_sign_failed",
        detail: error instanceof Error ? error.message : String(error),
      },
      500,
    );
  }
});
