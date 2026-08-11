const ALLOWED_HOST = "cs.foodchannels-catering.com";
const ALLOWED_PATHS = new Set([
  "/api/1.1/obj",
  "/version-test/api/1.1/obj",
]);

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

type ScanRequest = {
  baseUrl?: unknown;
  objectType?: unknown;
};

type BubbleListResponse = {
  response?: {
    cursor?: number;
    results?: unknown[];
    count?: number;
    remaining?: number;
  };
  message?: string;
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function validateBaseUrl(value: unknown) {
  if (typeof value !== "string") {
    throw new Error("Bubble Base URL is required.");
  }

  const url = new URL(value.trim());
  const pathname = url.pathname.replace(/\/+$/, "");

  if (
    url.protocol !== "https:" ||
    url.hostname !== ALLOWED_HOST ||
    !ALLOWED_PATHS.has(pathname) ||
    url.port ||
    url.username ||
    url.password ||
    url.search ||
    url.hash
  ) {
    throw new Error(
      "Only the FCCD production or version-test Bubble Data API is allowed.",
    );
  }

  return `${url.origin}${pathname}`;
}

function validateObjectType(value: unknown) {
  if (
    typeof value !== "string" ||
    !value.trim() ||
    value.length > 120 ||
    /[/\\\u0000-\u001f\u007f]/.test(value)
  ) {
    throw new Error("Invalid Bubble object type.");
  }

  return value;
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (request.method !== "POST") {
    return jsonResponse({ error: "Method not allowed." }, 405);
  }

  try {
    const body = (await request.json()) as ScanRequest;
    const baseUrl = validateBaseUrl(body.baseUrl);
    const objectType = validateObjectType(body.objectType);
    const sourceUrl = `${baseUrl}/${encodeURIComponent(objectType)}`;
    const bubbleToken = Deno.env.get("BUBBLE_API_TOKEN")?.trim();
    const headers: HeadersInit = { Accept: "application/json" };

    if (bubbleToken) {
      headers.Authorization = `Bearer ${bubbleToken}`;
    }

    const bubbleResponse = await fetch(`${sourceUrl}?limit=1&cursor=0`, {
      headers,
      signal: AbortSignal.timeout(30_000),
    });
    const payload = (await bubbleResponse.json().catch(() => null)) as
      | BubbleListResponse
      | null;

    if (!bubbleResponse.ok) {
      return jsonResponse(
        {
          error:
            payload?.message ||
            `Bubble API returned HTTP ${bubbleResponse.status}.`,
        },
        bubbleResponse.status === 401 ? 401 : 502,
      );
    }

    if (!payload?.response || !Array.isArray(payload.response.results)) {
      return jsonResponse(
        { error: "Bubble API returned an unexpected response." },
        502,
      );
    }

    const cursor = payload.response.cursor ?? 0;
    const pageCount =
      payload.response.count ?? payload.response.results.length;
    const remaining = payload.response.remaining ?? 0;

    return jsonResponse({
      count: cursor + pageCount + remaining,
      requestUrl: sourceUrl,
    });
  } catch (error) {
    return jsonResponse(
      {
        error:
          error instanceof Error
            ? error.message
            : "Unable to scan Bubble object.",
      },
      400,
    );
  }
});

