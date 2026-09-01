import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { FactoryOrderJobView } from "@/components/FactoryOrderJobView";
import type { DeliveryListItem } from "@/lib/deliveries";
import type { FactoryOrderJob } from "@/lib/factory-board";

const item = {
  id: "delivery-1",
  orderId: "order-1",
  orderNumber: "FCCO20260801",
  customerName: "Test customer",
  customerPhone: "61234567",
  address: "Test address",
  deliveryAt: "2026-08-31T02:00:00.000Z",
  deliveryTime: "10:00 - 10:30",
  districtName: "Central",
  shippingMethodName: "Delivery",
} as DeliveryListItem;

function renderJob(job: FactoryOrderJob) {
  return render(
    <FactoryOrderJobView
      item={item}
      job={job}
      loading={false}
      error={false}
      fleets={[]}
      assignMotorcade={vi.fn()}
      markLinePrinted={vi.fn()}
      loadLabelCommand={vi.fn()}
      saveDispatchTime={vi.fn()}
      qz={{
        state: "connected",
        printers: ["Test printer"],
        printLabels: vi.fn(),
      } as never}
    />,
  );
}

describe("order editing factory workflow", () => {
  it("shows cancelled products last, disables them, and excludes them from the delivery note", () => {
    const { container } = renderJob({
      packingNote: null,
      dispatchTime: "09:00",
      arrivalWindow: "10:00 - 10:30",
      lines: [
        { id: "active", label: "Active dish", quantityText: "2", remarks: [], printed: false },
        { id: "cancelled", label: "Cancelled dish", quantityText: "1", remarks: [], printed: false, isCancelled: true },
      ],
    });

    const lineList = container.querySelector(".factory-order-lines");
    expect(lineList).not.toBeNull();
    const lineButtons = within(lineList as HTMLElement).getAllByRole("button");
    expect(lineButtons.map((button) => button.textContent)).toEqual([
      expect.stringContaining("Active dish"),
      expect.stringContaining("Cancelled dish"),
    ]);
    expect(lineButtons[1]).toBeDisabled();
    expect(lineButtons[1]).toHaveTextContent("已取消");

    const deliveryNote = container.querySelector(".factory-delivery-note-print");
    expect(deliveryNote).toHaveTextContent("Active dish");
    expect(deliveryNote).not.toHaveTextContent("Cancelled dish");
  });

  it("shows the editing warning and disables every factory print action", () => {
    renderJob({
      packingNote: null,
      dispatchTime: "09:00",
      arrivalWindow: "10:00 - 10:30",
      isBeingEdited: true,
      lines: [
        { id: "active", label: "Active dish", quantityText: "2", remarks: [], printed: false },
      ],
    });

    expect(screen.getByRole("alert")).toHaveTextContent("訂單正在修改，請先不要打印");
    expect(screen.getByRole("button", { name: "印全單" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "印地址" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "印送貨單" })).toBeDisabled();
  });

  it("defines token-scoped sessions with a one-hour active window", () => {
    const migration = readFileSync(
      resolve("supabase/migrations/20260831170000_order_edit_sessions.sql"),
      "utf8",
    );
    expect(migration).toContain("lock_token uuid primary key");
    expect(migration).toContain("last_activity_at > now() - interval '1 hour'");
    expect(migration).toContain("set_order_line_void");
    expect(migration).toContain("assert_factory_order_printable");
  });
});
