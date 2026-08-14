import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { MeatDeliveryNotesPage } from "@/components/MeatDeliveryNotesPage";
import i18n from "@/i18n";
import type { MeatDeliveryNoteRow } from "@/lib/meat-delivery-notes";

const notes: MeatDeliveryNoteRow[] = [
  {
    id: "order-6",
    orderNumber: "R - 202608 - 6",
    shippingAt: "2026-08-13T16:00:00.000Z",
    shopName: "桂花小幸 TKO",
    shippingMethodName: null,
    remarks: null,
  },
  {
    id: "order-10",
    orderNumber: "R - 202608 - 10",
    shippingAt: "2026-08-13T16:00:00.000Z",
    shopName: "桂花小幸 TKO",
    shippingMethodName: "三皇物流",
    remarks: "加單",
  },
];

describe("Meat delivery notes page", () => {
  beforeEach(async () => {
    await i18n.changeLanguage("zh-HK");
  });

  it("lists delivery notes and opens the outbound form to edit", async () => {
    const user = userEvent.setup();
    const loadNotes = vi.fn().mockResolvedValue({ items: notes, total: 2 });
    const loadOutbound = vi.fn().mockResolvedValue({
      id: "order-10",
      customerId: "cust-tko",
      shippingMethodId: "ship-1",
      orderNumber: "R - 202608 - 10",
      shippingAt: "2026-08-13T16:00:00.000Z",
      remarks: "加單",
      sendToFactory: false,
      contactPerson: "",
      phone: "",
      address: "",
      lines: [],
    });

    render(
      <MemoryRouter>
        <MeatDeliveryNotesPage
          loadNotes={loadNotes}
          loadItems={async () => []}
          loadCustomers={async () => []}
          loadShippingMethods={async () => [{ id: "ship-1", name: "三皇物流" }]}
          loadRawItems={async () => []}
          loadStock={async () => ({ prepared: {}, raw: {} })}
          loadOutbound={loadOutbound}
        />
      </MemoryRouter>,
    );

    expect(await screen.findByRole("heading", { name: "送貨單管理" })).toBeInTheDocument();
    expect(screen.getByText("R - 202608 - 6")).toBeInTheDocument();
    expect(screen.getByText("三皇物流")).toBeInTheDocument();
    expect(screen.getByText("加單")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("搜尋文件編號、店鋪或備註")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "編輯 R - 202608 - 10" }));
    const dialog = await screen.findByRole("dialog", { name: "送貨單" });
    await waitFor(() => {
      expect(loadOutbound).toHaveBeenCalledWith("order-10");
    });
    expect(dialog).toBeInTheDocument();
  });

  it("searches and deletes a delivery note after confirmation", async () => {
    const user = userEvent.setup();
    const loadNotes = vi.fn().mockImplementation(async ({ search }: { search?: string }) => {
      if (search === "加單") {
        return { items: [notes[1]!], total: 1 };
      }
      return { items: notes, total: 2 };
    });
    const deleteNote = vi.fn().mockResolvedValue("order-10");
    vi.spyOn(window, "confirm").mockReturnValue(true);

    render(
      <MemoryRouter>
        <MeatDeliveryNotesPage
          loadNotes={loadNotes}
          deleteNote={deleteNote}
          loadItems={async () => []}
        />
      </MemoryRouter>,
    );

    expect(await screen.findByText("R - 202608 - 10")).toBeInTheDocument();
    await user.type(
      screen.getByPlaceholderText("搜尋文件編號、店鋪或備註"),
      "加單",
    );
    await user.click(screen.getByRole("button", { name: "搜尋" }));
    await waitFor(() => {
      expect(loadNotes).toHaveBeenCalledWith({ page: 1, search: "加單" });
    });

    await user.click(screen.getByRole("button", { name: "刪除 R - 202608 - 10" }));
    await waitFor(() => {
      expect(deleteNote).toHaveBeenCalledWith("order-10");
    });
  });
});
