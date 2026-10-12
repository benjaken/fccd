import { supabase } from "@/lib/supabase";
import { logoutCustomerSelfService, type CustomerSelfServiceSession } from "@/lib/customer-self-service";

/** Only orders explicitly linked to the verified Auth user can enter this session. */
export async function fetchPersonalOtpSession(): Promise<CustomerSelfServiceSession> {
  const { data, error } = await supabase.rpc("customer_personal_session");
  if (error) throw error;
  if (!data?.token || !Array.isArray(data.orders)) throw new Error("personal_session_unavailable");
  return data as CustomerSelfServiceSession;
}

export async function logoutPersonalOtpSession(token: string) {
  const result = await supabase.rpc("customer_personal_logout");
  if (result.error) throw result.error;
  await logoutCustomerSelfService(token);
  const { error } = await supabase.auth.signOut();
  if (error) throw error;
}
