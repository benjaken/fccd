import { describe, expect, it, vi } from "vitest";
import { fetchPersonalReorder, shopifyCartUrl, shopifyStoreUrl, uploadPersonalEvidence } from "@/lib/customer-personal";
const mocks = vi.hoisted(() => ({ upload: vi.fn(), rpc: vi.fn() }));
vi.mock("@/lib/supabase", () => ({ supabase: { rpc: mocks.rpc, auth: { getUser: async () => ({ data: { user: { id: "user" } }, error: null }) }, storage: { from: () => ({ upload: mocks.upload }) } } }));
describe("Shopify personal links", () => {
  it("loads the authorized reorder cart without losing variant precision", async () => {
    const cart = { domain: "brand.myshopify.com", items: [{ variant: "9007199254740993", quantity: 2 }] };
    mocks.rpc.mockResolvedValueOnce({ data: cart, error: null });
    expect(await fetchPersonalReorder("order")).toEqual(cart);
    expect(mocks.rpc).toHaveBeenCalledWith("customer_personal_reorder", { p_order_id: "order" });
  });
  it("preserves big variant IDs and original quantities in a cart permalink", () => {
    expect(shopifyCartUrl({ domain: "brand.myshopify.com", items: [{ variant: "9007199254740993", quantity: 2 }, { variant: "3", quantity: 4 }] })).toBe("https://brand.myshopify.com/cart/9007199254740993:2,3:4?storefront=true");
  });
  it.each(["javascript:alert(1)", "https://brand.myshopify.com", "brand.myshopify.com.evil.com", "brand.myshopify.com/cart", "evil.com"])("rejects unsafe or non-Shopify host %s", domain => { expect(() => shopifyStoreUrl(domain)).toThrow(); });
  it("rejects invalid quantities and variant tokens", () => {
    for (const [variant, quantity] of [["1/evil", 1], ["123", 0], ["123", 1.5]] as const) expect(() => shopifyCartUrl({ domain: "brand.myshopify.com", items: [{ variant, quantity }] })).toThrow();
  });
  it("retries evidence submission with the same object after a lost RPC response", async () => {
    mocks.upload.mockResolvedValue({ error: null }); mocks.rpc.mockResolvedValueOnce({ error: { message: "network" } }).mockResolvedValueOnce({ error: null });
    const file = new File(["evidence"], "proof.pdf", { type: "application/pdf" });
    await expect(uploadPersonalEvidence("order", file, 100)).rejects.toMatchObject({ message: "network" });
    await uploadPersonalEvidence("order", file, 100);
    expect(mocks.upload).toHaveBeenCalledTimes(1);
    expect(mocks.rpc.mock.calls[0]).toEqual(mocks.rpc.mock.calls[1]);
  });
});
