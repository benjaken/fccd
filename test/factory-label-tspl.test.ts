import { describe, expect, it } from "vitest";

import {
  buildFactoryLabelTspl,
  wrapLabelText,
} from "../supabase/functions/qz-label-tspl/tspl";

describe("factory label TSPL", () => {
  it("packs Traditional Chinese into lines of no more than eight characters", () => {
    expect(wrapLabelText("彩椒炒豬頸肉飯分開膠袋裝")).toEqual([
      "彩椒炒豬頸肉飯分",
      "開膠袋裝",
    ]);
  });

  it("builds one 50x75 CP950 label command per copy using TST24.BF2", () => {
    const tspl = buildFactoryLabelTspl({
      orderNumber: "B-11795",
      deliveryDate: "2026-08-21",
      labelName: "彩椒炒豬頸肉飯",
      remarks: ["分開膠袋裝", "不要餐具"],
      copies: 2,
    });

    expect(tspl.match(/SIZE 50 mm,75 mm/g)).toHaveLength(2);
    expect(tspl.match(/GAP 2 mm,0/g)).toHaveLength(2);
    expect(tspl.match(/CODEPAGE 950/g)).toHaveLength(2);
    expect(tspl.match(/PRINT 1/g)).toHaveLength(2);
    expect(tspl.endsWith("PRINT 1\r\n")).toBe(true);
    expect(tspl).toContain('"TST24.BF2"');
    expect(tspl.match(/"1份 \/ 共2份"/g)).toHaveLength(2);
    expect(tspl).toContain('"21/08/2026（五）"');
  });

  it("escapes control characters and TSPL quotes", () => {
    const tspl = buildFactoryLabelTspl({
      orderNumber: 'B-1"\nPRINT 99',
      deliveryDate: "2026-08-21",
      labelName: "測試",
      remarks: [],
      copies: 1,
    });

    expect(tspl).not.toContain('B-1"\nPRINT 99');
    expect(tspl.match(/PRINT 1/g)).toHaveLength(1);
  });
});
