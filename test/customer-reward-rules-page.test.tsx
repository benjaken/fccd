import { fireEvent,render,screen,waitFor,within } from "@testing-library/react";
import { beforeEach,expect,it,vi } from "vitest";
import { CustomerPortalRewardRulesPage } from "@/components/settings/CustomerPortalRewardRulesPage";
import "@/lib/customer-portal-i18n";
const mocks=vi.hoisted(()=>({rules:vi.fn(),closures:vi.fn(),create:vi.fn(),closure:vi.fn(),refund:vi.fn(),search:vi.fn(),edit:true}));
vi.mock("@/auth/use-page-access",()=>({useCurrentPageAccess:()=>({canAccess:()=>mocks.edit})}));
vi.mock("@/lib/customer-portal-reward-rules-ops",async original=>({...await original<typeof import("@/lib/customer-portal-reward-rules-ops")>(),listRewardRules:mocks.rules,listOrderClosures:mocks.closures,createRewardRule:mocks.create,setOrderClosure:mocks.closure,recordFoodRefund:mocks.refund,searchRefundOrders:mocks.search}));
const active={id:"rule",hkd_per_point:25,is_active:true,effective_at:"2026-10-12T08:00:00Z",created_at:"2026-10-12T08:00:00Z"};
const refundOrder={id:"00000000-0000-0000-0000-000000000001",order_number:"FC-1001",customer_name:"陳大文",company_name:"示例公司",phone:"91234567",delivery_at:"2026-10-16T04:00:00.000Z",delivery_status:"已送達",grand_total:280,outstanding:0,shipping_fee:30,food_amount:250};
beforeEach(()=>{mocks.edit=true;mocks.rules.mockReset().mockResolvedValue([active]);mocks.closures.mockReset().mockResolvedValue([]);mocks.create.mockReset().mockResolvedValue("id");mocks.closure.mockReset().mockResolvedValue(undefined);mocks.refund.mockReset().mockResolvedValue(undefined);mocks.search.mockReset().mockResolvedValue([refundOrder]);});
it("shows the earning rule and keeps operational forms out of the main page",async()=>{
  render(<CustomerPortalRewardRulesPage/>);
  expect(await screen.findByText("每 HK$25 餐費，賺取 1 分")).toBeInTheDocument();
  expect(screen.getAllByText(/16:00/).length).toBeGreaterThan(0);
  expect(screen.queryByLabelText("訂單 ID")).not.toBeInTheDocument();
  expect(screen.queryByText("入分假期")).not.toBeInTheDocument();
  expect(screen.queryByRole("heading",{name:"不能訂餐"})).not.toBeInTheDocument();
  expect(screen.getByText("HK$2,500 餐費")).toBeInTheDocument();
  expect(screen.getByText("+ 100 分")).toBeInTheDocument();
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
it("estimates points from the active threshold",async()=>{
  render(<CustomerPortalRewardRulesPage/>);await screen.findByText("每 HK$25 餐費，賺取 1 分");
  fireEvent.click(screen.getByRole("button",{name:"積分試算"}));
  const dialog=screen.getByRole("dialog");
  fireEvent.change(within(dialog).getByLabelText("餐費（HK$）"),{target:{value:"100"}});
  expect(within(dialog).getByRole("status")).toHaveTextContent("+ 4 分");
});
it("opens a read-only version and filters the history",async()=>{
  render(<CustomerPortalRewardRulesPage/>);await screen.findByText("每 HK$25 餐費，賺取 1 分");
  fireEvent.click(screen.getByRole("button",{name:"查看"}));
  expect(within(screen.getByRole("dialog")).getByText("版本詳情")).toBeInTheDocument();
  fireEvent.click(within(screen.getByRole("dialog")).getByRole("button",{name:"關閉"}));
  fireEvent.change(screen.getByLabelText("搜尋版本"),{target:{value:"沒有這筆"}});
  expect(await screen.findByText("沒有符合的版本。")).toBeInTheDocument();
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
it("keeps the rule readable without edit permissions",async()=>{
  mocks.edit=false;render(<CustomerPortalRewardRulesPage/>);
  expect(await screen.findByText("每 HK$25 餐費，賺取 1 分")).toBeInTheDocument();
  expect(screen.queryByRole("button",{name:"新增規則版本"})).not.toBeInTheDocument();
  expect(screen.queryByRole("button",{name:"記錄退款"})).not.toBeInTheDocument();
  expect(screen.getByRole("button",{name:"積分試算"})).toBeInTheDocument();
});
