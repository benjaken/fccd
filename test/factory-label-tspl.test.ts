import { describe, expect, it, vi } from "vitest";

import {
  buildFactoryLabelBytes,
  encodeFactoryLabelBase64,
  packFactoryBitmapPixels,
  wrapFactoryLabelText,
  type FactoryTextRasterizer,
} from "@/lib/factory-label";

const fakeRasterizer: FactoryTextRasterizer = vi.fn(async (_text, options) => ({
  width: options.width,
  height: options.height,
  bytes: new Uint8Array((options.width / 8) * options.height).fill(0xaa),
}));

function latin1(bytes: Uint8Array): string {
  return String.fromCharCode(...bytes);
}

describe("factory label bitmap TSPL", () => {
  it("wraps Traditional Chinese by grapheme without splitting characters", () => {
    expect(wrapFactoryLabelText("彩椒炒豬頸肉飯分開膠袋裝", 8)).toEqual([
      "彩椒炒豬頸肉飯分",
      "開膠袋裝",
    ]);
  });

  it("counts digits and ASCII punctuation as half-width when wrapping", () => {
    expect(wrapFactoryLabelText("尽量10:30送到", 8)).toEqual(["尽量10:30送到"]);
  });

  it("preserves database label fields as separate bitmap lines", async () => {
    const rasterizer = vi.fn<FactoryTextRasterizer>(fakeRasterizer);
    await buildFactoryLabelBytes({
      orderNumber: "B-1",
      deliveryDate: "2026-08-24",
      labelName: "童趣拼盤(台灣腸蟹蓋\n肉丸年糕各6件)",
      remarks: [],
      copies: 1,
    }, rasterizer);

    expect(rasterizer).toHaveBeenCalledWith("童趣拼盤(台灣腸蟹蓋", expect.objectContaining({ fontSize: 40 }));
    expect(rasterizer).toHaveBeenCalledWith("肉丸年糕各6件)", expect.objectContaining({ fontSize: 40 }));
  });

  it("packs black and white pixels MSB first using TSPL polarity", () => {
    const rgba = new Uint8ClampedArray([
      0, 0, 0, 255,
      255, 255, 255, 255,
      0, 0, 0, 255,
      255, 255, 255, 255,
      0, 0, 0, 255,
      255, 255, 255, 255,
      0, 0, 0, 255,
      255, 255, 255, 255,
    ]);
    expect([...packFactoryBitmapPixels(rgba, 8, 1)]).toEqual([0x55]);
  });

  it("builds one 50x75 bitmap-text label per requested copy", async () => {
    const rasterizer = vi.fn<FactoryTextRasterizer>(fakeRasterizer);
    const bytes = await buildFactoryLabelBytes({
      orderNumber: "B-11795",
      deliveryDate: "2026-08-21",
      labelName: "彩椒炒豬頸肉飯",
      remarks: ["分開膠袋裝", "不要餐具"],
      copies: 2,
    }, rasterizer);
    const tspl = latin1(bytes);

    expect(tspl.match(/SIZE 50 mm,75 mm/g)).toHaveLength(2);
    expect(tspl.match(/BITMAP /g)?.length).toBeGreaterThan(10);
    expect(tspl.match(/PRINT 1\r\n/g)).toHaveLength(2);
    expect(tspl).not.toContain("CODEPAGE 950");
    expect(tspl).not.toContain("TST24.BF2");
    expect(rasterizer).toHaveBeenCalledWith("B-11795", expect.objectContaining({ fontSize: 48 }));
    expect(rasterizer).toHaveBeenCalledWith("21/08/2026（五）", expect.objectContaining({ fontSize: 30 }));
    expect(rasterizer).toHaveBeenCalledWith(
      "1份 / 共2份",
      expect.objectContaining({ fontSize: 32, trailingBox: true }),
    );
    expect(rasterizer).toHaveBeenCalledWith("彩椒炒豬頸肉飯", expect.objectContaining({ fontSize: 40 }));
  });

  it("keeps address text out of the TSPL command bytes", async () => {
    const rasterizer = vi.fn<FactoryTextRasterizer>(fakeRasterizer);
    const bytes = await buildFactoryLabelBytes({
      kind: "address",
      orderNumber: "B-1546",
      address: "沙田香港恒生大學何善衡教學大樓A座",
      arrivalWindow: "12:00 - 13:00",
      customerName: "Ka Wai Hui",
      customerPhone: "91027090",
    }, rasterizer);
    const tspl = latin1(bytes);

    expect(tspl).toContain("BITMAP 8,");
    expect(tspl).toContain("BAR 16,86,368,2\r\n");
    expect(tspl).not.toContain("Ka Wai Hui");
    expect(tspl).not.toContain("91027090");
    expect(rasterizer).toHaveBeenCalledWith("地址：", expect.any(Object));
    expect(rasterizer).toHaveBeenCalledWith("沙田香港恒生大學何善衡教學大", expect.any(Object));
  });

  it("base64-encodes arbitrary bitmap bytes without transcoding", () => {
    const bytes = new Uint8Array([0x00, 0x7f, 0x80, 0xff]);
    const encoded = encodeFactoryLabelBase64(bytes);
    expect([...Uint8Array.from(atob(encoded), (character) => character.charCodeAt(0))])
      .toEqual([...bytes]);
  });
});
