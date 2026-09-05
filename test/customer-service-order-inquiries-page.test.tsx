import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";

import { CustomerServiceOrderInquiriesPage } from "@/components/CustomerServiceOrderInquiriesPage";
import type { CustomerServiceOrderInquiry } from "@/lib/customer-service-order-inquiries";

const inquiry: CustomerServiceOrderInquiry = {
  id: "handoff-1",
  environment: "production",
  phone: "8613828747224",
  orderId: "order-1",
  orderNumber: "B-1555",
  kind: "order_change",
  summary: "我想修改送貨日期",
  questions: [{ at: "2026-09-05T01:00:00Z", text: "我想改為 9/11 送貨" }],
  messageCount: 2,
  status: "pending",
  lastCustomerMessageAt: "2026-09-05T01:00:00Z",
  createdAt: "2026-09-05T01:00:00Z",
  claimedAt: null,
  claimedBy: null,
  claimedByName: null,
  resolvedAt: null,
  resolvedBy: null,
  resolvedByName: null,
  resolutionNote: null,
  eventCount: 0,
};

describe("CustomerServiceOrderInquiriesPage", () => {
  it("shows the pending enquiry and lets a permitted user take over", async () => {
    const loadItems = vi.fn().mockResolvedValue({ items: [inquiry], total: 1 });
    const updateItem = vi.fn().mockResolvedValue("in_progress");
    const openWati = vi.fn();
    render(
      <MemoryRouter>
        <CustomerServiceOrderInquiriesPage
          canManage
          loadItems={loadItems}
          updateItem={updateItem}
          openWati={openWati}
        />
      </MemoryRouter>,
    );

    expect(await screen.findByText("我想修改送貨日期")).toBeInTheDocument();
    expect(screen.getByRole("table")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "B-1555" })).toHaveAttribute(
      "href",
      "/orders/order-1",
    );
    await userEvent.click(screen.getByRole("button", { name: /真人接手/ }));
    await waitFor(() => expect(updateItem).toHaveBeenCalledWith("handoff-1", "claim"));
    expect(openWati).toHaveBeenCalledOnce();
  });

  it("requires and saves a resolution record before returning to the bot", async () => {
    const active = {
      ...inquiry,
      status: "in_progress" as const,
      claimedAt: "2026-09-05T01:05:00Z",
      claimedBy: "user-1",
      claimedByName: "Nero",
    };
    const loadItems = vi.fn().mockResolvedValue({ items: [active], total: 1 });
    const updateItem = vi.fn().mockResolvedValue("resolved");
    render(
      <MemoryRouter>
        <CustomerServiceOrderInquiriesPage
          canManage
          loadItems={loadItems}
          updateItem={updateItem}
        />
      </MemoryRouter>,
    );

    await userEvent.click(await screen.findByRole("button", { name: /完成處理/ }));
    const dialog = await screen.findByRole("dialog", { name: "完成訂單詢問" });
    const save = within(dialog).getByRole("button", { name: /儲存並完成/ });
    expect(save).toBeDisabled();
    await userEvent.type(
      within(dialog).getByRole("textbox", { name: "處理結果" }),
      "已致電客戶並完成修改",
    );
    await userEvent.click(save);
    await waitFor(() =>
      expect(updateItem).toHaveBeenCalledWith(
        "handoff-1",
        "resolve",
        "已致電客戶並完成修改",
      ),
    );
  });
});
