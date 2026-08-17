import { readFileSync } from "node:fs";
import path from "node:path";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { DeliveryListPage } from "@/components/DeliveryListPage";
import i18n from "@/i18n";
import type { DeliveryListItem, DeliveryListResult } from "@/lib/deliveries";

const sampleItem: DeliveryListItem = {
  id: "delivery-1",
  orderId: "order-1",
  orderNumber: "6918",
  customerName: "Louis Chang 張",
  customerPhone: "90154004",
  address: "青衣長康邨",
  deliveryAt: "2026-08-01T10:00:00+08:00",
  deliveryTime: "18:00 - 19:00",
  districtName: "青衣",
  motorcadeId: "team-1",
  motorcadeName: "Sun-Line",
  shippingMethodId: "method-1",
  shippingMethodName: "車邊交收",
  basicFee: 90,
  totalFee: 90,
  surchargeAmount: 0,
  surcharges: [],
  grandTotal: 1330,
  deliveryStatus: "已送達",
  takenAt: "2026-08-01T20:37:00+08:00",
  fulfilledAt: "2026-08-01T20:37:00+08:00",
  imageReferences: ["https://example.com/photo.jpg"],
};

const surchargeItem: DeliveryListItem = {
  ...sampleItem,
  id: "delivery-2",
  orderId: "order-2",
  orderNumber: "B#1462W",
  customerName: "測試客戶",
  customerPhone: "91234567",
  districtName: "上環",
  address: "上環德輔道中",
  basicFee: 90,
  totalFee: 140,
  surchargeAmount: 50,
  surcharges: [{ name: "隧道費", amount: 50 }],
  grandTotal: null,
  imageReferences: [],
};

const listResult: DeliveryListResult = {
  total: 2,
  items: [sampleItem, surchargeItem],
};

const lookups = {
  teams: [{ id: "team-1", name: "Sun-Line" }],
  shippingMethods: [{ id: "method-1", name: "車邊交收" }],
};

describe("Delivery list page", () => {
  beforeEach(async () => {
    await i18n.changeLanguage("zh-HK");
  });

  it("renders the delivery list with order, fleet, and method fields", async () => {
    const loadDeliveries = vi.fn().mockResolvedValue(listResult);
    const loadLookups = vi.fn().mockResolvedValue(lookups);

    render(
      <MemoryRouter>
        <DeliveryListPage
          loadDeliveries={loadDeliveries}
          loadLookups={loadLookups}
          now={new Date("2026-08-17T04:00:00+08:00")}
        />
      </MemoryRouter>,
    );

    expect(
      await screen.findByRole("heading", { name: "送貨清單" }),
    ).toBeInTheDocument();
    expect(loadDeliveries).toHaveBeenCalledWith({
      page: 1,
      search: "",
      startDate: "2026-08-01",
      endDate: "2026-08-17",
      motorcadeId: "",
      shippingMethodId: "",
    });

    const table = within(screen.getByRole("table"));
    expect(table.getByText("#6918")).toHaveAttribute("href", "/orders/order-1");
    expect(table.getByText("Louis Chang 張")).toBeInTheDocument();
    expect(table.getByText("90154004")).toBeInTheDocument();
    expect(table.getByText("90154004").className).toContain("delivery-order-phone");
    expect(table.getAllByText("18:00 - 19:00").length).toBeGreaterThan(0);
    expect(table.getByText("青衣")).toBeInTheDocument();
    expect(table.getAllByText("Sun-Line").length).toBeGreaterThan(0);
    expect(table.getAllByText("車邊交收").length).toBeGreaterThan(0);
    expect(table.getByText("隧道費")).toBeInTheDocument();
    expect(table.getByText("HK$1,330")).toBeInTheDocument();
    expect(table.getByText("運費佔 7%")).toBeInTheDocument();
    expect(table.getByRole("button", { name: "查看圖片" })).toBeEnabled();
    expect(table.getByRole("button", { name: "沒有送達照片" })).toBeDisabled();
    expect(screen.getByText(/本頁運費/)).toBeInTheDocument();
    expect(
      table.queryByRole("combobox", { name: "選擇車隊" }),
    ).not.toBeInTheDocument();
  });

  it("opens delivery photos in a half-width side panel", async () => {
    const user = userEvent.setup();
    const loadDeliveries = vi.fn().mockResolvedValue(listResult);
    const loadLookups = vi.fn().mockResolvedValue(lookups);

    render(
      <MemoryRouter>
        <DeliveryListPage
          loadDeliveries={loadDeliveries}
          loadLookups={loadLookups}
          now={new Date("2026-08-17T04:00:00+08:00")}
        />
      </MemoryRouter>,
    );

    await user.click(await screen.findByRole("button", { name: "查看圖片" }));
    expect(screen.getByRole("dialog", { name: "送達照片" })).toHaveClass(
      "side-panel-half",
    );
    expect(
      screen.getByRole("img", { name: "送達照片" }),
    ).toHaveAttribute("src", "https://example.com/photo.jpg");

    const stylesheet = readFileSync(
      path.resolve(process.cwd(), "src/index.css"),
      "utf8",
    );
    expect(stylesheet).toMatch(/\.side-panel-half\s*\{[^}]*width:\s*min\(50vw/);
  });

  it("filters by fleet and delivery method", async () => {
    const user = userEvent.setup();
    const loadDeliveries = vi.fn().mockResolvedValue(listResult);
    const loadLookups = vi.fn().mockResolvedValue(lookups);

    render(
      <MemoryRouter>
        <DeliveryListPage
          loadDeliveries={loadDeliveries}
          loadLookups={loadLookups}
          now={new Date("2026-08-17T04:00:00+08:00")}
        />
      </MemoryRouter>,
    );

    await screen.findByRole("heading", { name: "送貨清單" });

    await user.selectOptions(
      screen.getByRole("combobox", { name: "司機／車隊" }),
      "team-1",
    );
    await waitFor(() =>
      expect(loadDeliveries).toHaveBeenLastCalledWith(
        expect.objectContaining({ motorcadeId: "team-1", page: 1 }),
      ),
    );

    await user.selectOptions(
      screen.getByRole("combobox", { name: "送貨方式" }),
      "method-1",
    );
    await waitFor(() =>
      expect(loadDeliveries).toHaveBeenLastCalledWith(
        expect.objectContaining({
          motorcadeId: "team-1",
          shippingMethodId: "method-1",
        }),
      ),
    );
  });

  it("lets a dispatcher choose the fleet on each row", async () => {
    const user = userEvent.setup();
    const loadDeliveries = vi.fn().mockResolvedValue(listResult);
    const loadLookups = vi.fn().mockResolvedValue(lookups);
    const assignFleet = vi.fn().mockResolvedValue(undefined);

    render(
      <MemoryRouter>
        <DeliveryListPage
          canEdit
          loadDeliveries={loadDeliveries}
          loadLookups={loadLookups}
          assignFleet={assignFleet}
          now={new Date("2026-08-17T04:00:00+08:00")}
        />
      </MemoryRouter>,
    );

    const fleetSelects = await screen.findAllByRole("combobox", {
      name: "選擇車隊",
    });
    await user.selectOptions(fleetSelects[1]!, "");
    await waitFor(() =>
      expect(assignFleet).toHaveBeenCalledWith("delivery-2", null),
    );
  });

  it("exports the filtered rows with the requested columns", async () => {
    const user = userEvent.setup();
    const loadDeliveries = vi.fn().mockResolvedValue(listResult);
    const loadLookups = vi.fn().mockResolvedValue(lookups);
    const loadExportRows = vi.fn().mockResolvedValue([sampleItem]);
    const createObjectURL = vi.fn(() => "blob:delivery-export");
    const revokeObjectURL = vi.fn();
    const click = vi.fn();
    vi.stubGlobal("URL", {
      createObjectURL,
      revokeObjectURL,
    });
    const originalCreateElement = document.createElement.bind(document);
    vi.spyOn(document, "createElement").mockImplementation((tagName) => {
      const element = originalCreateElement(tagName);
      if (tagName === "a") {
        element.click = click;
      }
      return element;
    });

    render(
      <MemoryRouter>
        <DeliveryListPage
          loadDeliveries={loadDeliveries}
          loadLookups={loadLookups}
          loadExportRows={loadExportRows}
          now={new Date("2026-08-17T04:00:00+08:00")}
        />
      </MemoryRouter>,
    );

    await screen.findByRole("heading", { name: "送貨清單" });
    await user.click(screen.getByRole("button", { name: "導出" }));

    await waitFor(() => expect(loadExportRows).toHaveBeenCalled());
    expect(loadExportRows).toHaveBeenCalledWith({
      search: "",
      startDate: "2026-08-01",
      endDate: "2026-08-17",
      motorcadeId: "",
      shippingMethodId: "",
    });
    expect(createObjectURL).toHaveBeenCalled();
    const blob = createObjectURL.mock.calls[0]?.[0] as Blob;
    const csv = await blob.text();
    expect(csv).toContain("訂單號碼");
    expect(csv).toContain("送貨日期");
    expect(csv).toContain("送貨時間");
    expect(csv).toContain("客戶姓名");
    expect(csv).toContain("客戶電話");
    expect(csv).toContain("送貨地區");
    expect(csv).toContain("送貨地址");
    expect(csv).toContain("送貨方式");
    expect(csv).toContain("車隊");
    expect(csv).toContain("6918");
    expect(csv).toContain("Sun-Line");
    expect(click).toHaveBeenCalled();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("paginates deliveries in groups of fifteen", async () => {
    const user = userEvent.setup();
    const loadDeliveries = vi
      .fn()
      .mockResolvedValue({ ...listResult, total: 31 });
    const loadLookups = vi.fn().mockResolvedValue(lookups);

    render(
      <MemoryRouter>
        <DeliveryListPage
          loadDeliveries={loadDeliveries}
          loadLookups={loadLookups}
          now={new Date("2026-08-17T04:00:00+08:00")}
        />
      </MemoryRouter>,
    );

    expect(
      await screen.findByRole("spinbutton", { name: "跳至頁碼" }),
    ).toHaveValue(1);
    await user.click(screen.getByRole("button", { name: "下一頁" }));

    await waitFor(() =>
      expect(loadDeliveries).toHaveBeenLastCalledWith(
        expect.objectContaining({ page: 2 }),
      ),
    );
  });

  it("uses DateRangePicker instead of standalone date inputs", () => {
    const source = readFileSync(
      path.resolve(process.cwd(), "src/components/DeliveryListPage.tsx"),
      "utf8",
    );
    expect(source).toContain("DateRangePicker");
    expect(source).not.toMatch(/type=["']date["']/);
  });

  it("shows an actionable load error", async () => {
    const loadDeliveries = vi
      .fn()
      .mockRejectedValue({ code: "deliveries_failed" });
    const loadLookups = vi.fn().mockResolvedValue(lookups);

    render(
      <MemoryRouter>
        <DeliveryListPage
          loadDeliveries={loadDeliveries}
          loadLookups={loadLookups}
        />
      </MemoryRouter>,
    );

    expect(await screen.findByText("暫時無法載入送貨清單")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "重新載入" })).toBeInTheDocument();
  });

  it("confirms before cancelling a pending-pickup delivery", async () => {
    const user = userEvent.setup();
    const pendingItem: DeliveryListItem = {
      ...surchargeItem,
      deliveryStatus: "待取貨",
    };
    const loadDeliveries = vi
      .fn()
      .mockResolvedValueOnce({ total: 1, items: [pendingItem] })
      .mockResolvedValue({ total: 0, items: [] });
    const loadLookups = vi.fn().mockResolvedValue(lookups);
    const cancelDelivery = vi.fn().mockResolvedValue(undefined);

    render(
      <MemoryRouter>
        <DeliveryListPage
          canEdit
          loadDeliveries={loadDeliveries}
          loadLookups={loadLookups}
          cancelDelivery={cancelDelivery}
          now={new Date("2026-08-17T04:00:00+08:00")}
        />
      </MemoryRouter>,
    );

    await user.click(await screen.findByRole("button", { name: "取消送貨" }));
    expect(screen.getByRole("dialog", { name: "取消送貨訂單" })).toBeInTheDocument();
    expect(cancelDelivery).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: "返回" }));
    expect(cancelDelivery).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: "取消送貨" }));
    await user.click(screen.getByRole("button", { name: "確認取消" }));
    await waitFor(() =>
      expect(cancelDelivery).toHaveBeenCalledWith("delivery-2"),
    );
  });

  it("does not offer cancel on delivered rows", async () => {
    const loadDeliveries = vi.fn().mockResolvedValue(listResult);
    const loadLookups = vi.fn().mockResolvedValue(lookups);

    render(
      <MemoryRouter>
        <DeliveryListPage
          canEdit
          loadDeliveries={loadDeliveries}
          loadLookups={loadLookups}
          now={new Date("2026-08-17T04:00:00+08:00")}
        />
      </MemoryRouter>,
    );

    await screen.findByRole("heading", { name: "送貨清單" });
    expect(
      screen.queryByRole("button", { name: "取消送貨" }),
    ).not.toBeInTheDocument();
  });

  it("does not let drivers cancel a pending pickup", async () => {
    const loadDeliveries = vi.fn().mockResolvedValue({
      total: 1,
      items: [{ ...surchargeItem, deliveryStatus: "待取貨" }],
    });
    const loadLookups = vi.fn().mockResolvedValue(lookups);

    render(
      <MemoryRouter>
        <DeliveryListPage
          loadDeliveries={loadDeliveries}
          loadLookups={loadLookups}
          now={new Date("2026-08-17T04:00:00+08:00")}
        />
      </MemoryRouter>,
    );

    await screen.findByRole("heading", { name: "送貨清單" });
    expect(
      screen.queryByRole("button", { name: "取消送貨" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("combobox", { name: "選擇車隊" }),
    ).not.toBeInTheDocument();
  });
});
