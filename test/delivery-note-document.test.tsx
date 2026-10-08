import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import {
  DeliveryNoteDocument,
  deliveryNoteLineLayout,
} from "@/components/DeliveryNoteDocument";
import type { FactoryOrderJob } from "@/lib/factory-board";

function line(id: string, label: string, remarks: string[] = []) {
  return {
    id,
    label,
    quantityText: "1",
    remarks,
    printed: false,
  };
}

function job(lines: ReturnType<typeof line>[]): FactoryOrderJob {
  return {
    packingNote: null,
    dispatchTime: null,
    arrivalWindow: "18:00 - 19:00",
    brandName: "HK Party Food",
    brandWebsite: "https://www.hkpartyfood.com/",
    lines,
  };
}

const order = {
  orderNumber: "P-1158",
  customerName: "Ason Chan",
  customerPhone: "96069393",
  address: "藍田",
  deliveryAt: "2026-10-01T10:00:00+08:00",
  deliveryTime: "18:00 - 19:00",
  districtName: "藍田",
  shippingMethodName: null,
};

describe("delivery note pagination", () => {
  it("puts a long remark on a second line instead of widening the row", () => {
    const layout = deliveryNoteLineLayout("狂炸拼盤", [
      "脆炸芝士6件、花枝卷6件、炸雞塊6件、甜薯絲網卷6件、芝士年糕6件",
    ]);
    expect(layout.splitRemarks).toBe(true);
    expect(layout.units).toBeGreaterThan(1);

    render(
      <DeliveryNoteDocument
        order={order}
        job={job([
          line("long", "狂炸拼盤", [
            "脆炸芝士6件、花枝卷6件、炸雞塊6件、甜薯絲網卷6件、芝士年糕6件",
          ]),
        ])}
        printOnly
      />,
    );

    const remarks = document.querySelector(".factory-delivery-note-line-remarks");
    expect(remarks).toHaveTextContent("脆炸芝士6件");
    expect(remarks).toHaveTextContent("芝士年糕6件");
    expect(document.querySelectorAll(".factory-delivery-note-print")).toHaveLength(1);
  });

  it("keeps a half page of rows on one A4 sheet", () => {
    const lines = Array.from({ length: 12 }, (_, index) =>
      line(`row-${index}`, `套餐 ${index + 1}`),
    );
    render(
      <DeliveryNoteDocument order={order} job={job(lines)} printOnly />,
    );
    expect(document.querySelectorAll(".factory-delivery-note-print")).toHaveLength(1);
    expect(screen.getByText("1 / 1")).toBeInTheDocument();
  });

  it("starts a second page only after the first sheet is full", () => {
    const lines = Array.from({ length: 15 }, (_, index) =>
      line(`row-${index}`, `套餐 ${index + 1}`),
    );
    render(
      <DeliveryNoteDocument order={order} job={job(lines)} printOnly />,
    );
    const pages = document.querySelectorAll(".factory-delivery-note-print");
    expect(pages).toHaveLength(2);
    expect(pages[0]).toHaveTextContent("套餐 14");
    expect(pages[0]).not.toHaveTextContent("套餐 15");
    expect(pages[1]).toHaveTextContent("套餐 15");
    expect(pages[1]).toHaveTextContent("2 / 2");
  });
});
