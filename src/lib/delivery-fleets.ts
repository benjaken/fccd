import { supabase } from "@/lib/supabase";

export type DeliveryFleet = {
  id: string;
  name: string;
  shortName: string | null;
  contactPerson: string | null;
  contactNumber: string | null;
  bankAccount: string | null;
  status: string | null;
  isActive: boolean;
  driverPanelEnabled: boolean;
  hasLoginCode: boolean;
  createdAt: string;
};

type DeliveryFleetRow = {
  id: string;
  name: string;
  short_name: string | null;
  contact_person: string | null;
  contact_number: string | null;
  bank_account: string | null;
  status: string | null;
  is_active: boolean;
  driver_panel_enabled: boolean;
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
    bankAccount: row.bank_account,
    status: row.status,
    isActive: row.is_active,
    driverPanelEnabled: row.driver_panel_enabled,
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
  bankAccount?: string;
  isActive?: boolean;
  driverPanelEnabled?: boolean;
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
    bank_account: input.bankAccount?.trim() || null,
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
    p_bank_account: fields.bank_account,
    p_is_active: fields.is_active,
    p_driver_panel_enabled: input.driverPanelEnabled !== false,
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
    p_bank_account: fields.bank_account,
    p_is_active: fields.is_active,
    p_driver_panel_enabled: input.driverPanelEnabled !== false,
    p_login_code: input.loginCode?.trim() || null,
  });
  if (error) throw error;
  return mapFleet((data as DeliveryFleetRow[])[0]);
}

export type DeliveryFleetFee = {
  feeId: string | null;
  districtId: string;
  fleetId: string;
  fleetName: string;
  districtName: string;
  fee: number;
};

type DeliveryFleetFeeRow = {
  fee_id: string | null;
  district_id: string;
  fleet_id: string;
  fleet_name: string;
  district_name: string;
  fee: number | string;
};

function mapFleetFee(row: DeliveryFleetFeeRow): DeliveryFleetFee {
  return {
    feeId: row.fee_id,
    districtId: row.district_id,
    fleetId: row.fleet_id,
    fleetName: row.fleet_name,
    districtName: row.district_name,
    fee: Number(row.fee) || 0,
  };
}

export async function fetchDeliveryFleetFees(fleetId: string | null = null) {
  const { data, error } = await supabase.rpc("delivery_fleet_fee_list", {
    p_fleet_id: fleetId,
  });
  if (error) throw error;
  return ((data ?? []) as DeliveryFleetFeeRow[]).map(mapFleetFee);
}

export async function updateDeliveryFleetFee(
  fleetId: string,
  districtId: string,
  fee: number,
) {
  if (!Number.isFinite(fee) || fee < 0) throw new Error("fee_invalid");
  const { data, error } = await supabase.rpc("save_delivery_fleet_fee", {
    p_fleet_id: fleetId,
    p_district_id: districtId,
    p_fee: fee,
  });
  if (error) throw error;
  return mapFleetFee((data as DeliveryFleetFeeRow[])[0]);
}
