import { fireEvent,render,screen,waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach,expect,it,vi } from "vitest";
import { CustomerPortalRewardCatalogPage } from "@/components/settings/CustomerPortalRewardCatalogPage";
import "@/lib/customer-portal-i18n";
const mocks=vi.hoisted(()=>({page:vi.fn()}));
vi.mock("@/auth/use-page-access",()=>({useCurrentPageAccess:()=>({canAccess:()=>false})}));
vi.mock("@/lib/customer-reward-catalog",()=>({listRewardCatalogOps:async()=>[],fetchRewardRedemptionPage:mocks.page,fulfillRewardRedemption:vi.fn(),upsertRewardCatalogItem:vi.fn()}));
vi.mock("@/lib/supabase",()=>({supabase:{from:()=>({select:()=>({eq:()=>({order:async()=>({data:[]})})})})}}));
beforeEach(()=>{mocks.page.mockReset();});
it("loads older redemptions through server pagination",async()=>{
  mocks.page.mockImplementation(async(page:number)=>({page,total:101,rows:[{id:`r${page}`,account:`Account ${page}`,name:"Gift",points:1,status:"pending"}]}));
  render(<MemoryRouter><CustomerPortalRewardCatalogPage/></MemoryRouter>);
  expect(await screen.findByText("Account 1")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button",{name:"下一頁"}));
  expect(await screen.findByText("Account 2")).toBeInTheDocument();
  expect(mocks.page).toHaveBeenCalledWith(2);
  expect(screen.queryByText("Account 1")).not.toBeInTheDocument();
});
it("retains the table on failure and lets the user retry",async()=>{
  mocks.page.mockRejectedValueOnce(new Error("unavailable")).mockResolvedValue({rows:[],page:1,total:0});
  render(<MemoryRouter><CustomerPortalRewardCatalogPage/></MemoryRouter>);
  await screen.findByRole("alert"); expect(screen.getByRole("table")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button",{name:"重試"}));
  await waitFor(()=>expect(screen.queryByRole("alert")).not.toBeInTheDocument());
  expect(mocks.page).toHaveBeenCalledTimes(2);
});
