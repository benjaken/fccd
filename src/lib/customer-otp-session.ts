import { supabase } from "@/lib/supabase";
import { logoutCustomerSelfService, type CustomerSelfServiceSession } from "@/lib/customer-self-service";

/** Orders enter this session from an operator link, or from the verified customer email. Internal inboxes are excluded. */
export async function fetchPersonalOtpSession(): Promise<CustomerSelfServiceSession> {
  const { data, error } = await supabase.rpc("customer_personal_session");
  if (error) throw error;
  if (!data?.token || !Array.isArray(data.orders)) throw new Error("personal_session_unavailable");
  return data as CustomerSelfServiceSession;
}

export async function savePersonalPhone(phone: string): Promise<CustomerSelfServiceSession> {
  const saved = await supabase.rpc("customer_personal_set_phone", { p_phone: phone });
  if (saved.error) throw saved.error;
  return fetchPersonalOtpSession();
}

export async function logoutPersonalOtpSession(token: string) {
  const result = await supabase.rpc("customer_personal_logout");
  if (result.error) throw result.error;
  await logoutCustomerSelfService(token);
  const { error } = await supabase.auth.signOut();
  if (error) throw error;
}
