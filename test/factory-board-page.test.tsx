import { readFileSync } from "node:fs";
import path from "node:path";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { FactoryBoardPage } from "@/components/FactoryBoardPage";
import {
  factoryLabelPrintCompletesSet,
  formatFactoryDeliveryNoteQuantity,
  preferredFactoryLabelPrinter,
} from "@/components/FactoryOrderJobView";
import i18n from "@/i18n";
import type { DeliveryListItem } from "@/lib/deliveries";
import { addCalendarDays } from "@/lib/deliveries";
import type { FactoryBoardData } from "@/lib/factory-board";
import type { QzTrayClient } from "@/lib/qz-tray";

const qzClient: QzTrayClient = {
  connect: vi.fn(async () => {}),
  disconnect: vi.fn(async () => {}),
  listPrinters: vi.fn(async () => ["Zebra ZD421"]),
  queryStatuses: vi.fn(async () => [
    { name: "Zebra ZD421", status: "PAPER_OUT", severity: "WARN", message: null },
  ]),
  printLabels: vi.fn(async () => {}),
};

function item(
  overrides: Partial<DeliveryListItem> & Pick<DeliveryListItem, "id">,
): DeliveryListItem {
  return {
    orderId: "order-1",
    orderNumber: "B-1522",
    customerName: "Eric Yim",
    customerPhone: "66817198",
    address: "大埔汀角道船灣香港青年協會大美督戶外活動中心",
    deliveryAt: "2026-08-18T02:00:00.000Z",
    deliveryTime: "10:00",
    shipOutTime: "09:30",
    districtName: "大尾督",
    motorcadeId: "team-sun",
    motorcadeName: "Sun-Line",
    shippingMethodId: null,
    shippingMethodName: null,
    basicFee: null,
    totalFee: null,
    surchargeAmount: null,
    surcharges: [],
    grandTotal: null,
    deliveryStatus: null,
    takenAt: null,
    fulfilledAt: null,
    imageReferences: [],
    ...overrides,
  };
}

const board: FactoryBoardData = {
  dates: ["2026-08-17", "2026-08-18", "2026-08-19"],
  items: [
    item({
      id: "job-1",
      deliveryAt: "2026-08-18T02:00:00.000Z",
    }),
  ],
  portionsByOrderId: { "order-1": 7 },
};

describe("FactoryBoardPage", () => {
  it("prefers an Xprinter for label printing", () => {
    expect(
      preferredFactoryLabelPrinter(["Zebra ZD421", "Xprinter XP-420B"]),
    ).toBe("Xprinter XP-420B");
  });

  it("completes a one-copy label set when printing one label", () => {
    expect(factoryLabelPrintCompletesSet("1 份", false)).toBe(true);
    expect(factoryLabelPrintCompletesSet("3 份", false)).toBe(false);
    expect(factoryLabelPrintCompletesSet("3 份", true)).toBe(true);
  });
  beforeEach(async () => {
    await i18n.changeLanguage("zh-HK");
  });

  it("keeps only one portion unit in printed delivery-note quantities", () => {
    expect(formatFactoryDeliveryNoteQuantity("3")).toBe("3");
    expect(formatFactoryDeliveryNoteQuantity("3 份")).toBe("3");
    expect(formatFactoryDeliveryNoteQuantity("3 份 份")).toBe("3");
  });

  it("keeps one day and three job cards per row with responsive mobile rules", () => {
    const stylesheet = readFileSync(
      path.resolve(process.cwd(), "src/index.css"),
      "utf8",
    );
    const daysRule = stylesheet.match(/\.factory-board-days\s*\{([^}]+)\}/);
    const cardsRule = stylesheet.match(/\.factory-day-cards\s*\{([^}]+)\}/);
    const headingRule = stylesheet.match(/\.factory-day-header h2\s*\{([^}]+)\}/);
    const dayRule = stylesheet.match(/\.factory-day\s*\{([^}]+)\}/);
    const badgeRule = stylesheet.match(/\.factory-job-badge\s*\{([^}]+)\}/);
    const printRule = stylesheet.match(
      /\.factory-job-print-status\s*\{([^}]+)\}/,
    );
    const orderDishRule = stylesheet.match(
      /\.factory-order-line strong\s*\{([^}]+)\}/,
    );
    const orderRemarkRule = stylesheet.match(
      /\.factory-order-line-remark\s*\{([^}]+)\}/,
    );
    const orderNumberRule = stylesheet.match(
      /\.factory-order-number\s*\{([^}]+)\}/,
    );
    const orderMetaRule = stylesheet.match(
      /\.factory-order-meta\s*\{([^}]+)\}/,
    );
    const packingRule = stylesheet.match(
      /\.factory-order-packing\s*\{([^}]+)\}/,
    );
    const orderPrintRule = stylesheet.match(
      /\.factory-order-line-print\s*\{([^}]+)\}/,
    );
    const orderPrintIconRule = stylesheet.match(
      /\.factory-order-line-print svg\s*\{([^}]+)\}/,
    );
    const qzTipRule = stylesheet.match(/\.factory-qz-tip\s*\{([^}]+)\}/);
    const orderJobRule = stylesheet.match(/\.factory-order-job\s*\{([^}]+)\}/);
    const orderMainRule = stylesheet.match(/\.factory-order-main\s*\{([^}]+)\}/);
    const orderSummaryRule = stylesheet.match(
      /\.factory-order-summary\s*\{([^}]+)\}/,
    );
    const orderAsideRule = stylesheet.match(
      /\.factory-order-aside\s*\{([^}]+)\}/,
    );
    const bodyRule = stylesheet.match(
      /\.factory-job-card-body strong,\s*\.factory-job-card-body span,\s*\.factory-job-card-body small\s*\{([^}]+)\}/,
    );
    const cardTimeRule = stylesheet.match(
      /\.factory-job-card-body \.factory-job-card-time\s*\{([^}]+)\}/,
    );

    expect(daysRule?.[1]).toContain("grid-template-columns: minmax(0, 1fr)");
    expect(cardsRule?.[1]).toContain(
      "grid-template-columns: repeat(3, minmax(150px, 1fr))",
    );
    expect(headingRule?.[1]).toContain("font-size: 36px");
    expect(bodyRule?.[1]).toContain("font-size: 22px");
    expect(bodyRule?.[1]).toContain("font-weight: 800");
    expect(cardTimeRule?.[1]).toContain("white-space: nowrap");
    expect(cardTimeRule?.[1]).toContain("font-size: 22px");
    expect(dayRule?.[1]).toContain("border-right: 4px solid var(--factory-line)");
    expect(badgeRule?.[1]).toContain("bottom: 0");
    expect(badgeRule?.[1]).toContain(
      "clip-path: polygon(100% 0, 100% 100%, 0 100%)",
    );
    expect(printRule?.[1]).toContain("top: 10px");
    expect(printRule?.[1]).toContain("left: 10px");
    expect(orderDishRule?.[1]).toContain("font-size: 32px");
    expect(orderRemarkRule?.[1]).toContain("color: #dc2626");
    expect(orderNumberRule?.[1]).toContain("font-size: 72px");
    expect(orderMetaRule?.[1]).toContain("font-size: 36px");
    expect(orderMetaRule?.[1]).toContain(
      "grid-template-columns: max-content minmax(0, 1fr) max-content",
    );
    expect(orderMetaRule?.[1]).toContain('"phone address customer"');
    expect(packingRule?.[1]).toContain("background: #fffaf3");
    expect(packingRule?.[1]).toContain("font-size: 22px");
    expect(orderPrintRule?.[1]).toContain("width: 60px");
    expect(orderPrintIconRule?.[1]).toContain("width: 24px");
    expect(qzTipRule?.[1]).toContain("position: fixed");
    expect(qzTipRule?.[1]).toContain("right: 22px");
    expect(orderJobRule?.[1]).toContain(
      "grid-template-rows: auto auto minmax(0, 1fr)",
    );
    expect(orderMainRule?.[1]).toContain("display: contents");
    expect(orderSummaryRule?.[1]).toContain("grid-column: 1 / -1");
    expect(orderAsideRule?.[1]).toContain("grid-row: 3");
    expect(stylesheet).toMatch(
      /\.factory-modal\.is-wide\.factory-menu-summary-modal\s*\{[^}]*width:\s*80vw !important[^}]*min-width:\s*80vw[^}]*max-width:\s*80vw !important/s,
    );
    expect(stylesheet).toMatch(
      /\.factory-menu-summary-table th:first-child,\s*\.factory-menu-summary-table td:first-child\s*\{[^}]*white-space:\s*normal[^}]*overflow-wrap:\s*anywhere[^}]*overflow:\s*hidden/s,
    );
    expect(stylesheet).toMatch(
      /\.factory-menu-summary-modal \.factory-dispatch-table-wrap\s*\{[^}]*flex:\s*1[^}]*overflow:\s*auto[^}]*scrollbar-gutter:\s*stable/s,
    );
    expect(stylesheet).toMatch(
      /@page factory-menu-list\s*\{[^}]*size:\s*A4 portrait[^}]*margin:\s*12mm/s,
    );
    expect(stylesheet).toMatch(
      /\.factory-board:has\(> \.factory-menu-print-root\) > :not\(\.factory-menu-print-root\)\s*\{[^}]*display:\s*none !important/s,
    );
    expect(stylesheet).toMatch(
      /\.factory-board:has\(> \.factory-menu-print-root\)\s*\{[^}]*min-height:\s*0 !important[^}]*page:\s*factory-menu-list/s,
    );
    expect(stylesheet).toMatch(
      /\.factory-menu-summary-table tbody td\.has-data\s*\{[^}]*background:\s*#ffffff[^}]*font-size:\s*19px[^}]*font-weight:\s*800/s,
    );
    expect(stylesheet).toMatch(
      /\.factory-menu-summary-table\s*\{[^}]*font-size:\s*19px/s,
    );
    expect(stylesheet).toMatch(
      /\.factory-menu-summary-table th:first-child,\s*\.factory-menu-summary-table td:first-child\s*\{[^}]*width:\s*380px/s,
    );
    expect(stylesheet).toMatch(
      /\.factory-menu-summary-table \.factory-menu-summary-dish-column\s*\{[^}]*width:\s*380px/s,
    );
    expect(stylesheet).toMatch(
      /\.factory-menu-summary-table \.factory-menu-summary-title\s*\{[^}]*font-size:\s*24px/s,
    );
    expect(stylesheet).toMatch(
      /@page factory-multi-day-report\s*\{[^}]*size:\s*A4 portrait/s,
    );
    expect(stylesheet).toMatch(
      /@page factory-delivery-note\s*\{[^}]*size:\s*A4 portrait[^}]*margin:\s*0/s,
    );
    expect(stylesheet).toMatch(/@page\s*\{[^}]*margin:\s*0/s);
    expect(stylesheet).toMatch(
      /\.factory-multi-day-report\s*\{[^}]*page:\s*factory-multi-day-report/s,
    );
    expect(stylesheet).toMatch(
      /\.factory-multi-day-report,\s*\.factory-multi-day-report \*\s*\{[^}]*visibility:\s*visible !important/s,
    );
    expect(stylesheet).toMatch(
      /\.factory-multi-day-table th,\s*\.factory-multi-day-table td\s*\{[^}]*overflow-wrap:\s*anywhere[^}]*white-space:\s*normal !important/s,
    );
    expect(stylesheet).toMatch(
      /\.factory-multi-day-orders\s*\{[^}]*display:\s*none !important/s,
    );
    expect(stylesheet).toMatch(
      /\.factory-multi-day-table tbody tr:last-child td\s*\{[^}]*border-bottom:\s*1px solid #303030 !important/s,
    );
    expect(stylesheet).toMatch(
      /\.factory-multi-day-report-header h1,\s*\.factory-multi-day-report-header p\s*\{[^}]*font-size:\s*10pt[^}]*white-space:\s*nowrap/s,
    );
    expect(stylesheet).not.toMatch(/size:\s*A4 landscape/);
    expect(stylesheet).toContain(
      ".factory-order-job > :not(.factory-delivery-note-print)",
    );
    expect(stylesheet).not.toContain("min-height: 260mm");
    expect(stylesheet).toMatch(
      /\.factory-delivery-note-lines tbody tr:last-child td\s*\{[^}]*border-bottom:\s*1px solid #222222 !important/s,
    );
    expect(stylesheet).toMatch(
      /\.factory-delivery-note-print > footer,\s*\.order-delivery-note-sheet > footer\s*\{[^}]*position:\s*absolute[^}]*bottom:\s*10mm[^}]*font-size:\s*10pt/s,
    );
    expect(stylesheet).toMatch(
      /\.factory-delivery-note-lines th,\s*\.factory-delivery-note-lines td\s*\{[^}]*color:\s*#000000 !important[^}]*opacity:\s*1 !important/s,
    );
    expect(stylesheet).not.toMatch(
      /\.factory-delivery-note-order-footer\s*\{[^}]*border-bottom/s,
    );
    expect(stylesheet).toMatch(
      /\.factory-delivery-note-order-reference\s*\{[^}]*margin:\s*-2mm -3mm 2mm !important[^}]*border-bottom:\s*1px solid #000000/s,
    );
    expect(stylesheet).toMatch(
      /\.factory-board\.factory-order-page\s*\{[^}]*height:\s*0 !important[^}]*min-height:\s*0 !important/s,
    );
    expect(stylesheet).toContain(".factory-multi-day-table.is-two-column");
    expect(stylesheet).toMatch(
      /\.factory-multi-day-table\.is-two-column th:nth-child\(2\),[\s\S]*?\.factory-multi-day-table\.is-two-column td:nth-child\(5\)\s*\{[^}]*width:\s*9%/,
    );
    expect(stylesheet).toContain("overflow: visible !important");
    expect(stylesheet).toMatch(
      /\.factory-job-card\.is-meat\s*\{[^}]*grid-column:\s*1\s*\/\s*-1[^}]*background:\s*#b8b8b8/s,
    );
    expect(stylesheet).toMatch(
      /\.factory-job-print-status\.is-complete\s*\{[^}]*background:\s*var\(--factory-green\)[^}]*clip-path:\s*polygon\(0 0, 100% 0, 0 100%\)/s,
    );
    expect(stylesheet).toMatch(
      /@media \(max-width: 760px\)[\s\S]*?\.factory-day-cards\s*\{[^}]*grid-template-columns:\s*repeat\(2, minmax\(0, 1fr\)\)/,
    );
    expect(stylesheet).toMatch(
      /@media \(max-width: 760px\)[\s\S]*?\.factory-board-actions\s*\{[^}]*grid-template-columns:\s*repeat\(3, minmax\(0, 1fr\)\)/,
    );
    expect(stylesheet).toMatch(
      /@media \(max-width: 760px\)[\s\S]*?\.factory-board-heading\s*\{[^}]*flex-wrap:\s*nowrap[^}]*justify-content:\s*space-between/,
    );
    expect(stylesheet).toMatch(
      /@media \(max-width: 760px\)[\s\S]*?\.factory-board-heading\.factory-page-title-heading\s*\{[^}]*display:\s*flex/,
    );
    expect(stylesheet).toMatch(
      /@media \(max-width: 760px\)[\s\S]*?\.factory-board-heading\.factory-calendar-heading\s*\{[^}]*display:\s*flex/,
    );
    expect(stylesheet).toMatch(
      /@media \(max-width: 760px\)[\s\S]*?\.factory-board \.factory-qz,[\s\S]*?display:\s*none !important/,
    );
    expect(stylesheet).toMatch(
      /@media \(max-width: 760px\)[\s\S]*?\.factory-order-lines\s*\{[^}]*grid-template-columns:\s*1fr[^}]*overflow:\s*visible/,
    );
    expect(stylesheet).toMatch(
      /\.kitchen-calendar-page\.is-factory-display \.kitchen-calendar-mobile-filter\s*\{[^}]*height:\s*56px[^}]*max-height:\s*56px/,
    );
    expect(stylesheet).toMatch(
      /@media \(max-width: 760px\)[\s\S]*?\.factory-order-summary\s*\{[^}]*grid-template-columns:\s*minmax\(0, 1fr\) auto[^}]*justify-content:\s*stretch/,
    );
    expect(stylesheet).toMatch(
      /@media \(max-width: 760px\)[\s\S]*?\.factory-order-meta\s*\{[^}]*display:\s*contents/,
    );
    expect(stylesheet).toMatch(
      /@media \(max-width: 760px\)[\s\S]*?\.factory-order-aside\s*\{[^}]*grid-row:\s*3/,
    );
    expect(stylesheet).toMatch(
      /@media \(max-width: 760px\)[\s\S]*?\.factory-order-lines\s*\{[^}]*grid-row:\s*4/,
    );
    expect(stylesheet).toMatch(
      /\.factory-order-aside \.factory-order-print-action,[\s\S]*?\.factory-order-aside hr\s*\{[^}]*display:\s*none/,
    );
    expect(stylesheet).toMatch(
      /\.factory-label-modal \.factory-label-printer-select,[\s\S]*?\.factory-label-modal \.factory-label-actions\s*\{[^}]*display:\s*none/,
    );
    expect(stylesheet).toMatch(
      /\.factory-modal-footer > button:only-child\s*\{[^}]*grid-column:\s*1 \/ -1[^}]*width:\s*100%/,
    );
    expect(stylesheet).toMatch(
      /@media \(max-width: 760px\)[\s\S]*?\.factory-multi-day-table-wrap\s*\{[^}]*overflow-x:\s*auto[^}]*touch-action:\s*pan-x pan-y/,
    );
    expect(stylesheet).toMatch(
      /\.factory-multi-day-table\.is-two-column\s*\{[^}]*min-width:\s*1100px/,
    );
    expect(stylesheet).toMatch(
      /@media \(max-width: 480px\)[\s\S]*?\.factory-day-cards\s*\{[^}]*grid-template-columns:\s*repeat\(2, minmax\(0, 1fr\)\)/,
    );
  });

  it("loads only today on first entry", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-08-20T04:00:00.000Z"));
    const loadBoard = vi.fn(async (date: string) => ({
      ...board,
      dates: [date],
    }));

    render(
      <FactoryBoardPage
        loadBoard={loadBoard}
        loadFleets={async () => []}
        loadBrands={async () => []}
        qzClient={qzClient}
      />,
    );

    await waitFor(() =>
      expect(loadBoard).toHaveBeenCalledWith("2026-08-20", 1),
    );
    vi.useRealTimers();
  });

  it("opens the top date picker and jumps to the confirmed date", async () => {
    const user = userEvent.setup();
    const loadBoard = vi.fn(async (date: string) => ({
      ...board,
      dates: [date, "2026-08-23", "2026-08-24"],
    }));

    render(
      <FactoryBoardPage
        initialDate="2026-08-17"
        loadBoard={loadBoard}
        loadFleets={async () => []}
        loadBrands={async () => []}
        qzClient={qzClient}
      />,
    );

    await waitFor(() => expect(loadBoard).toHaveBeenCalledWith("2026-08-17", 1));
    const dateButton = screen.getByRole("button", { name: "指定日期" });
    expect(dateButton.querySelector("input")).toBeNull();

    await user.click(dateButton);
    const dialog = screen.getByRole("dialog", { name: "選擇日期" });
    expect(dialog).toBeInTheDocument();

    const input = within(dialog).getByDisplayValue("2026-08-17");
    await user.clear(input);
    await user.type(input, "2026-08-22");
    await user.click(screen.getByRole("button", { name: "確定" }));

    await waitFor(() => expect(loadBoard).toHaveBeenCalledWith("2026-08-22", 1));
    expect(
      screen.queryByRole("heading", { name: "選擇日期" }),
    ).not.toBeInTheDocument();
  });

  it("moves the top pager by one day", async () => {
    const user = userEvent.setup();
    const loadBoard = vi.fn(async (date: string) => ({
      ...board,
      dates: [date],
    }));

    render(
      <FactoryBoardPage
        initialDate="2026-08-17"
        loadBoard={loadBoard}
        loadFleets={async () => []}
        loadBrands={async () => []}
        qzClient={qzClient}
      />,
    );

    await waitFor(() => expect(loadBoard).toHaveBeenCalledWith("2026-08-17", 1));
    const pagerButtons = document.querySelectorAll<HTMLButtonElement>(
      ".factory-board-pager button",
    );

    await user.click(pagerButtons[0]!);
    await waitFor(() => expect(loadBoard).toHaveBeenCalledWith("2026-08-16", 1));

    await user.click(pagerButtons[2]!);
    await waitFor(() => expect(loadBoard).toHaveBeenCalledWith("2026-08-17", 1));
  });

  it("opens the large serving calendar from the top actions", async () => {
    const user = userEvent.setup();
    const open = vi.spyOn(window, "open").mockImplementation(() => null);

    render(
      <FactoryBoardPage
        initialDate="2026-08-17"
        loadBoard={async () => board}
        loadFleets={async () => []}
        loadBrands={async () => []}
        qzClient={qzClient}
      />,
    );

    await user.click(
      await screen.findByRole("button", { name: "出餐日曆" }),
    );
    expect(open).toHaveBeenCalledWith(
      "/factory/production-calendar",
      "_blank",
      "noopener,noreferrer",
    );
    open.mockRestore();
  });

  it("opens the fleet picker from 出車表 and submits the dispatch sheet", async () => {
    const user = userEvent.setup();
    render(
      <FactoryBoardPage
        initialDate="2026-08-17"
        loadBoard={async () => board}
        loadFleets={async () => [
          { id: "team-sun", name: "Sun-Line", shortName: "宏" },
        ]}
        loadBrands={async () => []}
        qzClient={qzClient}
      />,
    );

    expect(await screen.findByText("大尾督")).toBeInTheDocument();
    expect(screen.getByText("8月18日 (二)")).toBeInTheDocument();
    expect(screen.getByText("#B-1522")).toBeInTheDocument();
    expect(screen.getByText("09:30")).toBeInTheDocument();
    expect(screen.queryByText("10:00")).not.toBeInTheDocument();
    expect(screen.getByText("(7份)")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "多日菜式總表" })).toHaveClass(
      "factory-board-multi-day",
    );
    expect(screen.getByLabelText("逢星期 1 盤點")).toBeInTheDocument();
    expect(document.querySelector(".factory-board-notice-day")).toHaveTextContent(
      "1",
    );

    const dispatchButtons = screen.getAllByRole("button", { name: "出車表" });
    await user.click(dispatchButtons[1]!);

    expect(
      screen.getByRole("heading", { name: "選擇車隊 - 18/08/2026" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "尚未分派車隊" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Sun-Line" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "宏" })).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Sun-Line" }));
    await user.click(screen.getByRole("button", { name: "提交" }));

    expect(
      screen.getByRole("heading", { name: "08月18日 (星期二) - Sun-Line" }),
    ).toBeInTheDocument();
    expect(screen.getByText("項目")).toBeInTheDocument();
    expect(screen.getByText("訂單號碼")).toBeInTheDocument();
    expect(screen.getByText("到達時間")).toBeInTheDocument();
    expect(screen.getByText("Eric Yim")).toBeInTheDocument();
    expect(screen.getByText("66817198")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Export" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "關閉" })).toBeInTheDocument();
  });

  it("shows the yellow new-order tag and starred corner for 12 hours", async () => {
    const { container } = render(
      <FactoryBoardPage
        initialDate="2099-08-17"
        loadBoard={async () => ({
          ...board,
          dates: ["2099-08-17", "2099-08-18", "2099-08-19"],
          items: board.items.map((entry) => ({
            ...entry,
            deliveryAt: "2099-08-18T02:00:00.000Z",
            orderReceivedAt: new Date().toISOString(),
          })),
        })}
        loadFleets={async () => []}
        loadBrands={async () => []}
        qzClient={qzClient}
      />,
    );

    expect(await screen.findByText("新訂單")).toHaveClass("factory-new-order-tag");
    expect(screen.getByLabelText("新訂單")).toBeInTheDocument();
    expect(container.querySelector(".factory-new-order-corner")).not.toBeNull();
  });

  it("opens an order card in a separate factory order page", async () => {
    const user = userEvent.setup();
    const open = vi.spyOn(window, "open").mockImplementation(() => null);
    render(
      <FactoryBoardPage
        initialDate="2026-08-17"
        loadBoard={async () => board}
        loadFleets={async () => []}
        loadBrands={async () => []}
        qzClient={qzClient}
      />,
    );

    await user.click(await screen.findByRole("button", { name: /#B-1522/ }));

    expect(open).toHaveBeenCalledWith(
      "/factory/order/job-1",
      "_blank",
      "noopener,noreferrer",
    );
    open.mockRestore();
  });

  it("opens the large-screen order job from a delivery card", async () => {
    const user = userEvent.setup();
    render(
      <FactoryBoardPage
        initialDate="2026-08-17"
        loadBoard={async () => ({
          ...board,
          items: board.items.map((boardItem) => ({
            ...boardItem,
            shippingMethodName: "車邊交收",
          })),
        })}
        loadFleets={async () => [
          { id: "team-sun", name: "Sun-Line", shortName: "宏" },
        ]}
        loadBrands={async () => []}
        openOrdersInNewPage={false}
        qzClient={qzClient}
        loadOrderJob={async () => ({
          packingNote: "分開兩箱",
          customerNote: "到達前致電客戶",
          dispatchTime: "10:00",
          arrivalWindow: "11:00 - 12:00",
          brandName: "HK lunch box",
          brandWebsite: "https://hklunchbox.com/",
          lines: [
            {
              id: "line-1",
              label: "(雙格) 拿破崙肉丸意粉",
              quantityText: "8",
              remarks: ["涼拌雲耳"],
              printed: true,
            },
            {
              id: "line-2",
              label: "檸檬茶",
              quantityText: "23",
              remarks: [],
              printed: false,
            },
            {
              id: "line-empty",
              label: "   ",
              quantityText: "1",
              remarks: [],
              printed: false,
            },
          ],
        })}
      />,
    );

    await user.click(await screen.findByRole("button", { name: /#B-1522/ }));

    expect(await screen.findByRole("heading", { name: "#B-1522" })).toBeInTheDocument();
    const orderMain = document.querySelector(".factory-order-main");
    expect(orderMain).not.toBeNull();
    const orderView = within(orderMain as HTMLElement);
    expect(orderView.getByText("08月18日 星期二")).toBeInTheDocument();
    expect(orderView.getByText("出車時間: 10:00")).toBeInTheDocument();
    expect(orderView.getByRole("button", { name: "修改出車時間" })).toHaveClass(
      "factory-dispatch-time-trigger",
    );
    expect(orderView.getByText("送到時間: 11:00 - 12:00")).toHaveClass("is-arrival");
    expect(
      orderView.getByText(/地址: 大埔汀角道.*\* 車邊交收/),
    ).toBeInTheDocument();
    expect(orderView.getByText("客人名稱: Eric Yim")).toBeInTheDocument();
    expect(orderView.getByText("包裝說明: 分開兩箱")).toBeInTheDocument();
    const dishName = orderView.getByText("(雙格) 拿破崙肉丸意粉");
    const dishBody = dishName.closest(".factory-order-line-body");
    expect(dishBody).not.toBeNull();
    expect(Array.from(dishBody!.children).map((node) => node.textContent)).toEqual([
      "(雙格) 拿破崙肉丸意粉",
      "× 8",
      "涼拌雲耳",
    ]);
    expect(orderView.getByText("涼拌雲耳")).toHaveClass("factory-order-line-remark");
    expect(orderView.getAllByLabelText("標籤已打印")).toHaveLength(1);
    expect(orderView.getAllByRole("button")).toHaveLength(3);
    expect(screen.getByRole("button", { name: "印全單" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "印地址" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "印送貨單" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "已選擇 - 宏" })).toBeInTheDocument();
    expect(screen.getByLabelText("連接到標籤打印機")).toBeInTheDocument();

    const print = vi.spyOn(window, "print").mockImplementation(() => {});
    await user.click(screen.getByRole("button", { name: "印送貨單" }));
    expect(print).toHaveBeenCalledOnce();
    expect(document.querySelector(".factory-delivery-note-print")).toHaveTextContent(
      "B-1522",
    );
    expect(document.querySelector(".factory-delivery-note-details")).toHaveTextContent("*");
    expect(document.querySelector(".factory-delivery-note-details")).toHaveTextContent(
      "到達前致電客戶",
    );
    expect(document.querySelector(".factory-delivery-note-details")).not.toHaveTextContent(
      "分開兩箱",
    );
    const deliveryContact = document.querySelector(
      ".factory-delivery-note-contact",
    );
    expect(deliveryContact).toHaveTextContent(/Eric Yim\s+66817198/);
    expect(deliveryContact?.querySelector("span")).toHaveTextContent("66817198");
    expect(document.querySelector(".factory-delivery-note-print")).toHaveTextContent(
      "拿破崙肉丸意粉",
    );
    expect(document.querySelector(".factory-delivery-note-print")).toHaveTextContent(
      "#B-1522",
    );
    const brandFooter = document.querySelector(".factory-delivery-note-brand-footer");
    expect(brandFooter).toHaveTextContent("HK Lunch Box");
    expect(brandFooter).toHaveTextContent("https://hklunchbox.com/");
    expect(document.querySelector(".factory-delivery-note-order-footer")).toBeNull();
    expect(document.querySelector(".factory-delivery-note-brand img")).toHaveAttribute(
      "src",
      "/assets/fcc-hk-lunch-box-logo.svg",
    );
    print.mockRestore();

    await user.click(screen.getByRole("button", { name: "返回" }));
    expect(screen.getAllByRole("button", { name: "出車表" })).toHaveLength(3);
  });

  it("shows print completion only after all labels and warns before opening a changed order", async () => {
    const user = userEvent.setup();
    const loadOrderJob = vi.fn(async () => ({
      packingNote: null,
      dispatchTime: "10:00",
      arrivalWindow: null,
      lines: [],
    }));
    const { rerender } = render(
      <FactoryBoardPage
        initialDate="2026-08-17"
        loadBoard={async () => ({
          ...board,
          printStatusByOrderId: { "order-1": "complete" },
        })}
        loadFleets={async () => []}
        loadBrands={async () => []}
        loadOrderJob={loadOrderJob}
        openOrdersInNewPage={false}
        qzClient={qzClient}
      />,
    );

    expect(await screen.findByLabelText("全部標籤已打印")).toBeInTheDocument();

    rerender(
      <FactoryBoardPage
        initialDate="2026-08-17"
        loadBoard={async () => ({
          ...board,
          printStatusByOrderId: { "order-1": "needs-reprint" },
        })}
        loadFleets={async () => []}
        loadBrands={async () => []}
        loadOrderJob={loadOrderJob}
        openOrdersInNewPage={false}
        qzClient={qzClient}
      />,
    );

    expect(
      await screen.findByLabelText("訂單已修改，需要重新打印"),
    ).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /#B-1522/ }));

    expect(
      screen.getByRole("heading", { name: "需要重新打印標籤" }),
    ).toBeInTheDocument();
    expect(screen.getByText(/新增、刪除或數量變更/)).toBeInTheDocument();
    expect(loadOrderJob).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: "繼續查看訂單" }));
    expect(await screen.findByRole("heading", { name: "#B-1522" })).toBeInTheDocument();
    expect(loadOrderJob).toHaveBeenCalledWith("order-1");
  });

  it("assigns an unassigned delivery from the order page and confirms success", async () => {
    const user = userEvent.setup();
    const assignMotorcade = vi.fn(async () => {});
    render(
      <FactoryBoardPage
        initialDate="2026-08-17"
        loadBoard={async () => ({
          ...board,
          items: board.items.map((entry) => ({
            ...entry,
            motorcadeId: null,
            motorcadeName: null,
          })),
        })}
        loadFleets={async () => [
          { id: "team-sun", name: "Sun-Line", shortName: "宏" },
          { id: "team-adam", name: "Adam", shortName: null },
        ]}
        loadBrands={async () => []}
        loadOrderJob={async () => ({
          packingNote: null,
          dispatchTime: "10:00",
          arrivalWindow: null,
          lines: [],
        })}
        assignMotorcade={assignMotorcade}
        openOrdersInNewPage={false}
        qzClient={qzClient}
      />,
    );

    await user.click(await screen.findByRole("button", { name: /#B-1522/ }));
    await user.click(await screen.findByRole("button", { name: "分派司機" }));

    expect(
      screen.getByRole("heading", { name: "分派司機 - B-1522" }),
    ).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Adam" }));
    await user.click(screen.getByRole("button", { name: "提交" }));

    expect(assignMotorcade).toHaveBeenCalledWith("job-1", "team-adam");
    expect(await screen.findByText("分配成功")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "已選擇 - Adam" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("heading", { name: "分派司機 - B-1522" }),
    ).not.toBeInTheDocument();
  });

  it("prints a full dish-label set through QZ before marking the line printed", async () => {
    const user = userEvent.setup();
    const printLabels = vi.fn(async () => {});
    const markLinePrinted = vi.fn(async () => {});
    const loadLabelCommand = vi.fn(async () => "VEVTUA==");
    const connectedQzClient: QzTrayClient = {
      connect: vi.fn(async () => {}),
      disconnect: vi.fn(async () => {}),
      listPrinters: vi.fn(async () => ["Zebra ZD421"]),
      queryStatuses: vi.fn(async () => []),
      printLabels,
    };
    render(
      <FactoryBoardPage
        initialDate="2026-08-17"
        loadBoard={async () => board}
        loadFleets={async () => []}
        loadBrands={async () => []}
        loadOrderJob={async () => ({
          packingNote: "分開包裝",
          dispatchTime: "10:00",
          arrivalWindow: null,
          requiresReprint: true,
          lines: [
            {
              id: "line-print",
              label: "(單格) 煎雞扒胡麻沙律",
              labelName: "煎雞扒胡麻沙律\n走醬另上",
              labelNames: ["煎雞扒胡麻沙律\n走醬另上", "胡麻醬\n另上"],
              quantityText: "3",
              remarks: ["走醬"],
              printed: false,
              requiresReprint: true,
              changes: [
                {
                  id: "change-quantity",
                  orderLineId: "line-print",
                  operation: "update",
                  lineName: "煎雞扒胡麻沙律",
                  changedFields: { quantity: { before: 1, after: 3 } },
                  changedAt: "2026-08-24T12:01:00+08:00",
                },
              ],
            },
            {
              id: "line-ok",
              label: "不受影響菜式",
              labelName: "不受影響標籤",
              quantityText: "1",
              remarks: [],
              printed: true,
              requiresReprint: false,
            },
          ],
        })}
        markLinePrinted={markLinePrinted}
        loadLabelCommand={loadLabelCommand}
        openOrdersInNewPage={false}
        qzClient={connectedQzClient}
      />,
    );

    await user.click(await screen.findByRole("button", { name: /#B-1522/ }));
    expect(await screen.findByLabelText("標籤需要重新打印")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /不受影響菜式/ }));
    expect(screen.queryByText(/必須重新打印/)).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "關閉" }));
    await user.click(screen.getByRole("button", { name: /煎雞扒胡麻沙律/ }));

    expect(screen.getByRole("heading", { name: "印標籤" })).toBeInTheDocument();
    expect(
      screen.queryByLabelText("50 × 75 mm 標籤預覽：B-1522"),
    ).not.toBeInTheDocument();
    expect(screen.getByText("原名稱")).toBeInTheDocument();
    expect(screen.getByText("標籤名稱")).toBeInTheDocument();
    expect(
      screen.getAllByText("(單格) 煎雞扒胡麻沙律")
        .find((element) => element.classList.contains("factory-label-original-name")),
    ).toBeInTheDocument();
    expect(screen.getByText("煎雞扒胡麻沙律 走醬另上")).toHaveClass("factory-label-database-name");
    expect(screen.getByText("胡麻醬 另上")).toHaveClass("factory-label-database-name");
    expect(screen.getByText(/此菜式有以下變更/)).toBeInTheDocument();
    expect(screen.getByText("數量")).toBeInTheDocument();
    expect(screen.getByText("1 → 3")).toBeInTheDocument();
    const fullSet = screen.getByRole("button", { name: "印全套標籤（6個）" });
    await waitFor(() => expect(fullSet).toBeEnabled());
    const singleSet = screen.getByRole("button", { name: "印單個標籤（2個）" });
    await user.click(singleSet);
    expect(loadLabelCommand).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ labelName: "煎雞扒胡麻沙律\n走醬另上", copies: 1 }),
    );
    expect(loadLabelCommand).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ labelName: "胡麻醬\n另上", copies: 1 }),
    );
    expect(markLinePrinted).not.toHaveBeenCalled();
    loadLabelCommand.mockClear();
    printLabels.mockClear();
    await waitFor(() => expect(fullSet).toBeEnabled());
    await user.click(fullSet);

    expect(loadLabelCommand).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ labelName: "煎雞扒胡麻沙律\n走醬另上", copies: 3 }),
    );
    expect(loadLabelCommand).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ labelName: "胡麻醬\n另上", copies: 3 }),
    );
    expect(printLabels).toHaveBeenCalledWith("Zebra ZD421", "VEVTUFRFU1A=", 1);
    expect(markLinePrinted).toHaveBeenCalledWith("line-print");
    expect(
      await screen.findByText("全套標籤已送到打印機。"),
    ).toBeInTheDocument();
    expect(screen.getByLabelText("已經印刷")).toBeInTheDocument();
    expect(screen.getAllByLabelText("標籤已打印")).toHaveLength(2);
  });

  it("does not report a printer failure after printing succeeds when status saving fails", async () => {
    const user = userEvent.setup();
    const printLabels = vi.fn(async () => {});
    const markLinePrinted = vi.fn(async () => {
      throw new Error("status_write_failed");
    });
    const connectedQzClient: QzTrayClient = {
      connect: vi.fn(async () => {}),
      disconnect: vi.fn(async () => {}),
      listPrinters: vi.fn(async () => ["Zebra ZD421"]),
      queryStatuses: vi.fn(async () => []),
      printLabels,
    };
    render(
      <FactoryBoardPage
        initialDate="2026-08-17"
        loadBoard={async () => board}
        loadFleets={async () => []}
        loadBrands={async () => []}
        loadOrderJob={async () => ({
          packingNote: null,
          dispatchTime: "10:00",
          arrivalWindow: null,
          changeTaskPending: true,
          lines: [
            {
              id: "line-status-fail",
              label: "檸檬茶",
              quantityText: "2",
              remarks: [],
              printed: false,
            },
          ],
        })}
        markLinePrinted={markLinePrinted}
        loadLabelCommand={async () => "VEVTUA=="}
        openOrdersInNewPage={false}
        qzClient={connectedQzClient}
      />,
    );

    await user.click(await screen.findByRole("button", { name: /#B-1522/ }));
    await user.click(await screen.findByRole("button", { name: /檸檬茶/ }));
    const fullSet = screen.getByRole("button", { name: "印全套標籤（2個）" });
    await waitFor(() => expect(fullSet).toBeEnabled());
    await user.click(fullSet);

    expect(printLabels).toHaveBeenCalledWith("Zebra ZD421", "VEVTUA==", 1);
    expect(markLinePrinted).toHaveBeenCalledWith("line-status-fail");
    expect(await screen.findByText("全套標籤已送到打印機。")).toBeInTheDocument();
    expect(screen.queryByText(/標籤打印失敗，狀態沒有更新/)).not.toBeInTheDocument();
    expect(screen.queryByText("訂單資料已修改")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "確認打印及現場資料已更新" })).not.toBeInTheDocument();
  });

  it("does not show the pending-change summary on the factory home page", async () => {
    render(
      <FactoryBoardPage
        initialDate="2026-08-17"
        loadBoard={async () => ({ ...board, pendingChangeCount: 8 })}
        loadFleets={async () => []}
        loadBrands={async () => []}
        qzClient={qzClient}
      />,
    );

    await screen.findByRole("button", { name: /#B-1522/ });
    expect(screen.queryByText("8 張訂單有待確認修改")).not.toBeInTheDocument();
    expect(
      screen.queryByText("請進入相關訂單完成重印並確認現場資料。"),
    ).not.toBeInTheDocument();
  });

  it("prints every order label and an address-only label from the order actions", async () => {
    const user = userEvent.setup();
    const printLabels = vi.fn(async () => {});
    const markLinePrinted = vi.fn(async () => {});
    const loadLabelCommand = vi.fn(async () => "VEVTUA==");
    const connectedQzClient: QzTrayClient = {
      connect: vi.fn(async () => {}),
      disconnect: vi.fn(async () => {}),
      listPrinters: vi.fn(async () => ["Zebra ZD421"]),
      queryStatuses: vi.fn(async () => []),
      printLabels,
    };
    render(
      <FactoryBoardPage
        initialDate="2026-08-17"
        loadBoard={async () => board}
        loadFleets={async () => []}
        loadBrands={async () => []}
        loadOrderJob={async () => ({
          packingNote: "分開包裝",
          dispatchTime: "10:00",
          arrivalWindow: "10:30 - 11:00",
          lines: [
            { id: "line-a", label: "檸檬茶", quantityText: "2", remarks: [], printed: false },
            { id: "line-b", label: "飯盒餐具包", quantityText: "1", remarks: [], printed: false },
          ],
        })}
        markLinePrinted={markLinePrinted}
        loadLabelCommand={loadLabelCommand}
        openOrdersInNewPage={false}
        qzClient={connectedQzClient}
      />,
    );

    await user.click(await screen.findByRole("button", { name: /#B-1522/ }));
    const printAll = await screen.findByRole("button", { name: "印全單" });
    await waitFor(() => expect(printAll).toBeEnabled());
    await user.click(printAll);

    await waitFor(() => expect(markLinePrinted).toHaveBeenCalledTimes(2));
    expect(loadLabelCommand).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ labelName: "檸檬茶", copies: 2 }),
    );
    expect(loadLabelCommand).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ labelName: "飯盒餐具包", copies: 1 }),
    );
    expect(printLabels).toHaveBeenCalledTimes(1);
    expect(printLabels).toHaveBeenLastCalledWith(
      "Zebra ZD421",
      "VEVTUFRFU1A=",
      1,
    );

    await user.click(screen.getByRole("button", { name: "印地址" }));
    await waitFor(() => expect(loadLabelCommand).toHaveBeenCalledTimes(3));
    expect(loadLabelCommand).toHaveBeenLastCalledWith({
      kind: "address",
      orderNumber: "B-1522",
      deliveryDate: "2026-08-18",
      district: "大尾督",
      customerName: "Eric Yim",
      customerPhone: "66817198",
    });
    expect(printLabels).toHaveBeenCalledTimes(2);
  });

  it("opens the hidden dispatch-time editor and saves the time to the order", async () => {
    const user = userEvent.setup();
    const saveDispatchTime = vi.fn(async () => {});
    render(
      <FactoryBoardPage
        initialDate="2026-08-17"
        loadBoard={async () => board}
        loadFleets={async () => []}
        loadBrands={async () => []}
        loadOrderJob={async () => ({
          packingNote: null,
          dispatchTime: "10:00",
          arrivalWindow: "10:30 - 11:00",
          lines: [],
        })}
        saveDispatchTime={saveDispatchTime}
        openOrdersInNewPage={false}
        qzClient={qzClient}
      />,
    );

    await user.click(await screen.findByRole("button", { name: /#B-1522/ }));
    await user.click(screen.getByRole("button", { name: "修改出車時間" }));
    const dialog = screen.getByRole("dialog", { name: "修改出車時間" });
    const input = within(dialog).getByLabelText("出車時間");
    await user.clear(input);
    await user.type(input, "11:15");
    await user.click(within(dialog).getByRole("button", { name: "儲存出車時間" }));

    expect(saveDispatchTime).toHaveBeenCalledWith("order-1", "11:15");
    expect(await screen.findByText("出車時間: 11:15")).toBeInTheDocument();
  });

  it("does not turn a label green when the printer call fails", async () => {
    const user = userEvent.setup();
    const markLinePrinted = vi.fn(async () => {});
    const failingQzClient: QzTrayClient = {
      connect: vi.fn(async () => {}),
      disconnect: vi.fn(async () => {}),
      listPrinters: vi.fn(async () => ["Zebra ZD421"]),
      queryStatuses: vi.fn(async () => []),
      printLabels: vi.fn(async () => {
        throw new Error("paper_out");
      }),
    };
    render(
      <FactoryBoardPage
        initialDate="2026-08-17"
        loadBoard={async () => board}
        loadFleets={async () => []}
        loadBrands={async () => []}
        loadOrderJob={async () => ({
          packingNote: null,
          dispatchTime: "10:00",
          arrivalWindow: null,
          lines: [
            {
              id: "line-fail",
              label: "檸檬茶",
              quantityText: "2",
              remarks: [],
              printed: false,
            },
          ],
        })}
        markLinePrinted={markLinePrinted}
        loadLabelCommand={async () => "VEVTUA=="}
        openOrdersInNewPage={false}
        qzClient={failingQzClient}
      />,
    );

    await user.click(await screen.findByRole("button", { name: /#B-1522/ }));
    await user.click(await screen.findByRole("button", { name: /檸檬茶/ }));
    const fullSet = screen.getByRole("button", { name: "印全套標籤（2個）" });
    await waitFor(() => expect(fullSet).toBeEnabled());
    await user.click(fullSet);

    expect(
      await screen.findByText(/標籤打印失敗，狀態沒有更新/),
    ).toBeInTheDocument();
    expect(markLinePrinted).not.toHaveBeenCalled();
    expect(screen.queryByLabelText("標籤已打印")).not.toBeInTheDocument();
  });

  it("opens the brand picker from 菜式總表 and submits the dish summary", async () => {
    const user = userEvent.setup();
    const print = vi.spyOn(window, "print").mockImplementation(() => {});
    render(
      <FactoryBoardPage
        initialDate="2026-08-17"
        loadBoard={async () => board}
        loadFleets={async () => [
          { id: "team-sun", name: "Sun-Line", shortName: "宏" },
        ]}
        loadBrands={async () => [
          { id: "brand-express", name: "Express" },
          { id: "brand-catering", name: "Catering" },
        ]}
        qzClient={qzClient}
        loadMenuRows={async () => [
          {
            label: "拿破崙肉丸意粉",
            quantity: 8,
            typeSort: 10,
            orders: [
              {
                orderId: "order-1",
                orderNumber: "B-1522",
                completionTime: "10:00",
                quantity: 8,
              },
            ],
          },
        ]}
      />,
    );

    await waitFor(() =>
      expect(screen.getAllByRole("button", { name: "菜式總表" })).toHaveLength(3),
    );
    const menuButtons = screen.getAllByRole("button", { name: "菜式總表" });
    await user.click(menuButtons[1]!);

    expect(
      screen.getByRole("heading", { name: "選擇品牌 - 18/08/2026" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "全部" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Express" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Catering" })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Catering" }));
    await user.click(screen.getByRole("button", { name: "提交" }));

    const summary = screen.getByRole("dialog", {
      name: "08月18日 (星期二) - Catering",
    });
    expect(summary).toHaveClass("factory-menu-summary-modal");
    expect(summary.querySelector("col.factory-menu-summary-dish-column")).toBeInTheDocument();
    expect(await within(summary).findByText("拿破崙肉丸意粉")).toBeInTheDocument();
    expect(within(summary).getByText("菜式")).toBeInTheDocument();
    expect(within(summary).getByText("全日總數")).toBeInTheDocument();
    expect(within(summary).getByText("備料及出車時間一覽表")).toBeInTheDocument();
    expect(within(summary).getByText(/^列印時間：/)).toBeInTheDocument();
    expect(within(summary).getByText("Catering")).toBeInTheDocument();
    expect(within(summary).getByText("#B-1522")).toBeInTheDocument();
    expect(within(summary).getByText("10點完成")).toBeInTheDocument();
    expect(within(summary).getAllByText("8")).toHaveLength(2);
    expect(
      within(summary).getAllByText("8").some((cell) => cell.classList.contains("has-data")),
    ).toBe(true);
    expect(summary.querySelector("thead tr:first-child th:first-child")).toHaveAttribute(
      "colspan",
      "10",
    );
    expect(within(summary).getByRole("button", { name: "關閉" })).toBeInTheDocument();
    await user.click(within(summary).getByRole("button", { name: "列印" }));
    expect(print).toHaveBeenCalledTimes(1);
    const printRoot = document.querySelector(".factory-menu-print-root");
    expect(printRoot).toHaveTextContent("日期: 2026年8月18日");
    expect(printRoot).toHaveTextContent("拿破崙肉丸意粉");
    expect(printRoot?.querySelectorAll("tbody tr")).toHaveLength(1);
    print.mockRestore();
  });

  it("opens the selected multi-day range in a separate report page", async () => {
    const user = userEvent.setup();
    const open = vi.spyOn(window, "open").mockImplementation(() => null);
    render(
      <FactoryBoardPage
        initialDate="2026-08-17"
        loadBoard={async () => board}
        loadFleets={async () => []}
        loadBrands={async () => []}
        qzClient={qzClient}
      />,
    );

    await user.click(await screen.findByRole("button", { name: "多日菜式總表" }));
    await user.type(screen.getByLabelText("開始日期"), "2026-08-17");
    await user.type(screen.getByLabelText("結束日期"), "2026-08-20");
    await user.click(screen.getByRole("button", { name: "下一步" }));

    expect(open).toHaveBeenCalledWith(
      "/factory/multi-day-menu?start=2026-08-17&end=2026-08-20",
      "_blank",
      "noopener,noreferrer",
    );
    open.mockRestore();
  });

  it("opens a date range and builds a printable multi-day summary with removable brands", async () => {
    const user = userEvent.setup();
    const loadMultiDayMenu = vi.fn(async () => [
      {
        brandId: "brand-express",
        orderId: "order-1",
        orderNumber: "B-1522",
        deliveryDate: "2026-08-18",
        deliveryTime: "10:00",
        label: "拿破崙肉丸意粉",
        quantity: 2,
      },
      {
        brandId: "brand-catering",
        orderId: "order-2",
        orderNumber: "B-1533",
        deliveryDate: "2026-08-19",
        deliveryTime: "11:30",
        label: "拿破崙肉丸意粉",
        quantity: 3,
      },
    ]);
    const print = vi.spyOn(window, "print").mockImplementation(() => {});

    render(
      <FactoryBoardPage
        initialDate="2026-08-17"
        loadBoard={async () => board}
        loadFleets={async () => []}
        loadBrands={async () => [
          { id: "brand-express", name: "Express" },
          { id: "brand-catering", name: "Catering" },
        ]}
        loadMultiDayMenu={loadMultiDayMenu}
        openMultiDayInNewPage={false}
        qzClient={qzClient}
      />,
    );

    await user.click(
      await screen.findByRole("button", { name: "多日菜式總表" }),
    );
    expect(
      screen.getByRole("heading", { name: "選擇日期範圍" }),
    ).toBeInTheDocument();
    expect(screen.getByLabelText("開始日期")).toHaveValue("");
    expect(screen.getByLabelText("結束日期")).toHaveValue("");
    expect(screen.getByRole("button", { name: "下一步" })).toBeDisabled();

    await user.type(screen.getByLabelText("開始日期"), "2026-08-17");
    await user.type(screen.getByLabelText("結束日期"), "2026-08-19");

    await user.click(screen.getByRole("button", { name: "下一步" }));
    expect(loadMultiDayMenu).toHaveBeenCalledWith("2026-08-17", "2026-08-19");
    expect(
      await screen.findByRole("heading", {
        name: /備料及出車時間一覽表.*2026年08月17日.*19日/,
      }),
    ).toBeInTheDocument();
    expect(screen.getByText("Express")).toBeInTheDocument();
    expect(screen.getByText("Catering")).toBeInTheDocument();

    const dishRow = screen.getByText("拿破崙肉丸意粉").closest("tr");
    expect(dishRow).not.toBeNull();
    expect(within(dishRow!).getByText("5")).toBeInTheDocument();
    expect(within(dishRow!).getByText(/#B-1522 × 2/)).toBeInTheDocument();
    expect(within(dishRow!).getByText(/#B-1533 × 3/)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "移除 Catering 的菜式" }));
    expect(screen.queryByText("Catering")).not.toBeInTheDocument();
    expect(within(dishRow!).getByText("2")).toBeInTheDocument();
    expect(within(dishRow!).queryByText(/#B-1533/)).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "列印" }));
    expect(print).toHaveBeenCalledOnce();
    print.mockRestore();
  });

  it("opens a factory meat order in its own printable delivery-note page", async () => {
    const user = userEvent.setup();
    const open = vi.spyOn(window, "open").mockImplementation(() => null);
    const meatBoard: FactoryBoardData = {
      dates: ["2026-08-13", "2026-08-14", "2026-08-15"],
      items: [
        {
          ...item({
            id: "meat-1",
            orderId: null,
            orderNumber: "R - 202608 - 6",
            customerName: "桂花小幸 TKO",
            deliveryAt: "2026-08-13T16:00:00.000Z",
            deliveryTime: null,
            districtName: null,
          }),
          factorySource: "meat",
          factoryPrintStatus: "complete",
        },
      ],
      portionsByOrderId: {},
      printStatusByOrderId: {},
    };

    render(
      <FactoryBoardPage
        initialDate="2026-08-13"
        loadBoard={async () => meatBoard}
        loadFleets={async () => []}
        loadBrands={async () => []}
        qzClient={qzClient}
      />,
    );

    const card = await screen.findByRole("button", {
      name: /R - 202608 - 6.*桂花小幸 TKO/,
    });
    expect(card).toHaveClass("is-meat");
    expect(
      card.querySelector(".factory-job-print-status.is-complete"),
    ).not.toBeNull();
    await user.click(card);

    expect(open).toHaveBeenCalledWith(
      "/factory/meat-delivery-note/meat-1",
      "_blank",
      "noopener,noreferrer",
    );
    open.mockRestore();
  });
});
