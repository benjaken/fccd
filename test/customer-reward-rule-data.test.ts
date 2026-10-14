import { expect,it,vi } from "vitest";
import { listRewardRules,rewardRuleThreshold } from "@/lib/customer-portal-reward-rules-ops";
const mocks=vi.hoisted(()=>({rpc:vi.fn()}));
vi.mock("@/lib/supabase",()=>({supabase:{rpc:mocks.rpc}}));
it("normalizes numeric strings and treats missing values as unavailable",async()=>{
  mocks.rpc.mockResolvedValue({data:[{id:"old",points_per_hkd:100},{id:"new",hkd_per_point:"25"}],error:null});
  const rows=await listRewardRules();expect(rows.map(row=>row.hkd_per_point)).toEqual([null,25]);
});
it("keeps paused earning distinct from missing or malformed data",()=>{
  expect(rewardRuleThreshold(0)).toBe(0);
  for(const value of [undefined,null,"",NaN,Infinity,-1,"bad"]) expect(rewardRuleThreshold(value)).toBeNull();
});
