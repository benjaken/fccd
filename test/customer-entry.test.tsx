import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { CustomerEntryPage } from "@/components/CustomerEntryPage";
const mocks = vi.hoisted(() => ({ send: vi.fn(), verify: vi.fn(), personal: vi.fn(), logout: vi.fn(), savePhone: vi.fn(), getSession: vi.fn(), detail: vi.fn(), rpc: vi.fn(), listener: null as null | ((event:string,session:unknown)=>void) }));
vi.mock("@/lib/supabase", () => ({ supabase: { auth: {
  getSession: mocks.getSession, signInWithOtp: mocks.send, verifyOtp: mocks.verify,
  onAuthStateChange: (listener:typeof mocks.listener) => {mocks.listener=listener;return {data:{subscription:{unsubscribe:vi.fn()}}};},
}, rpc:mocks.rpc } }));
vi.mock("@/lib/customer-otp-session", () => ({ fetchPersonalOtpSession:mocks.personal,logoutPersonalOtpSession:mocks.logout,savePersonalPhone:mocks.savePhone }));
vi.mock("@/lib/customer-personal", async importOriginal => ({ ...await importOriginal<typeof import("@/lib/customer-personal")>(), fetchPersonalSnapshot:async()=>({profile:{name:"",phone:"",email:"person@example.com",notify_email:true,notify_whatsapp:false},addresses:[],stores:[],evidence:[],order_states:{}}) }));
vi.mock("@/lib/customer-self-service", async importOriginal => ({ ...await importOriginal<typeof import("@/lib/customer-self-service")>(), fetchCustomerSelfServiceOrder:mocks.detail }));
const personal={token:"personal-session",expiresAt:"2099-01-01T00:00:00Z",maskedPhone:"",maskedEmail:"p***@example.com",orders:[{id:"order-1",orderNumber:"B-1247",orderDate:"2026-10-12T00:00:00Z",deliveryDate:null,grandTotal:100,currency:"HKD"}]};
function Probe(){const location=useLocation();return <output data-testid="location">{location.pathname}{location.search}</output>;}
function mount(path="/customer"){return render(<MemoryRouter initialEntries={[path]}><Probe/><Routes><Route path="/customer/*" element={<CustomerEntryPage/>}/></Routes></MemoryRouter>);}
function openMenu(){fireEvent.click(screen.getByRole("button",{name:"開啟選單"}));}
beforeEach(()=>{
  vi.clearAllMocks();mocks.listener=null;mocks.getSession.mockResolvedValue({data:{session:null}});
  mocks.send.mockResolvedValue({error:null});mocks.verify.mockResolvedValue({error:null,data:{session:{user:{id:"user"}}}});
  mocks.personal.mockResolvedValue(personal);mocks.rpc.mockImplementation(async(name:string)=>name==="customer_portal_identities"?{data:{personal:true,organization:true},error:null}:{data:null,error:{message:"customer_membership_required"}});
});
describe("shared OTP customer entry",()=>{
  it("opens a completed-order feedback link without asking for a sign-in code", async () => {
    mocks.rpc.mockResolvedValueOnce({ data: { order_number: "FCCD-9", delivery_at: "2026-10-14T04:00:00Z", comment: null, submitted: false }, error: null });
    mount(`/customer/feedback/${"ab".repeat(32)}`);
    expect(await screen.findByRole("heading", { name: "訂單意見" })).toBeInTheDocument();
    expect(screen.getByText(/FCCD-9/)).toBeInTheDocument();
    expect(screen.queryByLabelText("電郵")).not.toBeInTheDocument();
  });
  it.each(["/customer","/customer?mode=personal"])("uses email OTP without a password or phone at %s",async path=>{
    mount(path);expect(await screen.findByLabelText("電郵")).toBeInTheDocument();
    expect(screen.queryByRole("navigation",{name:"客戶登入方式"})).not.toBeInTheDocument();
    expect(screen.queryByLabelText("密碼")).not.toBeInTheDocument();expect(screen.queryByLabelText("電話號碼")).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("電郵"),{target:{value:" Person@Example.com "}});
    fireEvent.click(screen.getByRole("button",{name:"發送驗證碼"}));
    await screen.findByLabelText("8 位驗證碼");expect(mocks.send).toHaveBeenCalledWith({email:"person@example.com",options:{shouldCreateUser:true}});
    fireEvent.change(screen.getByLabelText("8 位驗證碼"),{target:{value:"1234567"}});expect(screen.getByRole("button",{name:"驗證並登入"})).toBeDisabled();
    fireEvent.change(screen.getByLabelText("8 位驗證碼"),{target:{value:"12345678"}});fireEvent.click(screen.getByRole("button",{name:"驗證並登入"}));
    await waitFor(()=>expect(mocks.verify).toHaveBeenCalledWith({email:"person@example.com",token:"12345678",type:"email"}));
  });
  it("keeps code errors in the form, supports resend, and binds verification to the sent email",async()=>{
    mocks.verify.mockResolvedValue({data:{session:null},error:{message:"otp_expired"}});mount("/customer?mode=personal");
    fireEvent.change(await screen.findByLabelText("電郵"),{target:{value:"person@example.com"}});fireEvent.click(screen.getByRole("button",{name:"發送驗證碼"}));
    fireEvent.change(await screen.findByLabelText("8 位驗證碼"),{target:{value:"12345678"}});fireEvent.click(screen.getByRole("button",{name:"驗證並登入"}));
    expect(await screen.findByRole("alert")).toHaveTextContent("驗證碼無效或已過期");
    fireEvent.click(screen.getByRole("button",{name:"重新發送"}));await waitFor(()=>expect(mocks.send).toHaveBeenCalledTimes(2));
    expect(screen.getByLabelText("8 位驗證碼")).toHaveValue("");
    fireEvent.click(screen.getByRole("button",{name:"更換電郵"}));expect(screen.queryByLabelText("8 位驗證碼")).not.toBeInTheDocument();
  });
  it("restores personal order URLs through the verified identity session",async()=>{
    mocks.getSession.mockResolvedValue({data:{session:{user:{id:"user"}}}});mocks.detail.mockImplementation(()=>new Promise(()=>{}));
    mount("/customer/personal/order-1");await waitFor(()=>expect(mocks.detail).toHaveBeenCalledWith("personal-session","order-1"));
    expect(mocks.personal).toHaveBeenCalled();expect(screen.getByTestId("location")).toHaveTextContent("/customer/personal/order-1");
  });
  it("opens the new personal workspace without asking to match a phone again",async()=>{
    mocks.getSession.mockResolvedValue({data:{session:{user:{id:"user"}}}});
    mocks.personal.mockResolvedValue({...personal,orders:[],needsPhone:true});
    mount("/customer?mode=personal");
    expect(await screen.findByRole("heading",{name:"你好！"})).toBeInTheDocument();
    expect(screen.queryByLabelText("訂單電話")).not.toBeInTheDocument();
    expect(screen.queryByRole("button",{name:"配對訂單"})).not.toBeInTheDocument();
    expect(mocks.savePhone).not.toHaveBeenCalled();
  });
  it("allows new personal users to sign in without an existing order",async()=>{
    mocks.getSession.mockResolvedValue({data:{session:{user:{id:"user"}}}});mocks.personal.mockResolvedValue({...personal,orders:[]});
    mount("/customer/personal/orders");expect(await screen.findByRole("heading",{name:"訂單紀錄"})).toBeInTheDocument();
    expect(screen.getByText("目前沒有已綁定的訂單。")).toBeInTheDocument();expect(mocks.rpc).toHaveBeenCalledWith("customer_portal_identities");
  });
  it("hides switching for personal-only accounts even when the organization URL is requested",async()=>{
    mocks.getSession.mockResolvedValue({data:{session:{user:{id:"user"}}}});
    mocks.rpc.mockResolvedValue({data:{personal:true,organization:false},error:null});
    mount("/customer");await screen.findByRole("heading",{name:"你好！"});
    expect(screen.queryByRole("navigation",{name:"客戶登入方式"})).not.toBeInTheDocument();
    expect(screen.getByRole("img",{name:"Food Channels Catering"})).toBeInTheDocument();
  });
  it("uses the common header and error card when personal orders fail to load",async()=>{
    mocks.getSession.mockResolvedValue({data:{session:{user:{id:"user"}}}});
    mocks.rpc.mockResolvedValue({data:{personal:true,organization:false},error:null});
    mocks.personal.mockRejectedValueOnce(new Error("unavailable"));
    mount("/customer?mode=personal");await screen.findByRole("heading",{name:"未能載入客戶資料"});
    expect(screen.getByRole("img",{name:"Food Channels Catering"})).toBeInTheDocument();
    openMenu();
    expect(screen.getAllByRole("button",{name:"登出"}).length).toBeGreaterThan(0);
    fireEvent.click(screen.getByRole("button",{name:"重試"}));await screen.findByRole("heading",{name:"你好！"});
  });
  it("keeps invitation links on the organization OTP flow",async()=>{
    mount("/customer?mode=personal&invite=invitation-token");await screen.findByLabelText("電郵");
    expect(screen.queryByRole("navigation",{name:"客戶登入方式"})).not.toBeInTheDocument();
    expect(screen.getByRole("button",{name:"發送驗證碼"})).toBeInTheDocument();
  });
  it("lets an authenticated user switch contexts without reusing organization data",async()=>{
    mocks.rpc.mockImplementation(async(name:string)=>name==="customer_portal_identities"?{data:{personal:true,organization:true},error:null}:{data:null,error:{message:"network_failure"}});
    mocks.getSession.mockResolvedValue({data:{session:{user:{id:"user"}}}});mount();
    await waitFor(()=>expect(screen.getByRole("alert")).toHaveTextContent("暫時無法載入機構資料"));
    openMenu();
    expect(screen.getAllByRole("navigation",{name:"客戶登入方式"})).toHaveLength(1);
    expect(screen.getByRole("img",{name:"Food Channels Catering"})).toHaveAttribute("src","/assets/fc-catering-logo.svg");
    fireEvent.click(screen.getByRole("link",{name:"個人客戶"}));await screen.findByRole("heading",{name:"你好！"});
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    openMenu();
    expect(screen.queryByRole("link",{name:"團隊管理"})).not.toBeInTheDocument();
  });
  it("opens a company application for a verified user who has no organization", async () => {
    mocks.getSession.mockResolvedValue({ data: { session: { user: { id: "user" } } } });
    mocks.rpc.mockImplementation(async (name: string) => name === "customer_portal_identities"
      ? { data: { personal: true, organization: false }, error: null }
      : name === "customer_org_application_current"
        ? { data: null, error: null }
        : { data: null, error: { message: "customer_membership_required" } });
    mount("/customer/apply");
    expect(await screen.findByRole("heading", { name: "申請公司帳戶" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "訂單列表" })).not.toBeInTheDocument();
  });
});
