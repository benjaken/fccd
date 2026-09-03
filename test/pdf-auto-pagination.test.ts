import { describe, expect, it } from "vitest";

import {
  isPrintHiddenPdfModule,
  splitPdfModuleIndexes,
} from "@/lib/pdf-auto-pagination";

describe("PDF auto pagination", () => {
  it("allows the first trailing module to move to a continuation page", () => {
    expect(splitPdfModuleIndexes(3, [0, 2])).toEqual([[], [0, 1], [2]]);
  });

  it("treats empty additional, activity, and notes modules as print-hidden", () => {
    const additional = document.createElement("div");
    additional.innerHTML = `<section class="quote-pdf-additional is-empty"><button>新增額外資訊</button></section>`;
    expect(isPrintHiddenPdfModule(additional)).toBe(true);

    const activity = document.createElement("div");
    activity.innerHTML = `<div class="quote-pdf-section-title quote-pdf-edit-only">新增</div><section class="quote-pdf-activity is-empty">小計</section>`;
    expect(isPrintHiddenPdfModule(activity)).toBe(true);

    const emptyNotes = document.createElement("section");
    emptyNotes.className = "quote-pdf-note-block is-empty";
    expect(isPrintHiddenPdfModule(emptyNotes)).toBe(true);
  });

  it("keeps signature and filled activity modules printable", () => {
    const signature = document.createElement("div");
    signature.innerHTML = `<label class="quote-pdf-edit-only">顯示客戶簽署</label><section class="quote-pdf-signature">發出者</section>`;
    expect(isPrintHiddenPdfModule(signature)).toBe(false);

    const activity = document.createElement("div");
    activity.innerHTML = `<section class="quote-pdf-activity"><table><tbody><tr><td>活動</td></tr></tbody></table></section>`;
    expect(isPrintHiddenPdfModule(activity)).toBe(false);
  });
});
