import { supabase } from "@/lib/supabase";

export type DeliveryFleet = {
  id: string;
  name: string;
  shortName: string | null;
  contactPerson: string | null;
  contactNumber: string | null;
  status: string | null;
  isActive: boolean;
  hasLoginCode: boolean;
  createdAt: string;
};

type DeliveryFleetRow = {
  id: string;
  name: string;
  short_name: string | null;
  contact_person: string | null;
  contact_number: string | null;
  status: string | null;
  is_active: boolean;
  created_at: string;
  has_login_code: boolean;
};

function mapFleet(row: DeliveryFleetRow): DeliveryFleet {
  return {
    id: row.id,
    name: row.name,
    shortName: row.short_name,
    contactPerson: row.contact_person,
    contactNumber: row.contact_number,
    status: row.status,
    isActive: row.is_active,
    hasLoginCode: Boolean(row.has_login_code),
    createdAt: row.created_at,
  };
}

export async function fetchDeliveryFleets(search = "") {
  const { data, error } = await supabase.rpc("delivery_fleet_management_list", {
    p_search: search.trim() || null,
  });
  if (error) throw error;
  return ((data ?? []) as DeliveryFleetRow[]).map(mapFleet);
}

export type DeliveryFleetInput = {
  name: string;
  shortName?: string;
  contactPerson?: string;
  contactNumber?: string;
  isActive?: boolean;
  loginCode?: string;
};

function fleetFields(input: DeliveryFleetInput) {
  const name = input.name.trim();
  if (!name) throw new Error("name_required");
  return {
    name,
    short_name: input.shortName?.trim() || null,
    contact_person: input.contactPerson?.trim() || null,
    contact_number: input.contactNumber?.trim() || null,
    status: input.isActive === false ? "inactive" : "active",
    is_active: input.isActive !== false,
    bubble_modified_at: new Date().toISOString(),
  };
}

export async function createDeliveryFleet(input: DeliveryFleetInput) {
  const fields = fleetFields(input);
  const { data, error } = await supabase.rpc("save_delivery_fleet", {
    p_fleet_id: null,
    p_name: fields.name,
    p_short_name: fields.short_name,
    p_contact_person: fields.contact_person,
    p_contact_number: fields.contact_number,
    p_is_active: fields.is_active,
    p_login_code: input.loginCode?.trim() || null,
  });
  if (error) throw error;
  return mapFleet((data as DeliveryFleetRow[])[0]);
}

export async function updateDeliveryFleet(
  id: string,
  input: DeliveryFleetInput,
) {
  const fields = fleetFields(input);
  const { data, error } = await supabase.rpc("save_delivery_fleet", {
    p_fleet_id: id,
    p_name: fields.name,
    p_short_name: fields.short_name,
    p_contact_person: fields.contact_person,
    p_contact_number: fields.contact_number,
    p_is_active: fields.is_active,
    p_login_code: input.loginCode?.trim() || null,
  });
  if (error) throw error;
  return mapFleet((data as DeliveryFleetRow[])[0]);
}
