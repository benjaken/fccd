import { describe, expect, it } from "vitest";

import {
  buildTelUrl,
  buildWhatsAppCallUrl,
  resolveWhatsAppCallStatus,
  toWhatsAppNumber,
} from "@/lib/shop-whatsapp-call";

describe("shop WhatsApp call helpers", () => {
  it("normalizes local 8-digit Hong Kong numbers", () => {
    expect(toWhatsAppNumber("6123 4567")).toBe("85261234567");
    expect(toWhatsAppNumber("+852 6123-4567")).toBe("85261234567");
    expect(toWhatsAppNumber("85261234567")).toBe("85261234567");
  });

  it("opens a native WhatsApp call, not WATI or wa.me chat", () => {
    expect(buildWhatsAppCallUrl("61234567")).toBe("whatsapp://call?number=85261234567");
    expect(buildTelUrl("61234567")).toBe("tel:+85261234567");
    expect(buildWhatsAppCallUrl("")).toBeNull();
  });

  it("blocks a call when there is no usable number", () => {
    expect(resolveWhatsAppCallStatus(null)).toBe("whatsapp_blocked_no_phone");
    expect(resolveWhatsAppCallStatus("   ")).toBe("whatsapp_blocked_no_phone");
    expect(resolveWhatsAppCallStatus("61234567")).toBe("whatsapp_call_opened");
  });
});
