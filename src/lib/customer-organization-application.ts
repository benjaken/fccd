import { supabase } from "@/lib/supabase";

export type OrganizationApplicationContact = {
  id?: string;
  name: string;
  phone: string;
  title: string;
  is_primary: boolean;
};

export type OrganizationApplicationAddress = {
  id?: string;
  label: string;
  recipient: string;
  phone: string;
  address: string;
};

export type OrganizationApplication = {
  id: string;
  status: "draft" | "pending_review" | "needs_info" | "rejected" | "approved";
  company_name: string;
  br_number: string;
  br_expires_on: string | null;
  br_object_path: string | null;
  organization_id: string | null;
  settlement_cycle: "weekly" | "semi_monthly" | "monthly" | null;
  review_reason: string | null;
  reviewed_at: string | null;
  updated_at: string;
  contacts: OrganizationApplicationContact[];
  addresses: OrganizationApplicationAddress[];
};

export type OrganizationApplicationInput = {
  companyName: string;
  brNumber: string;
  brExpiresOn: string | null;
  brObjectPath?: string | null;
  contacts: OrganizationApplicationContact[];
  addresses: OrganizationApplicationAddress[];
};

async function rpc<T>(name: string, args?: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.rpc(name, args);
  if (error) throw error;
  return data as T;
}

export const currentOrganizationApplication = () =>
  rpc<OrganizationApplication | null>("customer_org_application_current");

export const saveOrganizationApplication = (input: OrganizationApplicationInput) =>
  rpc<string>("customer_org_application_save", {
    p_company_name: input.companyName,
    p_br_number: input.brNumber,
    p_br_expires_on: input.brExpiresOn,
    p_br_object_path: input.brObjectPath ?? null,
    p_contacts: input.contacts.map(contact => ({
      name: contact.name,
      phone: contact.phone,
      title: contact.title,
      is_primary: contact.is_primary,
    })),
    p_addresses: input.addresses.map(address => ({
      label: address.label,
      recipient: address.recipient,
      phone: address.phone,
      address: address.address,
    })),
  });

export const submitOrganizationApplication = () =>
  rpc<string>("customer_org_application_submit");

export async function uploadOrganizationBr(applicationId: string, userId: string, file: File) {
  const safe = file.name.replace(/[^A-Za-z0-9._-]/g, "_").replace(/^\.+/, "").slice(0, 120);
  if (!/\.(jpg|jpeg|png|pdf)$/i.test(safe)) throw new Error("invalid_br_attachment");
  if (file.size > 10 * 1024 * 1024) throw new Error("invalid_br_attachment");
  const path = `${userId}/${applicationId}/${crypto.randomUUID()}.${safe.split(".").pop()!.toLowerCase()}`;
  const uploaded = await supabase.storage.from("customer-br-documents").upload(path, file, { upsert: false });
  if (uploaded.error) throw uploaded.error;
  return path;
}
