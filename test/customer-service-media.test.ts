import { describe, expect, it } from "vitest";

import {
  buildInboundMediaHandoffSummary,
  downloadTrustedInboundMedia,
  isTrustedInboundImageUrl,
  isTrustedWatiMediaUrl,
  mediaStoragePath,
  resolveInboundMediaContentType,
  sniffMediaContentType,
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
    expect(isTrustedWatiMediaUrl(
      "https://live-mt-server.wati.io/api/file/showFile?fileName=data/images/a.jpg",
    )).toBe(true);
    expect(isTrustedWatiMediaUrl(
      "https://live-mt-server.wati.io/2552/api/v1/file/showFile/?fileName=a.jpg",
    )).toBe(true);
    expect(isTrustedWatiMediaUrl("https://example.com/file.jpg")).toBe(false);
    expect(isTrustedInboundImageUrl(
      "https://cdn.shopify.com/s/files/1/0339/0642/5994/files/58.jpg",
    )).toBe(true);
    expect(isTrustedInboundImageUrl("https://example.com/file.jpg")).toBe(false);
    expect(mediaStoragePath({
      environment: "production",
      phone: "+852 9123 4567",
      messageId: "msg/123",
      mediaUrl: protectedUrl,
      contentType: "image/jpeg",
    })).toBe("production/85291234567/msg_123.jpg");
  });

  it("treats octet-stream JPEG bytes as an image", () => {
    const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xd9]);
    expect(sniffMediaContentType(jpeg)).toBe("image/jpeg");
    expect(resolveInboundMediaContentType("application/octet-stream", jpeg))
      .toBe("image/jpeg");
  });

  it("downloads WATI files after an unauthorized token, sniffing the body", async () => {
    const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xd9]);
    const fetchImpl = async (_url: string, init?: RequestInit) => {
      const token = String(
        new Headers(init?.headers).get("authorization") || "",
      );
      if (token.includes("bad-token")) {
        return new Response("denied", { status: 401 });
      }
      return new Response(jpeg, {
        status: 200,
        headers: { "content-type": "application/octet-stream" },
      });
    };

    const downloaded = await downloadTrustedInboundMedia(protectedUrl, {
      tokens: ["bad-token", "good-token"],
      maxBytes: 1024,
      fetchImpl: fetchImpl as typeof fetch,
    });

    expect(downloaded.contentType).toBe("image/jpeg");
    expect(downloaded.dataUrl).toMatch(/^data:image\/jpeg;base64,/);
  });

  it("downloads Shopify catalog images without a WATI token", async () => {
    const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xd9]);
    const fetchImpl = async (_url: string, init?: RequestInit) => {
      expect(new Headers(init?.headers).get("authorization")).toBeNull();
      return new Response(jpeg, {
        status: 200,
        headers: { "content-type": "image/jpeg" },
      });
    };

    const downloaded = await downloadTrustedInboundMedia(
      "https://cdn.shopify.com/s/files/1/0339/0642/5994/files/58.jpg",
      { tokens: [], maxBytes: 1024, fetchImpl: fetchImpl as typeof fetch },
    );
    expect(downloaded.contentType).toBe("image/jpeg");
  });
});
