import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  OrderAddonBlockDatesSettings,
  OrderAddonProductsSettings,
} from "@/components/OrderAddonSettings";
import i18n from "@/i18n";

const addonMocks = vi.hoisted(() => ({
  addAddonProduct: vi.fn(),
  fetchAddonChannels: vi.fn(),
  fetchAddonProductSettings: vi.fn(),
  searchAddonProducts: vi.fn(),
}));

const intakeMocks = vi.hoisted(() => ({
  archiveOrderIntakeRule: vi.fn(),
  createOrderIntakeRule: vi.fn(),
  fetchOrderIntakeRules: vi.fn(),
  updateOrderIntakeRule: vi.fn(),
}));

vi.mock("@/lib/self-service-addons", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/self-service-addons")>()),
  addAddonProduct: addonMocks.addAddonProduct,
  fetchAddonChannels: addonMocks.fetchAddonChannels,
  fetchAddonProductSettings: addonMocks.fetchAddonProductSettings,
  searchAddonProducts: addonMocks.searchAddonProducts,
}));

vi.mock("@/lib/order-intake-rules", () => ({
  archiveOrderIntakeRule: intakeMocks.archiveOrderIntakeRule,
  createOrderIntakeRule: intakeMocks.createOrderIntakeRule,
  fetchOrderIntakeRules: intakeMocks.fetchOrderIntakeRules,
  updateOrderIntakeRule: intakeMocks.updateOrderIntakeRule,
}));

vi.mock("@/components/ui/date-range-picker", () => ({
  DateRangePicker: ({ startValue, endValue, onStartChange, onEndChange, startLabel, endLabel }: {
    startValue: string; endValue: string; onStartChange: (value: string) => void;
    onEndChange: (value: string) => void; startLabel: string; endLabel: string;
  }) => <div>
    <label>{startLabel}<input type="date" value={startValue} onChange={(event) => {
      onStartChange(event.target.value);
      if (!endValue || endValue < event.target.value) onEndChange(event.target.value);
    }} /></label>
    <label>{endLabel}<input type="date" min={startValue} value={endValue} onChange={(event) => onEndChange(event.target.value)} /></label>
  </div>,
}));

afterEach(async () => { await i18n.changeLanguage("zh-HK"); });

describe("OrderAddonProductsSettings", () => {
  it("filters products by brand and keeps one product-search control", async () => {
    const user = userEvent.setup();
    const onCreateOpenChange = vi.fn();
    addonMocks.fetchAddonChannels.mockResolvedValue([
      { id: "channel-1", name: "HK lunch box" },
    ]);
    addonMocks.fetchAddonProductSettings.mockResolvedValue([]);
    addonMocks.searchAddonProducts.mockResolvedValue([
      {
        id: "product-1",
        channelId: "channel-1",
        channelName: "HK lunch box",
        sku: "LB-001",
        name: "燒雞飯盒",
        price: 68,
      },
    ]);
    addonMocks.addAddonProduct.mockResolvedValue(undefined);

    render(
      <OrderAddonProductsSettings
        canManage
        createOpen
        onCreateOpenChange={onCreateOpenChange}
      />,
    );

    const panel = await screen.findByRole("dialog", { name: "加入產品" });
    const brand = within(panel).getByRole("combobox", { name: "品牌" });
    expect(within(panel).getAllByRole("combobox", { name: "搜尋產品" })).toHaveLength(1);

    await user.click(brand);
    await user.click(await screen.findByRole("option", { name: "HK lunch box" }));
    const productSearch = await within(panel).findByRole("combobox", { name: "搜尋產品" });
    await waitFor(() => expect(productSearch).toBeEnabled());

    await user.click(productSearch);
    await user.click(await screen.findByRole("option", { name: /LB-001.*燒雞飯盒/ }));
    await user.click(within(panel).getByRole("button", { name: "加入" }));

    await waitFor(() => {
      expect(addonMocks.addAddonProduct).toHaveBeenCalledWith("channel-1", "product-1");
    });
    expect(onCreateOpenChange).toHaveBeenCalledWith(false);
  });
});

describe("OrderAddonBlockDatesSettings", () => {
  it("renders the intake interface in English when English is selected", async () => {
    await i18n.changeLanguage("en");
    intakeMocks.fetchOrderIntakeRules.mockResolvedValue([]);
    addonMocks.fetchAddonChannels.mockResolvedValue([]);
    render(<OrderAddonBlockDatesSettings canManage createOpen onCreateOpenChange={vi.fn()} />);
    expect(await screen.findByRole("dialog", { name: "Add intake rule" })).toBeInTheDocument();
    expect(screen.getByText("Date / time")).toBeInTheDocument();
    expect(screen.getByText("What happens when this rule matches")).toBeInTheDocument();
    expect(screen.queryByText("新增接單安排")).not.toBeInTheDocument();
  });
  it("preserves each brand's products and addon policy when editing only a name", async () => {
    const user = userEvent.setup();
    const channels = [
      { id: "a", channelId: "a", channelName: "品牌A", brandTerms: ["A"], productTerms: ["聖誕火雞"] },
      { id: "b", channelId: "b", channelName: "品牌B", brandTerms: ["B"], productTerms: ["春節盆菜"] },
    ];
    addonMocks.fetchAddonChannels.mockResolvedValue(channels.map((channel) => ({ id: channel.id, name: channel.channelName })));
    intakeMocks.fetchOrderIntakeRules.mockResolvedValue([{
      id: "generic", name: "節日安排", startsOn: "2026-12-25", endsOn: "2027-02-10",
      startTime: null, endTime: null, handling: "allow_only", addonHandling: "allow",
      customerMessage: "", internalNote: "", isActive: true, channels,
    }]);
    intakeMocks.updateOrderIntakeRule.mockResolvedValue(undefined);
    render(<OrderAddonBlockDatesSettings canManage createOpen={false} onCreateOpenChange={vi.fn()} />);
    await user.click(await screen.findByRole("button", { name: "編輯 節日安排" }));
    const panel = await screen.findByRole("dialog", { name: "編輯接單安排" });
    await user.type(within(panel).getByLabelText("安排名稱"), "更新");
    await user.click(within(panel).getByRole("button", { name: "儲存變更" }));
    await waitFor(() => expect(intakeMocks.updateOrderIntakeRule).toHaveBeenCalledWith("generic", expect.objectContaining({
      addonHandling: "allow", channels: channels.map(({ channelId, brandTerms, productTerms }) => ({ channelId, brandTerms, productTerms })),
    })));
  });
  it("keeps the guidance tip and create action in one toolbar", async () => {
    addonMocks.fetchAddonChannels.mockResolvedValue([]);
    intakeMocks.fetchOrderIntakeRules.mockResolvedValue([]);

    render(
      <OrderAddonBlockDatesSettings
        canManage
        createOpen={false}
        onCreateOpenChange={vi.fn()}
        action={<button type="button">新增接單安排</button>}
      />,
    );

    const toolbar = (await screen.findByRole("note")).closest(".order-intake-toolbar");
    expect(toolbar).toContainElement(screen.getByRole("button", { name: "新增接單安排" }));
  });

  it("separates all-day and specified-time rules and submits a valid time range", async () => {
    const user = userEvent.setup();
    const onCreateOpenChange = vi.fn();
    addonMocks.fetchAddonChannels.mockResolvedValue([
      { id: "channel-1", name: "Food Channels" },
    ]);
    intakeMocks.fetchOrderIntakeRules
      .mockResolvedValueOnce([{
        id: "rule-1",
        name: "聖誕接單安排",
        startsOn: "2026-12-25",
        endsOn: "2026-12-25",
        startTime: null,
        endTime: null,
        handling: "manual_review",
        addonHandling: "manual_review",
        customerMessage: "請先留下需求。",
        internalNote: null,
        isActive: true,
        channels: [],
      }])
      .mockResolvedValueOnce([]);
    intakeMocks.createOrderIntakeRule.mockResolvedValue(undefined);

    render(
      <OrderAddonBlockDatesSettings
        canManage
        createOpen
        onCreateOpenChange={onCreateOpenChange}
      />,
    );

    expect(await screen.findByText("聖誕接單安排")).toBeInTheDocument();
    expect(screen.getByText("全日", { selector: "small" })).toBeInTheDocument();

    const panel = await screen.findByRole("dialog", { name: "新增接單安排" });
    expect(within(panel).getByRole("button", { name: "全日" })).toHaveAttribute("aria-pressed", "true");
    expect(within(panel).queryByLabelText("開始時間")).not.toBeInTheDocument();

    await user.click(within(panel).getByRole("button", { name: "指定時段" }));
    await user.type(within(panel).getByLabelText("安排名稱"), "晚市暫停接單");
    await user.type(within(panel).getByLabelText("開始日期"), "2026-09-26");
    await user.type(within(panel).getByLabelText("開始時間"), "18:00");
    await user.type(within(panel).getByLabelText("結束時間"), "21:00");
    await user.click(within(panel).getByRole("button", { name: "建立安排" }));

    await waitFor(() => {
      expect(intakeMocks.createOrderIntakeRule).toHaveBeenCalledWith(expect.objectContaining({
        name: "晚市暫停接單",
        startsOn: "2026-09-26",
        endsOn: "2026-09-26",
        startTime: "18:00",
        endTime: "21:00",
        handling: "manual_review",
      }));
    });
    expect(onCreateOpenChange).toHaveBeenCalledWith(false);
  });

  it("requires at least one brand when only selected brands can accept orders", async () => {
    const user = userEvent.setup();
    addonMocks.fetchAddonChannels.mockResolvedValue([
      { id: "channel-1", name: "Food Channels" },
    ]);
    intakeMocks.fetchOrderIntakeRules.mockResolvedValue([]);

    render(
      <OrderAddonBlockDatesSettings
        canManage
        createOpen
        onCreateOpenChange={vi.fn()}
      />,
    );

    const panel = await screen.findByRole("dialog", { name: "新增接單安排" });
    await user.type(within(panel).getByLabelText("安排名稱"), "只接指定品牌");
    await user.type(within(panel).getByLabelText("開始日期"), "2026-10-01");
    await user.selectOptions(within(panel).getByLabelText("處理方式"), "allow_only");

    expect(within(panel).getByText("請至少選擇一個可接品牌。")).toBeInTheDocument();
    expect(within(panel).getByRole("button", { name: "建立安排" })).toBeDisabled();

    await user.click(within(panel).getByRole("checkbox", { name: "Food Channels" }));
    expect(within(panel).getByRole("button", { name: "建立安排" })).toBeDisabled();
    await user.type(within(panel).getByLabelText("Food Channels 允許產品關鍵字"), "聖誕套餐");
    expect(within(panel).queryByLabelText("訂購連結")).not.toBeInTheDocument();
    expect(within(panel).getByText("實際產品及訂購連結會由產品資料庫自動取得。", { exact: false }))
      .toBeInTheDocument();
    expect(within(panel).getByRole("button", { name: "建立安排" })).toBeEnabled();
  });

  it("opens an existing rule for editing and saves the populated values", async () => {
    const user = userEvent.setup();
    const existingRule = {
      id: "rule-edit",
      name: "中秋送貨繁忙",
      startsOn: "2026-09-25",
      endsOn: "2026-09-27",
      startTime: "17:00",
      endTime: "21:00",
      handling: "manual_review" as const,
      addonHandling: "manual_review" as const,
      customerMessage: "請留下需求。",
      internalNote: "繁忙時段",
      isActive: true,
      channels: [],
    };
    addonMocks.fetchAddonChannels.mockResolvedValue([]);
    intakeMocks.fetchOrderIntakeRules
      .mockResolvedValueOnce([existingRule])
      .mockResolvedValueOnce([existingRule]);
    intakeMocks.updateOrderIntakeRule.mockResolvedValue(undefined);

    render(
      <OrderAddonBlockDatesSettings
        canManage
        createOpen={false}
        onCreateOpenChange={vi.fn()}
      />,
    );

    await user.click(await screen.findByRole("button", { name: "編輯 中秋送貨繁忙" }));
    const panel = await screen.findByRole("dialog", { name: "編輯接單安排" });
    expect(within(panel).getByLabelText("安排名稱")).toHaveValue("中秋送貨繁忙");
    expect(within(panel).getByLabelText("開始日期")).toHaveValue("2026-09-25");
    expect(within(panel).getByLabelText("開始時間")).toHaveValue("17:00");
    expect(within(panel).getByLabelText("客人訊息")).toHaveValue("請留下需求。");

    await user.clear(within(panel).getByLabelText("客人訊息"));
    await user.type(within(panel).getByLabelText("客人訊息"), "中秋送貨繁忙，請留下需求。");
    await user.click(within(panel).getByRole("button", { name: "儲存變更" }));

    await waitFor(() => {
      expect(intakeMocks.updateOrderIntakeRule).toHaveBeenCalledWith(
        "rule-edit",
        expect.objectContaining({
          name: "中秋送貨繁忙",
          startsOn: "2026-09-25",
          endsOn: "2026-09-27",
          startTime: "17:00",
          endTime: "21:00",
          customerMessage: "中秋送貨繁忙，請留下需求。",
        }),
      );
    });
  });
});
