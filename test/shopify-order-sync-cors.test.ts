import { describe, expect, it } from "vitest";
import {
  corsHeaders,
  jsonResponse,
} from "../supabase/functions/shopify-order-sync/response.ts";

describe("Shopify order sync CORS responses", () => {
  it("allows the browser preflight headers used by Supabase Functions", () => {
    expect(corsHeaders["Access-Control-Allow-Origin"]).toBe("*");
    expect(corsHeaders["Access-Control-Allow-Methods"]).toContain("POST");
    expect(corsHeaders["Access-Control-Allow-Headers"]).toContain("authorization");
    expect(corsHeaders["Access-Control-Allow-Headers"]).toContain("apikey");
    expect(corsHeaders["Access-Control-Allow-Headers"]).toContain("content-type");
  });

  it.each([200, 400, 401, 405, 500, 502])(
    "adds CORS headers to a %i JSON response",
    (status) => {
      const response = jsonResponse({ ok: status === 200 }, status);

      expect(response.status).toBe(status);
      expect(response.headers.get("Access-Control-Allow-Origin")).toBe("*");
      expect(response.headers.get("Content-Type")).toBe("application/json");
      expect(response.headers.get("Cache-Control")).toBe("no-store");
    },
  );
});
