/** Only these local routes can be used for customer PayPal callbacks. */
export function customerReturnPath(requested: unknown): string {
  return requested === "/customer/personal" ? requested : "/self_service_search";
}
