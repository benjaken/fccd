import { supabase } from "@/lib/supabase";

/** Scope each request to the displayed workspace, independently of other tabs. */
export async function portalRpc<T>(name: string, args?: Record<string, unknown>, organizationId?: string): Promise<T> {
  const request = supabase.rpc(name, args);
  const { data, error } = await (organizationId ? request.setHeader("x-customer-organization", organizationId) : request);
  if (error) throw error;
  return data as T;
}
