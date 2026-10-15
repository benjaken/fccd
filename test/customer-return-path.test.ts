import { afterEach, describe, expect, it, vi } from "vitest";
import { customerReturnPath } from "../supabase/functions/_shared/customer-return-path";
import { createCustomerAddonPaypalCheckout } from "@/lib/customer-self-service";

const invoke = vi.hoisted(() => vi.fn());
vi.mock("@/lib/supabase", () => ({ supabase: { functions: { invoke } } }));
const originalUrl = window.location.href;
afterEach(() => { window.history.replaceState({}, "", originalUrl); vi.clearAllMocks(); });

describe("customer PayPal callback route", () => {
  it.each([undefined, null, "https://example.com", "//example.com", "/customer/team", "/customer/personal/../team", "/customer/personal?invite=x", "/self_service_search"])("keeps unapproved callback paths on the legacy route: %s", requested => {
    expect(customerReturnPath(requested)).toBe("/self_service_search");
  });
  it("allows the shared personal-customer entry", () => {
    expect(customerReturnPath("/customer/personal")).toBe("/customer/personal");
  });
  it.each([
    ["/customer/personal/order-1", "/customer/personal"],
    ["/self_service_search/order-1", "/self_service_search"],
  ])("requests the correct callback route from %s", async (page, returnPath) => {
    window.history.replaceState({}, "", page);
    invoke.mockResolvedValue({ data: { approvalUrl: "https://paypal.example/approve", checkoutId: "checkout" }, error: null });
    await createCustomerAddonPaypalCheckout("personal-session", "order-1", [{ productId: "product-1", quantity: 1 }]);
    expect(invoke).toHaveBeenCalledWith("customer-addon-paypal", { body: {
      action: "create", sessionToken: "personal-session", orderId: "order-1", items: [{ productId: "product-1", quantity: 1 }], origin: window.location.origin, returnPath,
    } });
  });
});
