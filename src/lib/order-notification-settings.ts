import { supabase } from "@/lib/supabase";

export type OrderEmailNotificationUser = {
  userId: string;
  userName: string;
  email: string;
  enabled: boolean;
};

type OrderEmailNotificationUserRow = {
  user_id: string;
  user_name: string;
  email: string;
  enabled: boolean;
};

function mapEmailUser(row: OrderEmailNotificationUserRow): OrderEmailNotificationUser {
  return {
    userId: row.user_id,
    userName: row.user_name,
    email: row.email,
    enabled: Boolean(row.enabled),
  };
}

export async function fetchOrderEmailNotificationUsers() {
  const { data, error } = await supabase.rpc("order_email_notification_user_list");
  if (error) throw error;
  return ((data ?? []) as OrderEmailNotificationUserRow[]).map(mapEmailUser);
}

export async function setOrderEmailNotificationUser(
  userId: string,
  enabled: boolean,
) {
  const { data, error } = await supabase.rpc("set_order_email_notification_user", {
    p_user_id: userId,
    p_enabled: enabled,
  });
  if (error) throw error;
  const row = (data as OrderEmailNotificationUserRow[] | null)?.[0];
  if (!row) throw new Error("notification_user_not_found");
  return mapEmailUser(row);
}

export type OrderFirstNotificationRecipient = {
  id: string;
  name: string;
  phone: string;
  delayHours: number;
};

type OrderFirstNotificationRecipientRow = {
  id: string;
  name: string;
  phone: string;
  delay_hours: number | string;
};

function mapFirstRecipient(
  row: OrderFirstNotificationRecipientRow,
): OrderFirstNotificationRecipient {
  return {
    id: row.id,
    name: row.name,
    phone: row.phone,
    delayHours: Number(row.delay_hours),
  };
}

export async function fetchOrderFirstNotificationRecipients() {
  const { data, error } = await supabase.rpc("order_first_notification_recipient_list");
  if (error) throw error;
  return ((data ?? []) as OrderFirstNotificationRecipientRow[]).map(mapFirstRecipient);
}

export async function saveOrderFirstNotificationRecipient(input: {
  id?: string | null;
  name: string;
  phone: string;
  delayHours: number;
}) {
  const name = input.name.trim();
  const phone = input.phone.trim();
  if (!name) throw new Error("name_required");
  if (!phone) throw new Error("phone_required");
  if (!Number.isFinite(input.delayHours) || input.delayHours < 0) {
    throw new Error("delay_hours_invalid");
  }
  const { data, error } = await supabase.rpc("save_order_first_notification_recipient", {
    p_id: input.id ?? null,
    p_name: name,
    p_phone: phone,
    p_delay_hours: input.delayHours,
  });
  if (error) throw error;
  const row = (data as OrderFirstNotificationRecipientRow[] | null)?.[0];
  if (!row) throw new Error("notification_recipient_not_found");
  return mapFirstRecipient(row);
}

export async function deleteOrderFirstNotificationRecipient(id: string) {
  const { error } = await supabase.rpc("delete_order_first_notification_recipient", {
    p_id: id,
  });
  if (error) throw error;
}

