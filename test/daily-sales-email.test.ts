import { describe, expect, it } from "vitest";

import { buildDailySalesEmail } from "../supabase/functions/_shared/daily-sales-email";

describe("daily sales report email", () => {
  it("builds the Bubble-compatible report subject and all report sections", () => {
    const email = buildDailySalesEmail({
      date: "2026-08-25",
      restaurantName: "TKO 桂花小幸 將軍澳",
      total: 39068.1,
      payments: [{ name: "現金", value: 1000 }, { name: "Foodpanda", value: 38068.1 }],
      departments: [{ name: "餐廳", value: 39068.1 }],
      periods: [{ name: "晚市", value: 39068.1 }],
      products: [{ name: "冬瓜茶", value: 3 }],
      workingHours: [{ name: "樓面", value: 12.5 }],
    });

    expect(email.subject).toBe("2026年8月25日 星期二 TKO 桂花小幸 將軍澳營業額");
    expect(email.html).toContain("總營業額：</strong>$39,068.10");
    expect(email.html).toContain("收款方式／外賣平台");
    expect(email.html).toContain("Foodpanda：$38,068.10");
    expect(email.html).toContain("部門統計");
    expect(email.html).toContain("時段統計");
    expect(email.html).toContain("新品");
    expect(email.html).toContain("冬瓜茶：3");
    expect(email.html).toContain("各部門總工時");
    expect(email.html).toContain("樓面：12.5 小時");
  });

  it("escapes restaurant and line names before inserting them into HTML", () => {
    const email = buildDailySalesEmail({
      date: "2026-08-25",
      restaurantName: "A&B <Shop>",
      total: 1,
      payments: [{ name: "Cash <script>", value: 1 }],
      departments: [],
      periods: [],
      products: [],
      workingHours: [],
    });

    expect(email.html).toContain("A&amp;B &lt;Shop&gt;");
    expect(email.html).toContain("Cash &lt;script&gt;");
    expect(email.html).not.toContain("<script>");
  });
});
