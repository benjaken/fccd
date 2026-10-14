import { fireEvent,render,screen,waitFor,within } from "@testing-library/react";
import { beforeEach,expect,it,vi } from "vitest";
import { CustomerPortalRewardRulesPage } from "@/components/settings/CustomerPortalRewardRulesPage";
import "@/lib/customer-portal-i18n";
const mocks=vi.hoisted(()=>({rules:vi.fn(),holidays:vi.fn(),create:vi.fn(),holiday:vi.fn(),refund:vi.fn(),search:vi.fn(),edit:true}));
vi.mock("@/auth/use-page-access",()=>({useCurrentPageAccess:()=>({canAccess:()=>mocks.edit})}));
vi.mock("@/lib/customer-portal-reward-rules-ops",async original=>({...await original<typeof import("@/lib/customer-portal-reward-rules-ops")>(),listRewardRules:mocks.rules,listPointHolidays:mocks.holidays,createRewardRule:mocks.create,setPointHoliday:mocks.holiday,recordFoodRefund:mocks.refund,searchRefundOrders:mocks.search}));
const active={id:"rule",hkd_per_point:25,is_active:true,effective_at:"2026-10-12T08:00:00Z",created_at:"2026-10-12T08:00:00Z"};
const refundOrder={id:"00000000-0000-0000-0000-000000000001",order_number:"FC-1001",customer_name:"陳大文",company_name:"示例公司",phone:"91234567",delivery_at:"2026-10-16T04:00:00.000Z",delivery_status:"已送達",grand_total:280,outstanding:0,shipping_fee:30,food_amount:250};
beforeEach(()=>{mocks.edit=true;mocks.rules.mockReset().mockResolvedValue([active]);mocks.holidays.mockReset().mockResolvedValue([]);mocks.create.mockReset().mockResolvedValue("id");mocks.holiday.mockReset().mockResolvedValue(undefined);mocks.refund.mockReset().mockResolvedValue(undefined);mocks.search.mockReset().mockResolvedValue([refundOrder]);});
it("shows the earning rule and keeps operational forms out of the main page",async()=>{
  render(<CustomerPortalRewardRulesPage/>);
  expect(await screen.findByText("每 HK$25 餐費，賺取 1 分")).toBeInTheDocument();
  expect(screen.getAllByText(/16:00/).length).toBeGreaterThan(0);
  expect(screen.queryByLabelText("訂單 ID")).not.toBeInTheDocument();
  expect(screen.queryByLabelText("日期")).not.toBeInTheDocument();
  expect(screen.getByRole("heading",{name:"規則版本紀錄"})).toBeInTheDocument();
});
it("reports missing legacy threshold data without inventing a rate or rendering NaN",async()=>{
  mocks.rules.mockResolvedValue([{...active,hkd_per_point:undefined,points_per_hkd:100}]);
  const {container}=render(<CustomerPortalRewardRulesPage/>);
  expect(await screen.findByRole("alert")).toHaveTextContent("積分規則資料尚未更新");
  expect(container.textContent).not.toContain("NaN");
  expect(screen.getByRole("button",{name:"新增規則版本"})).toBeDisabled();
});
it("represents a zero threshold as paused earning",async()=>{
  mocks.rules.mockResolvedValue([{...active,hkd_per_point:0}]);render(<CustomerPortalRewardRulesPage/>);
  expect(await screen.findByText("目前暫停新訂單賺取積分。")).toBeInTheDocument();
  expect(screen.queryByText(/每 HK\$0/)).not.toBeInTheDocument();
});
it("creates a rule with Hong Kong time and retains an unsuccessful form",async()=>{
  mocks.create.mockRejectedValueOnce(new Error("duplicate_effective_at"));render(<CustomerPortalRewardRulesPage/>);
  await screen.findByText("每 HK$25 餐費，賺取 1 分");fireEvent.click(screen.getByRole("button",{name:"新增規則版本"}));
  const dialog=screen.getByRole("dialog");
  fireEvent.change(within(dialog).getByLabelText("生效時間"),{target:{value:"2026-10-15T12:00"}});
  fireEvent.click(within(dialog).getByRole("button",{name:"儲存"}));
  await waitFor(()=>expect(mocks.create).toHaveBeenCalledWith(25,"2026-10-15T04:00:00.000Z"));
  expect(await within(dialog).findByRole("alert")).toHaveTextContent("此生效時間已有規則版本");
  expect(within(dialog).getByRole("spinbutton")).toHaveValue(25);
});
it("shows a holiday load failure rather than an empty holiday list",async()=>{
  mocks.holidays.mockRejectedValue(new Error("unavailable"));render(<CustomerPortalRewardRulesPage/>);
  expect(await screen.findByText("暫時無法載入假期，請重試。")).toBeInTheDocument();
  expect(screen.queryByText("尚未加入額外假期。星期六、日會自動跳過。")).not.toBeInTheDocument();
  expect(screen.getByRole("button",{name:"加入假期"})).toBeDisabled();
});
it("adds a holiday from the side panel",async()=>{
  render(<CustomerPortalRewardRulesPage/>);await screen.findByText("每 HK$25 餐費，賺取 1 分");
  fireEvent.click(screen.getByRole("button",{name:"加入假期"}));const dialog=screen.getByRole("dialog");
  fireEvent.change(within(dialog).getByLabelText("日期"),{target:{value:"2026-12-25"}});
  fireEvent.change(within(dialog).getByLabelText("名稱"),{target:{value:"聖誕節"}});
  fireEvent.click(within(dialog).getByRole("button",{name:"加入假期"}));
  await waitFor(()=>expect(mocks.holiday).toHaveBeenCalledWith("2026-12-25","聖誕節"));
  await waitFor(()=>expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
});
it("searches for an order and shows its details before recording a refund",async()=>{
  render(<CustomerPortalRewardRulesPage/>);await screen.findByText("每 HK$25 餐費，賺取 1 分");
  fireEvent.click(screen.getByRole("button",{name:"記錄退款"}));const dialog=screen.getByRole("dialog");
  expect(dialog.className).toContain("reward-refund-panel");
  fireEvent.change(within(dialog).getByLabelText("退回餐費（HK$）"),{target:{value:"25"}});
  fireEvent.click(within(dialog).getByRole("button",{name:"記錄退款"}));
  expect(await within(dialog).findByRole("alert")).toBeInTheDocument();expect(mocks.refund).not.toHaveBeenCalled();
  fireEvent.change(within(dialog).getByLabelText("搜索訂單"),{target:{value:"FC-1001"}});
  expect(await within(dialog).findByRole("option",{name:/FC-1001/})).toBeInTheDocument();
  fireEvent.click(within(dialog).getByRole("option",{name:/FC-1001/}));
  expect(await within(dialog).findByText("陳大文")).toBeInTheDocument();
  expect(within(dialog).getByText("示例公司")).toBeInTheDocument();
  fireEvent.click(within(dialog).getByRole("button",{name:"記錄退款"}));
  await waitFor(()=>expect(mocks.refund).toHaveBeenCalledWith("00000000-0000-0000-0000-000000000001",25));
});
it("keeps rules and holidays readable without edit permissions",async()=>{
  mocks.edit=false;mocks.holidays.mockResolvedValue([{holiday_on:"2026-12-25",name:"聖誕節"}]);render(<CustomerPortalRewardRulesPage/>);
  expect(await screen.findByText("聖誕節")).toBeInTheDocument();
  expect(screen.queryByRole("button",{name:"新增規則版本"})).not.toBeInTheDocument();
  expect(screen.queryByRole("button",{name:"記錄退款"})).not.toBeInTheDocument();
});
