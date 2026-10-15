import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, Routes, Route, useLocation, useNavigate } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { CustomerPortalPage } from "@/components/CustomerPortalPage";
import { portalCart, type PortalMenu, type PortalSnapshot } from "@/lib/customer-portal";

const mocks=vi.hoisted(()=>({
  submit:vi.fn(), getSession:vi.fn(), signin:vi.fn(), header:vi.fn(),
  saveAddress:vi.fn(async()=>"new-address"),
  updateAddress:vi.fn(async()=>undefined),
  archiveAddress:vi.fn(async()=>undefined),
  saveDeliveryPoint:vi.fn(async()=>"new-point"),
  archiveDeliveryPoint:vi.fn(async()=>undefined),
  setRole:vi.fn(async()=>undefined),
  revokeInvite:vi.fn(async()=>undefined),
  setMenuScopes:vi.fn(async()=>undefined),
  setMemberProfile:vi.fn(async()=>undefined),
}));
vi.mock("@/lib/customer-reward-catalog", () => ({ listRewardCatalog: async () => [], redeemOrganizationCatalog: async () => ({ id: "reward", balance: 0 }), listPortalRewardRedemptions: async () => [], listPersonalRewardRedemptions: async () => [] }));
vi.mock("@/lib/customer-portal-calendar-ops", () => ({ listPortalOrderBlackouts: async () => [] }));
vi.mock("@/lib/supabase",()=>({supabase:{auth:{getSession:mocks.getSession,
  onAuthStateChange:()=>({data:{subscription:{unsubscribe:vi.fn()}}}),signInWithOtp:mocks.signin},rpc:(...args: unknown[])=>{
    const request=Promise.resolve(mocks.submit(...args));
    return Object.assign(request,{setHeader:(...header:unknown[])=>{mocks.header(...header);return request;}});
  }}}));
vi.mock("@/lib/customer-portal", async importOriginal => {
  const actual = await importOriginal<typeof import("@/lib/customer-portal")>();
  return {
    ...actual,
    savePortalAddress: mocks.saveAddress,
    updatePortalAddress: mocks.updateAddress,
    archivePortalAddress: mocks.archiveAddress,
    savePortalDeliveryPoint: mocks.saveDeliveryPoint,
    archivePortalDeliveryPoint: mocks.archiveDeliveryPoint,
    setPortalMemberRole: mocks.setRole,
    revokePortalInvitation: mocks.revokeInvite,
    setPortalMemberMenuScopes: mocks.setMenuScopes,
    setPortalMemberProfile: mocks.setMemberProfile,
  };
});
const brandSites=vi.hoisted(()=>({ fetch:vi.fn() }));
vi.mock("@/lib/customer-personal", async original => ({
  ...await original<typeof import("@/lib/customer-personal")>(),
  fetchPersonalSnapshot: brandSites.fetch,
}));
const menu:PortalMenu={id:"m",name:"指定餐單",brand:"HK Party Food",channel_id:"brand",delivery_date:"2026-10-14",delivery_time:"12:00",cutoff_at:"2026-10-13T07:00:00Z",shipping_fee:50,
  items:[{id:"i",product_id:"p",name:"雞扒餐",unit_price:48,available_quantity:20}]};
const snapshot:PortalSnapshot={organization:{id:"org",name:"示例機構"},role:"member",balance:20000,menus:[menu],addresses:[{id:"a",label:"辦公室",recipient:"陳先生",phone:"91234567",address:"九龍辦公室",is_default:true,delivery_points:[{id:"p1",name:"3樓接待處"}]}],members:[],invitations:[],templates:[],orders:[],ledger:[]};
function RouterProbe(){const location=useLocation();const navigate=useNavigate();return <><output data-testid="pathname">{location.pathname}</output><button onClick={()=>navigate(-1)}>測試返回</button></>;}
function mount(data=snapshot,path="/customer"){return render(<MemoryRouter initialEntries={[path]}><RouterProbe/><Routes><Route path="/customer/*" element={<CustomerPortalPage load={async()=>data}/>}/></Routes></MemoryRouter>);}
function openMenu(){fireEvent.click(screen.getByRole("button",{name:"開啟選單"}));}
beforeEach(()=>{
  mocks.getSession.mockResolvedValue({data:{session:{user:{id:"user"}}}});
  mocks.submit.mockReset();
  mocks.header.mockClear();
  mocks.saveAddress.mockClear();
  mocks.updateAddress.mockClear();
  mocks.archiveAddress.mockClear();
  mocks.saveDeliveryPoint.mockClear();
  mocks.archiveDeliveryPoint.mockClear();
  mocks.setRole.mockClear();
  mocks.revokeInvite.mockClear();
  mocks.setMenuScopes.mockClear();
  mocks.setMemberProfile.mockClear();
  brandSites.fetch.mockReset().mockResolvedValue({ stores:[{ id:"s1", name:"HK Party Food", domain:"hkpartyfood.myshopify.com" }] });
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
  it("shows assigned menus and no pricing tier on the home",async()=>{
    mount();await screen.findByText("幾步就訂好。");
    expect(screen.queryByText(/ABC|tariff|Normal/)).not.toBeInTheDocument();expect(screen.queryByText("團隊管理")).not.toBeInTheDocument();
  });
  it("lists brand websites on the organization catering site",async()=>{
    mount(snapshot,"/customer/menus");
    await screen.findByRole("heading",{name:"最新餐單"});
    const link=await screen.findByRole("link",{name:/HK Party Food/});
    expect(link).toHaveAttribute("href","https://hkpartyfood.myshopify.com");
    expect(brandSites.fetch).toHaveBeenCalled();
  });
  it("shows the open cycle team summary to an admin",async()=>{
    mocks.submit.mockResolvedValue({ data: { cycle_id:"cy", cycle_name:"11月第2週", cutoff_at:"2099-01-01T00:00:00Z", members:5, ordered:3, amount:1200, me:{ordered:true,amount:300} }, error:null });
    mount({ ...snapshot, role:"admin" });await screen.findByText("幾步就訂好。");
    expect(await screen.findByText("本期訂飯")).toBeInTheDocument();
    const stats=document.querySelector(".personal-vip-stats");
    expect(stats).toHaveTextContent("已落單人數3");
    expect(stats).toHaveTextContent("未落單人數2");
    expect(stats).toHaveTextContent("本期累計金額");
    expect(screen.getByText(/截單倒數/)).toBeInTheDocument();
  });
  it("shows a member their own cycle order status only",async()=>{
    mocks.submit.mockResolvedValue({ data: { cycle_id:"cy", cycle_name:"11月第2週", cutoff_at:"2099-01-01T00:00:00Z", members:null, ordered:null, amount:null, me:{ordered:false,amount:0} }, error:null });
    mount();await screen.findByText("幾步就訂好。");
    expect(await screen.findByText("本期訂飯")).toBeInTheDocument();
    const stats=document.querySelector(".personal-vip-stats");
    expect(stats).toHaveTextContent("我的訂單狀態");
    expect(stats).toHaveTextContent("未落單");
    expect(stats).not.toHaveTextContent("已落單人數");
    expect(stats).not.toHaveTextContent("本期累計金額");
    expect(screen.getByText(/截單倒數/)).toBeInTheDocument();
  });
  it("ticks the cycle countdown down to the second",async()=>{
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-10-15T07:00:00Z"));
    mocks.submit.mockResolvedValue({ data: { cycle_id:"cy", cycle_name:"本期", cutoff_at:"2026-10-15T07:05:30Z", members:2, ordered:1, amount:10, me:{ordered:true,amount:5} }, error:null });
    mount({ ...snapshot, role:"admin" });await screen.findByText("幾步就訂好。");
    expect(await screen.findByText(/5分30秒/)).toBeInTheDocument();
    vi.useRealTimers();
  });
  it("hides order amounts from members when the company disables prices",async()=>{
    mount({ ...snapshot, show_prices: false, orders: [{ id: "order-1", number: "FCCD-1", delivery_at: "2026-10-14T04:00:00Z", status: "已確認", total: 100, outstanding: 100, brand: "HK Party Food", points_used: 0, cancel_status: null, lines: [{ product_id: "p", name: "雞扒餐", quantity: 2, unit_price: 50 }] }] }, "/customer/orders/order-1");
    await screen.findByRole("heading", { name: "FCCD-1" });
    expect(screen.queryByText(/HK\$100\.00/)).not.toBeInTheDocument();
    expect(screen.getByText(/雞扒餐 × 2/)).toBeInTheDocument();
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
  it("shows a home page skeleton while organization details are pending",async()=>{
    const {container}=render(<MemoryRouter><CustomerPortalPage load={()=>new Promise(()=>{})}/></MemoryRouter>);
    await waitFor(()=>expect(screen.getByRole("button",{name:"開啟選單"})).toBeInTheDocument());
    openMenu();
    expect(screen.getByRole("button",{name:"登出"})).toBeInTheDocument();
    const skeleton=container.querySelector('[data-skeleton="home"]');
    expect(skeleton).toHaveAttribute("role","status");
    expect(skeleton).toHaveAttribute("aria-busy","true");
    expect(skeleton?.querySelectorAll("button,input,select,textarea,a")).toHaveLength(0);
    expect(screen.queryByText(/尚未取得機構訂購權限/)).not.toBeInTheDocument();
  });
  it.each([
    ["/customer","home"],["/customer/menus","menus"],["/customer/vip","vip"],
    ["/customer/orders","orders"],["/customer/orders/order-1","order-detail"],["/customer/receipts","receipts"],
    ["/customer/points","points"],["/customer/addresses","addresses"],["/customer/team","team"],
    ["/customer/profile","profile"],["/customer/company","company"],
  ])("shows the matching page skeleton while entering %s",async(path,variant)=>{
    const {container}=render(<MemoryRouter initialEntries={[path]}><Routes><Route path="/customer/*" element={<CustomerPortalPage load={()=>new Promise(()=>{})}/>}/></Routes></MemoryRouter>);
    await waitFor(()=>expect(container.querySelector(`[data-skeleton="${variant}"]`)).toBeInTheDocument());
    const skeleton=container.querySelector(`[data-skeleton="${variant}"]`);
    expect(skeleton).toHaveAttribute("role","status");
    expect(skeleton).toHaveAttribute("aria-busy","true");
    expect(skeleton?.querySelectorAll("button,input,select,textarea,a")).toHaveLength(0);
  });
  it("rejects fractional quantities and overstock without reducing the amount due",()=>{
    expect(portalCart(menu,{p:2})).toMatchObject({valid:true,foodCents:9600,payableCents:14600});
    for(const quantity of [0,1.5,21])expect(portalCart(menu,{p:quantity}).valid).toBe(false);
  });
  it("navigates between separate URLs and supports browser back",async()=>{
    mount();await screen.findByText("幾步就訂好。");
    openMenu();
    fireEvent.click(screen.getAllByRole("link",{name:"訂單紀錄"})[0]);await screen.findByRole("heading",{name:"訂單紀錄"});
    expect(screen.getByTestId("pathname")).toHaveTextContent("/customer/orders");
    openMenu();
    fireEvent.click(screen.getByRole("link",{name:"積分換禮品"}));await screen.findByRole("heading",{name:"獎勵積分"});
    expect(screen.getByTestId("pathname")).toHaveTextContent("/customer/points");
    fireEvent.click(screen.getByText("測試返回"));await screen.findByRole("heading",{name:"訂單紀錄"});
    expect(screen.getByTestId("pathname")).toHaveTextContent("/customer/orders");
  });
  it.each([['/customer/orders','訂單紀錄'],['/customer/points','獎勵積分'],['/customer/addresses','送貨地址'],['/customer/profile','個人資料']])("opens %s directly",async(path,heading)=>{
    mount(snapshot,path);await screen.findByRole("heading",{name:heading});expect(screen.queryByText("幾步就訂好。")).not.toBeInTheDocument();
  });
  it("redirects a member away from an admin-only team URL",async()=>{
    mount(snapshot,"/customer/team");await screen.findByText("幾步就訂好。");expect(screen.getByTestId("pathname")).toHaveTextContent("/customer");
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
    expect(screen.getByRole("heading",{name:"編輯送貨地址"})).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("送貨點名稱"),{target:{value:"5樓茶水間"}});
    fireEvent.click(screen.getByRole("button",{name:"儲存地址"}));
    await waitFor(()=>expect(mocks.updateAddress).toHaveBeenCalledWith("a",expect.objectContaining({label:"5樓茶水間",recipient:"陳先生",phone:"91234567",address:"九龍辦公室",is_default:true}), "org"));
    await waitFor(()=>expect(mocks.saveDeliveryPoint).toHaveBeenCalledWith({id:"p1",addressId:"a",name:"5樓茶水間"},"org"));
    fireEvent.click(screen.getByRole("button",{name:"更多地址操作"}));
    fireEvent.click(screen.getByRole("menuitem",{name:"刪除地址"}));
    await waitFor(()=>expect(mocks.archiveAddress).toHaveBeenCalledWith("a", "org"));
  });
  it("creates an address with several editable delivery points",async()=>{
    mount(snapshot,"/customer/addresses");
    await screen.findByRole("heading",{name:"送貨地址"});
    fireEvent.click(screen.getByRole("button",{name:"新增地址"}));
    fireEvent.change(screen.getByLabelText("收件人"),{target:{value:"李小姐"}});
    fireEvent.change(screen.getByLabelText("電話"),{target:{value:"98765432"}});
    fireEvent.change(screen.getByLabelText("送貨點名稱"),{target:{value:"接待處"}});
    fireEvent.click(screen.getByRole("button",{name:"新增送貨點"}));
    fireEvent.change(screen.getByLabelText("送貨點名稱 2"),{target:{value:"茶水間"}});
    fireEvent.change(screen.getByPlaceholderText("輸入完整送貨地址"),{target:{value:"觀塘開源道 72 號"}});
    fireEvent.click(screen.getByRole("button",{name:"儲存地址"}));
    await waitFor(()=>expect(mocks.saveAddress).toHaveBeenCalledWith(expect.objectContaining({label:"接待處",recipient:"李小姐",phone:"98765432",address:"觀塘開源道 72 號"}), "org"));
    await waitFor(()=>expect(mocks.saveDeliveryPoint).toHaveBeenCalledWith({addressId:"new-address",name:"茶水間"},"org"));
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
    await waitFor(()=>expect(mocks.setRole).toHaveBeenCalledWith("member","admin", "org"));
    fireEvent.click(screen.getByRole("button",{name:"取消邀請"}));
    await waitFor(()=>expect(mocks.revokeInvite).toHaveBeenCalledWith("invite-1", "org"));
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
    fireEvent.click(screen.getByRole("checkbox", { name: "HK Party Food · 指定餐單 · 2026-10-14" }));
    fireEvent.click(screen.getByRole("button",{name:"儲存餐牌權限"}));
    await waitFor(()=>expect(mocks.setMenuScopes).toHaveBeenCalledWith("member",["m"], "org"));
  });
  it("lets admins set a member's department, delivery point and ordering switch", async () => {
    const adminSnapshot:PortalSnapshot={ ...snapshot, role:"admin",
      members:[{ user_id:"member", email:"member@example.com", role:"member", is_active:true, menu_ids:[], department:null, delivery_point_id:null, can_order:true }],
      org_menus:[] };
    mount(adminSnapshot,"/customer/team");
    await screen.findByRole("heading",{name:"團隊管理"});
    fireEvent.change(screen.getByLabelText("部門"),{target:{value:"Kitchen"}});
    fireEvent.change(screen.getByLabelText("指定送貨點"),{target:{value:"p1"}});
    fireEvent.click(screen.getByLabelText("可訂餐"));
    fireEvent.click(screen.getByRole("button",{name:"儲存成員設定"}));
    await waitFor(()=>expect(mocks.setMemberProfile).toHaveBeenCalledWith("member",{department:"Kitchen",deliveryPointId:"p1",canOrder:false},"org"));
  });
  it("shows a member's assigned department and delivery point on the profile", async () => {
    mount({ ...snapshot, me:{ department:"Kitchen", delivery_point_id:"p1", can_order:false } }, "/customer/profile");
    await screen.findByRole("heading",{name:"個人資料"});
    expect(screen.getByText(/部門: Kitchen/)).toBeInTheDocument();
    expect(screen.getByText(/指定送貨點: 3樓接待處/)).toBeInTheDocument();
    expect(screen.getByText(/可訂餐: 否/)).toBeInTheDocument();
  });
  it("lets an admin turn off a member permission", async () => {
    mocks.submit.mockResolvedValue({ data: { ordering: false, orders: true, delivery: true, points: true, redeem: true, members: false, export: false, menus: false, settings: false }, error: null });
    mount({ ...snapshot, role: "admin" }, "/customer/team");
    fireEvent.click(await screen.findByRole("checkbox", { name: "訂餐管理" }));
    await waitFor(() => expect(mocks.submit).toHaveBeenCalledWith("customer_portal_set_member_permission", { p_permission: "ordering", p_allowed: false }));
  });
  it("lets a member with only menu management assign menus",async()=>{
    mount({...snapshot,permissions:{members:false,menus:true},
      members:[{user_id:"member",email:"member@example.com",role:"member",is_active:true,menu_ids:[]}],
      org_menus:[{id:"m",name:"指定餐單",brand:"HK Party Food",delivery_date:"2026-10-14",is_active:true}]},"/customer/team");
    fireEvent.click(await screen.findByRole("checkbox",{name:"HK Party Food · 指定餐單 · 2026-10-14"}));
    fireEvent.click(screen.getByRole("button",{name:"儲存餐牌權限"}));
    await waitFor(()=>expect(mocks.setMenuScopes).toHaveBeenCalledWith("member",["m"],"org"));
    expect(screen.getByRole("button",{name:"停用成員"})).toBeDisabled();
  });
  it("shows the selected company registration without a document path", async () => {
    mocks.submit.mockResolvedValue({ data: { name: "示例機構", brNumber: "12345678", brExpiresOn: "2027-01-01", settlementCycle: "monthly", contacts: [{ name: "陳先生", phone: "91234567", title: "經理", primary: true }] }, error: null });
    mount(snapshot, "/customer/company");
    expect(await screen.findByRole("heading", { name: "公司資料" })).toBeInTheDocument();
    expect(await screen.findByText(/12345678/)).toBeInTheDocument();
    expect(await screen.findByText(/陳先生/)).toBeInTheDocument();
    expect(screen.queryByText(/object_path/)).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "新增聯絡人" })).not.toBeInTheDocument();
  });
  it("lets a company admin manage contacts and submit a BR change", async () => {
    mocks.submit.mockResolvedValue({ data: { name: "示例機構", brNumber: "12345678", brExpiresOn: "2027-01-01", settlementCycle: "monthly", contacts: [{ name: "陳先生", phone: "91234567", title: "經理", primary: true }] }, error: null });
    mount({ ...snapshot, role: "admin" }, "/customer/company");
    await screen.findByRole("heading", { name: "公司資料" });
    fireEvent.click(await screen.findByRole("button", { name: "新增聯絡人" }));
    const panel = within(await screen.findByRole("dialog"));
    fireEvent.change(panel.getByLabelText("姓名"), { target: { value: "李小姐" } });
    fireEvent.change(panel.getByLabelText("電話"), { target: { value: "22334455" } });
    fireEvent.change(panel.getByLabelText("職位"), { target: { value: "採購" } });
    fireEvent.submit(panel.getByLabelText("姓名").closest("form")!);
    await waitFor(() => expect(mocks.submit).toHaveBeenCalledWith("customer_portal_save_company_contacts", expect.objectContaining({ p_contacts: expect.any(Array) })));
  });
  it("links admins to the company page from the menu", async () => {
    mount({ ...snapshot, role: "admin" });
    await screen.findByText("幾步就訂好。");
    openMenu();
    expect(screen.getByRole("link", { name: "公司資料" })).toHaveAttribute("href", "/customer/company");
  });
  it("hides the company page link from members", async () => {
    mount(snapshot);
    await screen.findByText("幾步就訂好。");
    openMenu();
    expect(screen.queryByRole("link", { name: "公司資料" })).not.toBeInTheDocument();
  });
});
