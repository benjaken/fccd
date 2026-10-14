import { describe, expect, it } from "vitest";
import {
  addressFingerprint,
  addressMutationId,
  basicDiscountInput,
  discountCreateId,
  parseCustomerAddresses,
  planAddressReconciliation,
  shopifyCustomerGid,
  voucherCodeFromBytes,
  toMailingAddress,
  type SyncLink,
  type SyncLocalAddress,
  type SyncRemoteAddress,
} from "../supabase/functions/shopify-customer-bridge/logic.ts";

it("preserves a long address across a push/read round trip",()=>{
  const source=local({address:"Building " + "A".repeat(240) + " Room " + "B".repeat(50)});
  const sent=toMailingAddress(source);
  const remote=parseCustomerAddresses({customer:{addressesV2:{nodes:[{id:"remote",firstName:sent.firstName,address1:sent.address1,address2:sent.address2,phone:sent.phone}]}}})[0];
  expect(addressFingerprint(remote)).toBe(addressFingerprint({...source,isDefault:false}));
  expect(planAddressReconciliation({local:[{...source,isDefault:false}],remote:[remote],links:[{localId:source.id,remoteId:remote.id,syncedHash:addressFingerprint(remote),status:"synced"}]})).toEqual([]);
});
it("rejects addresses that cannot fit without dropping their suffix",()=>{
  const address="A".repeat(300);
  expect(()=>toMailingAddress({recipient:"Person",phone:"91234567",address})).toThrow("address_requires_manual_sync");
  expect(address).toHaveLength(300);
});

const local = (patch: Partial<SyncLocalAddress> = {}): SyncLocalAddress => ({
  id: "local-1", recipient: "Ada", phone: "+852 9000 0000", address: "1 Queen Road", isDefault: true, archived: false, ...patch,
});
const remote = (patch: Partial<SyncRemoteAddress> = {}): SyncRemoteAddress => ({
  id: "gid://shopify/MailingAddress/1", recipient: "Ada", phone: "+852 9000 0000", address: "1 Queen Road", isDefault: true, ...patch,
});
const link = (patch: Partial<SyncLink> = {}): SyncLink => ({
  localId: "local-1", remoteId: "gid://shopify/MailingAddress/1", syncedHash: addressFingerprint(local()), status: "synced", ...patch,
});

describe("shopify customer bridge", () => {
  it("normalizes a Shopify customer id and builds a single-use fixed amount code", () => {
    expect(shopifyCustomerGid("99")).toBe("gid://shopify/Customer/99");
    expect(shopifyCustomerGid("gid://shopify/Customer/99")).toBe("gid://shopify/Customer/99");
    expect(shopifyCustomerGid("not-a-customer")).toBeNull();
    const code = voucherCodeFromBytes(new Uint8Array(10).fill(1));
    expect(code).toMatch(/^FCCD[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{10}$/);
    expect(basicDiscountInput({
      code, title: "HK$50 voucher", amount: 50, startsAt: "2026-10-14T00:00:00Z", endsAt: "2027-10-14T00:00:00Z",
      customerGid: "gid://shopify/Customer/99",
    })).toMatchObject({ usageLimit: 1, customerSelection: { customers: { add: ["gid://shopify/Customer/99"] } } });
    expect(discountCreateId({ discountCodeBasicCreate: { codeDiscountNode: { id: "gid://shopify/DiscountCodeNode/1" }, userErrors: [] } })).toEqual({ id: "gid://shopify/DiscountCodeNode/1" });
    expect(discountCreateId({ discountCodeBasicCreate: { userErrors: [{ message: "taken" }] } })).toEqual({ error: "taken" });
  });

  it("plans address push, pull, and conflicts from the last synced fingerprint", () => {
    expect(planAddressReconciliation({ local: [local()], remote: [], links: [] }).map(action => action.type)).toEqual(["push_create"]);
    expect(planAddressReconciliation({ local: [], remote: [remote()], links: [] }).map(action => action.type)).toEqual(["pull_create"]);
    expect(planAddressReconciliation({ local: [local()], remote: [remote()], links: [link()] })).toEqual([]);
    expect(planAddressReconciliation({
      local: [local({ address: "2 Queen Road" })], remote: [remote()], links: [link()],
    })[0]).toMatchObject({ type: "push_update" });
    expect(planAddressReconciliation({
      local: [local()], remote: [remote({ address: "2 Queen Road" })], links: [link()],
    })[0]).toMatchObject({ type: "pull_update" });
    expect(planAddressReconciliation({
      local: [local({ address: "2 Queen Road" })], remote: [remote({ address: "3 Queen Road" })], links: [link()],
    })[0]).toMatchObject({ type: "conflict" });
    expect(planAddressReconciliation({
      local: [local({ archived: true })], remote: [remote()], links: [link()],
    })[0]).toMatchObject({ type: "push_delete" });
    expect(planAddressReconciliation({ local: [local()], remote: [], links: [link()] })[0]).toMatchObject({ type: "pull_archive" });
    expect(planAddressReconciliation({
      local: [local({ address: "2 Queen Road" })], remote: [], links: [link()],
    })[0]).toMatchObject({ type: "conflict" });
    expect(planAddressReconciliation({
      local: [local()], remote: [remote()], links: [link({ status: "conflict" })],
    })[0]).toMatchObject({ type: "hold" });
  });

  it("reads Shopify customer addresses and address mutation ids", () => {
    expect(parseCustomerAddresses({
      customer: {
        defaultAddress: { id: "gid://shopify/MailingAddress/2" },
        addressesV2: { nodes: [{ id: "gid://shopify/MailingAddress/2", firstName: "Ada", lastName: "Wong", address1: "1 Queen", address2: "Room A", phone: "90000000" }] },
      },
    })).toEqual([{ id: "gid://shopify/MailingAddress/2", recipient: "Ada Wong", phone: "90000000", address: "1 Queen Room A", isDefault: true }]);
    expect(addressMutationId({ customerAddressCreate: { address: { id: "gid://shopify/MailingAddress/3" }, userErrors: [] } }, "customerAddressCreate"))
      .toEqual({ id: "gid://shopify/MailingAddress/3" });
  });
});
