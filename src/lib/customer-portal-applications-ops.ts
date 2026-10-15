import { supabase } from "@/lib/supabase";

export type ApplicationStatus = "draft" | "pending_review" | "needs_info" | "rejected" | "approved";
export type SettlementCycle = "weekly" | "semi_monthly" | "monthly";

export type OrganizationApplicationSummary = {
  id: string;
  company_name: string;
  status: ApplicationStatus;
  br_number: string;
  br_expires_on: string | null;
  applicant_email: string;
  organization_id: string | null;
  review_reason: string | null;
  updated_at: string;
};

export type OrganizationApplicationDetail = OrganizationApplicationSummary & {
  br_object_path: string | null;
  settlement_cycle: SettlementCycle | null;
  reviewed_at: string | null;
  contacts: Array<{ name: string; phone: string; title: string; is_primary: boolean }>;
  addresses: Array<{ label: string; recipient: string; phone: string; address: string }>;
  versions: Array<{ id: string; br_number: string; expires_on: string; object_path: string; created_at: string }>;
};

export type BrExpiryPolicy = {
  id: string;
  reminder_lead_days: number;
  block_new_orders_when_expired: boolean;
  reason: string;
  published_at: string;
};

async function rpc<T>(name: string, args?: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.rpc(name, args);
  if (error) throw error;
  return data as T;
}

export const listOrganizationApplications = () =>
  rpc<OrganizationApplicationSummary[]>("customer_portal_ops_list_applications");
export const fetchOrganizationApplicationPage = (page: number) =>
  rpc<{ rows: OrganizationApplicationSummary[]; total: number; page: number }>(
    "customer_portal_ops_application_page", { p_page: page },
  );
export const getOrganizationApplication = (id: string) =>
  rpc<OrganizationApplicationDetail>("customer_portal_ops_get_application", { p_id: id });
export const reviewOrganizationApplication = (input: {
  id: string;
  decision: "needs_info" | "rejected" | "approved";
  reason: string;
  settlementCycle?: SettlementCycle | null;
  adminEmail?: string | null;
}) =>
  rpc<string | null>("customer_portal_ops_review_application", {
    p_id: input.id,
    p_decision: input.decision,
    p_reason: input.reason,
    p_settlement_cycle: input.settlementCycle ?? null,
    p_admin_email: input.adminEmail ?? null,
  });
export type BrChangeRequest = {
  id: string;
  organizationId: string;
  orgName: string;
  brNumber: string;
  brExpiresOn: string;
  currentBrNumber: string;
  currentBrExpiresOn: string | null;
  submittedByEmail: string | null;
  submittedAt: string;
};

export const listBrChanges = () => rpc<BrChangeRequest[]>("customer_portal_ops_list_br_changes");
export const reviewBrChange = (input: { id: string; decision: "approved" | "rejected"; reason: string }) =>
  rpc<void>("customer_portal_ops_review_br_change", {
    p_id: input.id, p_decision: input.decision, p_reason: input.reason,
  });

export const getBrExpiryPolicy = () => rpc<BrExpiryPolicy | null>("customer_portal_ops_br_policy");
export const publishBrExpiryPolicy = (input: {
  reminderLeadDays: number;
  blockNewOrders: boolean;
  reason: string;
}) =>
  rpc<string>("customer_portal_ops_publish_br_policy", {
    p_reminder_lead_days: input.reminderLeadDays,
    p_block_new_orders: input.blockNewOrders,
    p_reason: input.reason,
  });
export const renewOrganizationBr = (input: {
  orgId: string;
  brNumber: string;
  expiresOn: string;
  objectPath: string;
  reason: string;
}) =>
  rpc<string>("customer_portal_ops_renew_br", {
    p_org_id: input.orgId,
    p_br_number: input.brNumber,
    p_expires_on: input.expiresOn,
    p_object_path: input.objectPath,
    p_reason: input.reason,
  });

export async function uploadStaffBr(orgId: string, userId: string, file: File) {
  const safe = file.name.replace(/[^A-Za-z0-9._-]/g, "_").replace(/^\.+/, "").slice(0, 120);
  if (!/\.(jpg|jpeg|png|pdf)$/i.test(safe)) throw new Error("invalid_br");
  if (file.size > 10 * 1024 * 1024) throw new Error("invalid_br");
  const path = `${userId}/${orgId}/${crypto.randomUUID()}.${safe.split(".").pop()!.toLowerCase()}`;
  const uploaded = await supabase.storage.from("customer-br-documents").upload(path, file, { upsert: false });
  if (uploaded.error) throw uploaded.error;
  return path;
}

export async function openBrDocument(path: string) {
  const signed = await supabase.storage.from("customer-br-documents").createSignedUrl(path, 60);
  if (signed.error || !signed.data?.signedUrl) throw signed.error ?? new Error("invalid_br_attachment");
  window.open(signed.data.signedUrl, "_blank", "noopener");
}
