import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { act, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";

import { FactoryOrderJobView } from "@/components/FactoryOrderJobView";
import { FactoryOrderPage } from "@/components/FactoryOrderPage";
import type { DeliveryListItem } from "@/lib/deliveries";
import type { FactoryOrderJob } from "@/lib/factory-board";
import { ORDER_EDIT_IDLE_TIMEOUT_MS } from "@/lib/order-edit-lock";
import type { QzTrayClient } from "@/lib/qz-tray";

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

  it("defines token-scoped sessions with a 15-minute active window", () => {
    const initialMigration = readFileSync(
      resolve("supabase/migrations/20260831170000_order_edit_sessions.sql"),
      "utf8",
    );
    const timeoutMigration = readFileSync(
      resolve("supabase/migrations/20260901160000_expire_order_edit_sessions_after_15_minutes.sql"),
      "utf8",
    );
    const presenceMigration = readFileSync(
      resolve("supabase/migrations/20260901170000_authorize_order_edit_presence.sql"),
      "utf8",
    );
    expect(initialMigration).toContain("lock_token uuid primary key");
    expect(initialMigration).toContain("set_order_line_void");
    expect(initialMigration).toContain("assert_factory_order_printable");
    expect(timeoutMigration).toContain("last_activity_at > now() - interval '15 minutes'");
    expect(presenceMigration).toContain("realtime.messages.extension = 'presence'");
    expect(presenceMigration).toContain("to authenticated");
    expect(ORDER_EDIT_IDLE_TIMEOUT_MS).toBe(15 * 60 * 1000);
  });

  it("uses authenticated private Presence on every factory order surface", () => {
    const presenceSource = readFileSync(
      resolve("src/lib/order-edit-presence.ts"),
      "utf8",
    );
    const orderPageSource = readFileSync(
      resolve("src/components/FactoryOrderPage.tsx"),
      "utf8",
    );

    expect(presenceSource).toContain("await supabase.realtime.setAuth(session.access_token)");
    expect(presenceSource).toContain('channel.on("presence", { event: "sync" }');
    expect(orderPageSource).toContain("subscribeActiveOrderEditPresence");
    expect(orderPageSource).toContain("realtimeEditOrderIds.has(item.orderId)");
  });

  it("updates the standalone factory order page from Realtime Presence", async () => {
    let emitPresence = (_ids: Set<string>) => undefined;
    const qzClient: QzTrayClient = {
      connect: vi.fn(async () => undefined),
      disconnect: vi.fn(async () => undefined),
      listPrinters: vi.fn(async () => []),
      queryStatuses: vi.fn(async () => []),
      printLabels: vi.fn(async () => undefined),
    };

    render(
      <MemoryRouter initialEntries={["/factory/order/delivery-1"]}>
        <Routes>
          <Route
            path="/factory/order/:deliveryId"
            element={(
              <FactoryOrderPage
                loadDelivery={vi.fn().mockResolvedValue(item)}
                loadOrderJob={vi.fn().mockResolvedValue({
                  packingNote: null,
                  dispatchTime: "09:00",
                  arrivalWindow: "10:00 - 10:30",
                  isBeingEdited: false,
                  lines: [],
                })}
                loadFleets={vi.fn().mockResolvedValue([])}
                subscribeEditPresence={(onChange) => {
                  emitPresence = onChange;
                  return () => undefined;
                }}
                qzClient={qzClient}
              />
            )}
          />
        </Routes>
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "印全單" })).toBeInTheDocument();
    });
    act(() => emitPresence(new Set(["order-1"])));
    expect(screen.getByRole("alert")).toBeInTheDocument();
    act(() => emitPresence(new Set()));
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
});
