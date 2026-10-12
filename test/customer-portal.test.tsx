import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Routes, Route, useLocation, useNavigate } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { CustomerPortalPage } from "@/components/CustomerPortalPage";
import { portalCart, type PortalMenu, type PortalSnapshot } from "@/lib/customer-portal";

const mocks=vi.hoisted(()=>({
  submit:vi.fn(), getSession:vi.fn(), signin:vi.fn(),
  saveAddress:vi.fn(async()=>"new-address"),
  updateAddress:vi.fn(async()=>undefined),
  archiveAddress:vi.fn(async()=>undefined),
  setRole:vi.fn(async()=>undefined),
  revokeInvite:vi.fn(async()=>undefined),
  setMenuScopes:vi.fn(async()=>undefined),
}));
vi.mock("@/lib/supabase",()=>({supabase:{auth:{getSession:mocks.getSession,
  onAuthStateChange:()=>({data:{subscription:{unsubscribe:vi.fn()}}}),signInWithOtp:mocks.signin},rpc:mocks.submit}}));
vi.mock("@/lib/customer-portal", async importOriginal => {
  const actual = await importOriginal<typeof import("@/lib/customer-portal")>();
  return {
    ...actual,
    savePortalAddress: mocks.saveAddress,
    updatePortalAddress: mocks.updateAddress,
    archivePortalAddress: mocks.archiveAddress,
    setPortalMemberRole: mocks.setRole,
    revokePortalInvitation: mocks.revokeInvite,
    setPortalMemberMenuScopes: mocks.setMenuScopes,
  };
});
const menu:PortalMenu={id:"m",name:"指定餐單",brand:"HK Party Food",channel_id:"brand",delivery_date:"2026-10-14",delivery_time:"12:00",cutoff_at:"2026-10-13T07:00:00Z",shipping_fee:50,
  items:[{id:"i",product_id:"p",name:"雞扒餐",unit_price:48,available_quantity:20}]};
const snapshot:PortalSnapshot={organization:{id:"org",name:"示例機構"},role:"member",balance:20000,menus:[menu],addresses:[{id:"a",label:"辦公室",recipient:"陳先生",phone:"91234567",address:"九龍辦公室"}],members:[],invitations:[],templates:[],orders:[],ledger:[]};
function RouterProbe(){const location=useLocation();const navigate=useNavigate();return <><output data-testid="pathname">{location.pathname}</output><button onClick={()=>navigate(-1)}>測試返回</button></>;}
function mount(data=snapshot,path="/customer"){return render(<MemoryRouter initialEntries={[path]}><RouterProbe/><Routes><Route path="/customer/*" element={<CustomerPortalPage load={async()=>data}/>}/></Routes></MemoryRouter>);}
function openMenu(){fireEvent.click(screen.getByRole("button",{name:"開啟選單"}));}
beforeEach(()=>{
  mocks.getSession.mockResolvedValue({data:{session:{user:{id:"user"}}}});
  mocks.submit.mockReset();
  mocks.saveAddress.mockClear();
  mocks.updateAddress.mockClear();
  mocks.archiveAddress.mockClear();
  mocks.setRole.mockClear();
  mocks.revokeInvite.mockClear();
  mocks.setMenuScopes.mockClear();
});
describe("organization portal",()=>{
  it("shows the shared OTP login and sends an institution email code",async()=>{
    mocks.getSession.mockResolvedValue({data:{session:null}});
    mocks.signin.mockResolvedValue({error:null});
    mount();
    expect(await screen.findByRole("region",{name:"歡迎使用 FCCD"})).toBeInTheDocument();
    expect(screen.queryByLabelText("密碼")).not.toBeInTheDocument();
    expect(screen.queryByRole("button",{name:"重設密碼"})).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("電郵"),{target:{value:"member@example.com"}});
    fireEvent.click(screen.getByRole("button",{name:"發送驗證碼"}));
    await waitFor(()=>expect(mocks.signin).toHaveBeenCalledWith({email:"member@example.com",options:{shouldCreateUser:true}}));
  });
  it("shows assigned menus, shared redemption value and no pricing tier",async()=>{
    mount();await screen.findByText("幾步就訂好。");expect(screen.getByText("可抵 HK$20.00 餐費")).toBeInTheDocument();
    expect(screen.queryByText(/ABC|tariff|Normal/)).not.toBeInTheDocument();expect(screen.queryByText("團隊管理")).not.toBeInTheDocument();
  });
  it("submits only product IDs, quantities and points using an idempotency key",async()=>{
    mocks.submit.mockResolvedValue({data:"order",error:null});mount();await screen.findByText("幾步就訂好。");
    fireEvent.click(screen.getByText("選擇餐單"));fireEvent.change(screen.getByLabelText("雞扒餐 數量"),{target:{value:"2"}});
    fireEvent.change(screen.getByLabelText("使用積分"),{target:{value:"10000"}});fireEvent.click(screen.getByText("確認訂購"));
    await waitFor(()=>expect(mocks.submit).toHaveBeenCalledWith("customer_portal_submit_order",expect.objectContaining({p_items:[{product_id:"p",quantity:2}],p_points:10000,p_address_id:"a",p_request_id:expect.any(String)})));
    await screen.findByText("訂單已建立。請按訂單應付金額完成付款。");
  });
  it("requires a delivery address before checkout",async()=>{
    mount({...snapshot,addresses:[]});await screen.findByText("幾步就訂好。");fireEvent.click(screen.getByText("選擇餐單"));
    fireEvent.change(screen.getByLabelText("雞扒餐 數量"),{target:{value:"1"}});expect(screen.getByText("確認訂購")).toBeDisabled();
  });
  it("reports access failure instead of exposing institution data",async()=>{
    render(<MemoryRouter><CustomerPortalPage load={async()=>{throw {message:"customer_membership_required",code:"42501"};}}/></MemoryRouter>);
    await waitFor(()=>expect(screen.getByRole("alert")).toHaveTextContent("此帳戶尚未取得機構訂購權限"));expect(screen.queryByText("示例機構")).not.toBeInTheDocument();
  });
  it("reports loading failures separately and recovers after retry",async()=>{
    const load=vi.fn().mockRejectedValueOnce(new Error("network failure")).mockResolvedValue(snapshot);
    render(<MemoryRouter><CustomerPortalPage load={load}/></MemoryRouter>);
    await waitFor(()=>expect(screen.getByRole("alert")).toHaveTextContent("暫時無法載入機構資料"));
    expect(screen.queryByText(/尚未取得機構訂購權限/)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button",{name:"重試"}));
    await screen.findByText("幾步就訂好。");expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
  it("shows a loading message while organization details are pending",async()=>{
    render(<MemoryRouter><CustomerPortalPage load={()=>new Promise(()=>{})}/></MemoryRouter>);
    await waitFor(()=>expect(screen.getByRole("button",{name:"開啟選單"})).toBeInTheDocument());
    openMenu();
    expect(screen.getByRole("button",{name:"登出"})).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("正在取得你的機構資料");
    expect(screen.queryByText(/尚未取得機構訂購權限/)).not.toBeInTheDocument();
  });
  it("rejects fractional quantities, overstock and invalid redemptions",()=>{
    expect(portalCart(menu,{p:2},10000,20000)).toMatchObject({valid:true,foodCents:9600,payableCents:13600});
    for(const points of [15,-10,20010,100000])expect(portalCart(menu,{p:1},points,20000).valid).toBe(false);
    for(const quantity of [0,1.5,21])expect(portalCart(menu,{p:quantity},0,0).valid).toBe(false);
  });
  it("navigates between separate URLs and supports browser back",async()=>{
    mount();await screen.findByText("幾步就訂好。");
    openMenu();
    fireEvent.click(screen.getByRole("link",{name:"訂單紀錄"}));await screen.findByRole("heading",{name:"訂單紀錄"});
    expect(screen.getByTestId("pathname")).toHaveTextContent("/customer/orders");
    openMenu();
    fireEvent.click(screen.getByRole("link",{name:"獎勵積分"}));await screen.findByRole("heading",{name:"獎勵積分"});
    expect(screen.getByTestId("pathname")).toHaveTextContent("/customer/points");
    fireEvent.click(screen.getByText("測試返回"));await screen.findByRole("heading",{name:"訂單紀錄"});
    expect(screen.getByTestId("pathname")).toHaveTextContent("/customer/orders");
  });
  it.each([['/customer/orders','訂單紀錄'],['/customer/points','獎勵積分'],['/customer/addresses','送貨地址'],['/customer/profile','個人資料']])("opens %s directly",async(path,heading)=>{
    mount(snapshot,path);await screen.findByRole("heading",{name:heading});expect(screen.queryByText("幾步就訂好。")).not.toBeInTheDocument();
  });
  it("opens a menu detail URL directly and preserves its URL on selection",async()=>{
    mount(snapshot,"/customer/menus/m");await screen.findByRole("heading",{name:"指定餐單"});
    expect(screen.getByLabelText("雞扒餐 數量")).toBeInTheDocument();expect(screen.getByTestId("pathname")).toHaveTextContent("/customer/menus/m");
  });
  it("redirects a member away from an admin-only team URL",async()=>{
    mount(snapshot,"/customer/team");await screen.findByText("幾步就訂好。");expect(screen.getByTestId("pathname")).toHaveTextContent("/customer");
  });
  it("redirects unavailable menu IDs to the menu list",async()=>{
    mount(snapshot,"/customer/menus/unavailable");await screen.findByRole("heading",{name:"最新餐單"});
    expect(screen.getByTestId("pathname").textContent).toBe("/customer/menus");
  });
  it("opens an order detail URL and links back to the list",async()=>{
    const data={...snapshot,orders:[{id:"order-1",number:"FCCD-1",delivery_at:"2026-10-14T04:00:00Z",status:"已確認",total:100,outstanding:100,brand:"HK Party Food",points_used:0,cancel_status:null,lines:[{product_id:"p",name:"雞扒餐",quantity:2,unit_price:50}]}]};
    mount(data,"/customer/orders/order-1");await screen.findByRole("heading",{name:"FCCD-1"});
    expect(screen.getByText("雞扒餐 × 2")).toBeInTheDocument();fireEvent.click(screen.getByRole("link",{name:"返回訂單紀錄"}));
    await screen.findByRole("heading",{name:"訂單紀錄"});expect(screen.getByTestId("pathname").textContent).toBe("/customer/orders");
  });
  it("edits and archives delivery addresses from the addresses page",async()=>{
    mount(snapshot,"/customer/addresses");
    await screen.findByRole("heading",{name:"送貨地址"});
    fireEvent.click(screen.getByRole("button",{name:"編輯地址"}));
    expect(screen.getByRole("heading",{name:"編輯地址"})).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("地址名稱"),{target:{value:"倉庫"}});
    fireEvent.click(screen.getByRole("button",{name:"儲存"}));
    await waitFor(()=>expect(mocks.updateAddress).toHaveBeenCalledWith("a",expect.objectContaining({label:"倉庫",recipient:"陳先生",phone:"91234567",address:"九龍辦公室"})));
    fireEvent.click(screen.getByRole("button",{name:"刪除地址"}));
    await waitFor(()=>expect(mocks.archiveAddress).toHaveBeenCalledWith("a"));
  });
  it("lets admins transfer roles and revoke pending invitations",async()=>{
    const adminSnapshot:PortalSnapshot={
      ...snapshot,
      role:"admin",
      members:[
        {user_id:"admin",email:"admin@example.com",role:"admin",is_active:true,menu_ids:[]},
        {user_id:"member",email:"member@example.com",role:"member",is_active:true,menu_ids:[]},
      ],
      org_menus:[{id:"m",name:"指定餐單",brand:"HK Party Food",delivery_date:"2026-10-14",is_active:true}],
      invitations:[{id:"invite-1",email:"new@example.com",expires_at:"2099-01-01T00:00:00Z",created_at:"2026-10-12T00:00:00Z"}],
    };
    mount(adminSnapshot,"/customer/team");
    await screen.findByRole("heading",{name:"團隊管理"});
    expect(screen.getByText("new@example.com")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button",{name:"設為管理員"}));
    await waitFor(()=>expect(mocks.setRole).toHaveBeenCalledWith("member","admin"));
    fireEvent.click(screen.getByRole("button",{name:"取消邀請"}));
    await waitFor(()=>expect(mocks.revokeInvite).toHaveBeenCalledWith("invite-1"));
  });
  it("lets admins assign member menu scopes",async()=>{
    const adminSnapshot:PortalSnapshot={
      ...snapshot,
      role:"admin",
      members:[{user_id:"member",email:"member@example.com",role:"member",is_active:true,menu_ids:[]}],
      org_menus:[{id:"m",name:"指定餐單",brand:"HK Party Food",delivery_date:"2026-10-14",is_active:true}],
    };
    mount(adminSnapshot,"/customer/team");
    await screen.findByRole("heading",{name:"團隊管理"});
    fireEvent.click(screen.getByRole("checkbox"));
    fireEvent.click(screen.getByRole("button",{name:"儲存餐牌權限"}));
    await waitFor(()=>expect(mocks.setMenuScopes).toHaveBeenCalledWith("member",["m"]));
  });
});
