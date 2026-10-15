import { fireEvent,render,screen,waitFor } from "@testing-library/react";
import { beforeEach,describe,expect,it,vi } from "vitest";
import { CustomerPaymentReviewPage } from "@/components/CustomerPaymentReviewPage";
const mocks=vi.hoisted(()=>({rpc:vi.fn()}));
vi.mock("@/lib/supabase",()=>({supabase:{rpc:mocks.rpc}}));
beforeEach(()=>mocks.rpc.mockReset());
describe("customer payment review",()=>{
  it("does not expose the queue when finance authorization fails",async()=>{
    mocks.rpc.mockResolvedValue({error:{message:"finance_access_required"}});
    render(<CustomerPaymentReviewPage/>);await screen.findByRole("alert");expect(screen.queryByText("核實付款")).not.toBeInTheDocument();
  });
  it("requires a payment method for approval and a reason for rejection",async()=>{
    mocks.rpc.mockResolvedValue({data:{methods:[{id:"bank",name:"Bank"}],evidence:[{id:"e",order_number:"FCO1",organization:"Org",amount:100,created_at:"2026-10-12",object_path:"receipt"}]},error:null});
    render(<CustomerPaymentReviewPage/>);await screen.findByText("FCO1 · Org");
    expect(screen.getByText("核實付款")).toBeDisabled();expect(screen.getByText("要求重新提交")).toBeDisabled();
    fireEvent.change(screen.getByLabelText("付款方式"),{target:{value:"bank"}});fireEvent.click(screen.getByText("核實付款"));
    await waitFor(()=>expect(mocks.rpc).toHaveBeenCalledWith("customer_portal_finance_review",{p_id:"e",p_accept:true,p_reason:"",p_method_id:"bank"}));
  });
});
