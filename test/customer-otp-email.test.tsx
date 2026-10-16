import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("customer sign-in email", () => {
  const html = readFileSync("supabase/templates/customer-otp.html", "utf8");

  it("delivers a readable code without a confirmation link", () => {
    const document = new DOMParser().parseFromString(html.replace("{{ .Token }}", "12345678"), "text/html");
    expect(document.body.textContent).toContain("12345678");
    expect(document.body.textContent).toContain("8 位驗證碼");
    expect(document.querySelectorAll("a")).toHaveLength(0);
    expect(html.match(/{{\s*\.Token\s*}}/g)).toHaveLength(1);
    expect(html).not.toContain(".ConfirmationURL");
  });
});
