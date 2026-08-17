import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vitest";

import { FactoryBoardPage } from "@/components/FactoryBoardPage";
import i18n from "@/i18n";
import type { DeliveryListItem } from "@/lib/deliveries";
import type { FactoryBoardData } from "@/lib/factory-board";

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
  beforeEach(async () => {
    await i18n.changeLanguage("zh-HK");
  });

  it("opens the fleet picker from 出車表 and submits the dispatch sheet", async () => {
    const user = userEvent.setup();
    render(
      <FactoryBoardPage
        initialDate="2026-08-17"
        loadBoard={async () => board}
        loadFleets={async () => [{ id: "team-sun", name: "Sun-Line" }]}
      />,
    );

    expect(await screen.findByText("大尾督")).toBeInTheDocument();
    expect(screen.getByText("8月18日 (二)")).toBeInTheDocument();
    expect(screen.getByText("#B-1522")).toBeInTheDocument();
    expect(screen.getByText("(7份)")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "多日菜式總表" })).toHaveClass(
      "factory-board-multi-day",
    );

    const dispatchButtons = screen.getAllByRole("button", { name: "出車表" });
    await user.click(dispatchButtons[1]!);

    expect(
      screen.getByRole("heading", { name: "選擇車隊 - 18/08/2026" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "尚未分派車隊" })).toBeInTheDocument();

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

  it("opens the large-screen order job from a delivery card", async () => {
    const user = userEvent.setup();
    render(
      <FactoryBoardPage
        initialDate="2026-08-17"
        loadBoard={async () => board}
        loadFleets={async () => [{ id: "team-sun", name: "Sun-Line" }]}
        loadOrderJob={async () => ({
          packingNote: "分開兩箱",
          dispatchTime: "10:00",
          arrivalWindow: "11:00 - 12:00",
          lines: [
            {
              id: "line-1",
              label: "(雙格) 拿破崙肉丸意粉 (x 8)",
              printed: true,
            },
            {
              id: "line-2",
              label: "檸檬茶 (x 23)",
              printed: false,
            },
          ],
        })}
      />,
    );

    await user.click(await screen.findByRole("button", { name: /#B-1522/ }));

    expect(await screen.findByRole("heading", { name: "B-1522" })).toBeInTheDocument();
    expect(screen.getByText("08月18日 星期二")).toBeInTheDocument();
    expect(await screen.findByText("出車時間: 10:00")).toBeInTheDocument();
    expect(screen.getByText("送到時間: 11:00 - 12:00")).toBeInTheDocument();
    expect(screen.getByText(/地址: 大埔汀角道/)).toBeInTheDocument();
    expect(screen.getByText("客人名稱: Eric Yim")).toBeInTheDocument();
    expect(screen.getByText("包裝說明: 分開兩箱")).toBeInTheDocument();
    expect(screen.getByText("(雙格) 拿破崙肉丸意粉 (x 8)")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "印全單" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "印地址" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "印送貨單" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "已選擇 - S" })).toBeInTheDocument();
    expect(screen.getByLabelText("連接到標籤打印機")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "返回" }));
    expect(screen.getAllByRole("button", { name: "出車表" })).toHaveLength(3);
  });
});
