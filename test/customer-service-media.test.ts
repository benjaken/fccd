import { describe, expect, it } from "vitest";

import {
  buildInboundMediaHandoffSummary,
  isTrustedWatiMediaUrl,
  mediaStoragePath,
} from "../supabase/functions/_shared/customer-service-media";

describe("customer service inbound media", () => {
  const protectedUrl =
    "https://live-mt-server.wati.io/2552/api/file/showFile?fileName=data/images/02668ae1-f910-4acc-86af-023b10ed550e.jpg";

  it("replaces the protected WATI URL with the mirrored attachment link", () => {
    const summary = buildInboundMediaHandoffSummary({
      label: "圖片",
      caption: "餐單相片",
      originalUrl: protectedUrl,
      attachmentUrl: "https://storage.example.com/signed/customer-image.jpg",
    });

    expect(summary).toContain("查看客人圖片：https://storage.example.com/signed/customer-image.jpg");
    expect(summary).not.toContain("live-mt-server.wati.io");
  });

  it("does not put a broken protected URL in email when mirroring fails", () => {
    const summary = buildInboundMediaHandoffSummary({
      label: "圖片",
      caption: "餐單相片",
      originalUrl: protectedUrl,
      attachmentUrl: null,
    });

    expect(summary).toContain("請到 WATI 對話查看原檔");
    expect(summary).not.toContain(protectedUrl);
  });

  it("only accepts WATI file endpoints and builds stable private paths", () => {
    expect(isTrustedWatiMediaUrl(protectedUrl)).toBe(true);
    expect(isTrustedWatiMediaUrl("https://example.com/file.jpg")).toBe(false);
    expect(mediaStoragePath({
      environment: "production",
      phone: "+852 9123 4567",
      messageId: "msg/123",
      mediaUrl: protectedUrl,
      contentType: "image/jpeg",
    })).toBe("production/85291234567/msg_123.jpg");
  });
});
