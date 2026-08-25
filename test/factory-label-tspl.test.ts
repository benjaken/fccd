import { describe, expect, it, vi } from "vitest";

import {
  buildFactoryLabelBytes,
  buildFactoryDishLabelLayout,
  combineFactoryLabelBase64,
  encodeFactoryLabelBase64,
  packFactoryBitmapPixels,
  rotateFactoryBitmapClockwise,
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
  it("builds the 50 by 75 mm preview from the same wrapped print layout", () => {
    expect(buildFactoryDishLabelLayout({
      orderNumber: "#B-11795",
      deliveryDate: "2026-08-21",
      labelName: "彩椒炒豬頸肉飯餐盒",
      remarks: ["分開膠袋裝", "不要餐具"],
      copies: 2,
    })).toMatchObject({
      widthMm: 50,
      heightMm: 75,
      orderNumber: "B-11795",
      copies: 2,
      labelLines: ["彩椒炒豬頸肉飯餐", "盒"],
      remarkLines: ["分開膠袋裝", "不要餐具"],
    });
  });

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

    expect(rasterizer).toHaveBeenCalledWith(
      "童趣拼盤(台灣腸",
      expect.objectContaining({ width: 384, fontSize: 54 }),
    );
    expect(rasterizer).toHaveBeenCalledWith(
      "肉丸年糕各6件)",
      expect.objectContaining({ width: 384, fontSize: 54 }),
    );
  });

  it("limits every rendered dish and remark line to eight characters", async () => {
    const rasterizer = vi.fn<FactoryTextRasterizer>(fakeRasterizer);
    await buildFactoryLabelBytes({
      orderNumber: "B-1",
      deliveryDate: "2026-08-24",
      labelName: "123456789",
      remarks: ["ABCDEFGHI"],
      copies: 1,
    }, rasterizer);

    for (const line of ["12345678", "9", "ABCDEFGH", "I"]) {
      expect(rasterizer).toHaveBeenCalledWith(
        line,
        expect.objectContaining({ width: 384 }),
      );
    }
  });

  it("keeps the dish at the top of the body with remarks underneath", async () => {
    const rasterizer = vi.fn<FactoryTextRasterizer>(fakeRasterizer);
    const bytes = await buildFactoryLabelBytes({
      orderNumber: "B-1",
      deliveryDate: "2026-08-24",
      labelName: "叉燒飯",
      remarks: ["走蔥", "少鹽"],
      copies: 1,
    }, rasterizer);
    const tspl = latin1(bytes);

    expect(tspl).toContain("BITMAP 100,0,25,120,0,");
    expect(tspl).toContain("BITMAP 8,288,48,60,0,");
    expect(tspl).toContain("BITMAP 8,364,48,52,0,");
    expect(tspl).toContain("BITMAP 8,440,48,52,0,");
    expect(rasterizer).toHaveBeenCalledWith(
      "叉燒飯",
      expect.objectContaining({ width: 384, align: "center", fontSize: 54 }),
    );
    expect(
      rasterizer.mock.calls.every(([, options]) => options.align === "center"),
    ).toBe(true);
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

  it("rotates address bitmaps clockwise for sideways printing", () => {
    const rotated = rotateFactoryBitmapClockwise({
      width: 8,
      height: 8,
      bytes: new Uint8Array([0x7f, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff]),
    });

    expect(rotated.width).toBe(8);
    expect(rotated.height).toBe(8);
    expect([...rotated.bytes]).toEqual([
      0xfe, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff,
    ]);
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
    expect(rasterizer).toHaveBeenCalledWith(
      "B-11795",
      expect.objectContaining({ width: 200, height: 120, fontSize: 120 }),
    );
    expect(rasterizer).toHaveBeenCalledWith("－ 送貨日期 －", expect.objectContaining({ fontSize: 30 }));
    expect(rasterizer).toHaveBeenCalledWith("21/08/2026（五）", expect.objectContaining({ fontSize: 46 }));
    expect(rasterizer).toHaveBeenCalledWith(
      "1份 / 共2份",
      expect.objectContaining({ fontSize: 32, trailingBox: true }),
    );
    expect(rasterizer).toHaveBeenCalledWith(
      "彩椒炒豬頸肉飯",
      expect.objectContaining({ width: 384, fontSize: 54 }),
    );
  });

  it("lays out the address label vertically like the paper reference", async () => {
    const rasterizer = vi.fn<FactoryTextRasterizer>(fakeRasterizer);
    const bytes = await buildFactoryLabelBytes({
      kind: "address",
      orderNumber: "B-1546",
      deliveryDate: "2026-08-25",
      district: "沙田",
      customerName: "Ka Wai Hui",
      customerPhone: "91027090",
    }, rasterizer);
    const tspl = latin1(bytes);

    expect(tspl).toContain("SIZE 50 mm,75 mm\r\n");
    expect(tspl).toContain("BITMAP 100,0,25,120,0,");
    expect(tspl).toContain("BAR 16,124,368,2\r\n");
    expect(tspl).toContain("BAR 16,442,368,2\r\n");
    expect(tspl).not.toContain("Ka Wai Hui");
    expect(tspl).not.toContain("91027090");
    expect(rasterizer).toHaveBeenCalledWith(
      "#B-1546",
      expect.objectContaining({ width: 200, height: 120, fontSize: 120, align: "center" }),
    );
    expect(rasterizer).toHaveBeenCalledWith(
      "－ 送貨日期 －",
      expect.objectContaining({ width: 384, fontSize: 30, align: "center" }),
    );
    expect(rasterizer).toHaveBeenCalledWith(
      "25/08/2026（二）",
      expect.objectContaining({ width: 384, fontSize: 46, align: "center" }),
    );
    expect(rasterizer).toHaveBeenCalledWith(
      "沙田",
      expect.objectContaining({ width: 384, fontSize: 80, align: "center" }),
    );
    expect(rasterizer).toHaveBeenCalledWith(
      "Ka Wai Hui",
      expect.objectContaining({ width: 384, fontSize: 38, align: "center" }),
    );
    expect(rasterizer).toHaveBeenCalledWith(
      "91027090",
      expect.objectContaining({ width: 384, fontSize: 50, align: "center" }),
    );
  });

  it("combines every generated label into one QZ raw command", () => {
    const first = encodeFactoryLabelBase64(new TextEncoder().encode("FIRST\r\n"));
    const second = encodeFactoryLabelBase64(new TextEncoder().encode("SECOND\r\n"));

    expect(atob(combineFactoryLabelBase64([first, second])))
      .toBe("FIRST\r\nSECOND\r\n");
  });

  it("base64-encodes arbitrary bitmap bytes without transcoding", () => {
    const bytes = new Uint8Array([0x00, 0x7f, 0x80, 0xff]);
    const encoded = encodeFactoryLabelBase64(bytes);
    expect([...Uint8Array.from(atob(encoded), (character) => character.charCodeAt(0))])
      .toEqual([...bytes]);
  });
});
