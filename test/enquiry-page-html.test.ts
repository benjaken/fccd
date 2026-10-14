import { describe, expect, it } from "vitest";
import { sanitizeEnquiryHtml } from "@/lib/enquiry-page-html";

describe("enquiry page html", () => {
  it("keeps formatted copy and drops scripts", () => {
    const clean = sanitizeEnquiryHtml('<h2>到會查詢</h2><p>歡迎</p><script>alert(1)</script><a href="javascript:alert(1)" onclick="hack()">連結</a>');
    expect(clean).toContain("<h2>到會查詢</h2>");
    expect(clean).toContain("<p>歡迎</p>");
    expect(clean).not.toContain("script");
    expect(clean).not.toContain("javascript:");
    expect(clean).not.toContain("onclick");
  });
});
