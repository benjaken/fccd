import { expect, it, vi } from "vitest";
import { portalRpc } from "@/lib/customer-portal-rpc";
const mocks=vi.hoisted(()=>({rpc:vi.fn()}));
vi.mock("@/lib/supabase",()=>({supabase:{rpc:mocks.rpc}}));
it("scopes concurrent requests to their own displayed organization",async()=>{
  const headers:Record<string,string>[]=[];
  mocks.rpc.mockImplementation(()=>{
    const own:Record<string,string>={};headers.push(own);
    return Object.assign(Promise.resolve({data:"ok",error:null}),{setHeader:(key:string,value:string)=>{own[key]=value;return Promise.resolve({data:"ok",error:null});}});
  });
  await Promise.all([portalRpc("customer_portal_workspace",undefined,"company-a"),portalRpc("customer_portal_workspace",undefined,"company-b")]);
  expect(headers).toEqual([{"x-customer-organization":"company-a"},{"x-customer-organization":"company-b"}]);
});
