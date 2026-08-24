import type { RealtimeChannel } from "@supabase/supabase-js";

import { supabase } from "@/lib/supabase";

export type NotificationPriority = "normal" | "important" | "urgent";
export type NotificationCategory = "information" | "action";

export type BusinessNotification = {
  id: string;
  eventType: string;
  category: NotificationCategory;
  priority: NotificationPriority;
  title: string;
  body: string | null;
  entityType: string | null;
  entityId: string | null;
  route: string | null;
  metadata: Record<string, unknown>;
  readAt: string | null;
  snoozedUntil: string | null;
  createdAt: string;
  updatedAt: string;
};

/** Order and quote notifications always open their entity detail, even when
 * an older database row still contains a list or workspace route. */
export function notificationDestination(item: BusinessNotification): string | null {
  if (item.entityType === "order" && item.entityId) {
    return `/orders/${item.entityId}`;
  }
  if (item.entityType === "quote" && item.entityId) {
    return `/quotes/${item.entityId}`;
  }
  const orderId = item.metadata.orderId;
  if (typeof orderId === "string" && orderId) {
    return `/orders/${orderId}`;
  }
  return item.route;
}

type NotificationRow = {
  id: string;
  event_type: string;
  category: NotificationCategory;
  priority: NotificationPriority;
  title: string;
  body: string | null;
  entity_type: string | null;
  entity_id: string | null;
  route: string | null;
  metadata: Record<string, unknown> | null;
  read_at: string | null;
  snoozed_until: string | null;
  created_at: string;
  updated_at: string;
};

function mapNotification(row: NotificationRow): BusinessNotification {
  return {
    id: row.id,
    eventType: row.event_type,
    category: row.category,
    priority: row.priority,
    title: row.title,
    body: row.body,
    entityType: row.entity_type,
    entityId: row.entity_id,
    route: row.route,
    metadata: row.metadata ?? {},
    readAt: row.read_at,
    snoozedUntil: row.snoozed_until,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function refreshDueNotifications(): Promise<void> {
  const { error } = await supabase.rpc("refresh_due_notifications");
  if (error) throw error;
}

export async function fetchNotifications(now = new Date()): Promise<BusinessNotification[]> {
  const { data, error } = await supabase
    .from("business_notifications")
    .select(
      "id,event_type,category,priority,title,body,entity_type,entity_id,route,metadata,read_at,snoozed_until,created_at,updated_at",
    )
    .neq("event_type", "factory_order_changed")
    .is("resolved_at", null)
    .or(`snoozed_until.is.null,snoozed_until.lte.${now.toISOString()}`)
    .order("updated_at", { ascending: false })
    .limit(100);
  if (error) throw error;
  return ((data ?? []) as NotificationRow[]).map(mapNotification);
}

export async function markNotificationRead(id: string): Promise<void> {
  const { error } = await supabase
    .from("business_notifications")
    .update({ read_at: new Date().toISOString() })
    .eq("id", id)
    .is("read_at", null);
  if (error) throw error;
}

export async function resolveNotification(id: string): Promise<void> {
  const now = new Date().toISOString();
  const { error } = await supabase
    .from("business_notifications")
    .update({ read_at: now, resolved_at: now })
    .eq("id", id);
  if (error) throw error;
}

export async function snoozeNotification(id: string, until: Date): Promise<void> {
  const { error } = await supabase
    .from("business_notifications")
    .update({ read_at: new Date().toISOString(), snoozed_until: until.toISOString() })
    .eq("id", id);
  if (error) throw error;
}

export function subscribeToNotifications(
  userId: string,
  onChange: () => void,
): RealtimeChannel {
  return supabase
    .channel(`business-notifications:${userId}`)
    .on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: "business_notifications",
        filter: `recipient_user_id=eq.${userId}`,
      },
      onChange,
    )
    .subscribe();
}

export type NotificationSettings = {
  quoteDeliveryDays: number[];
  factoryUnsentDays: number[];
  deliveredUnpaidDays: number[];
  deliveryAttentionHours: number[];
  urgentFactoryChangeHours: number;
  normalChangeMergeMinutes: number;
};

type NotificationSettingsRow = {
  quote_delivery_days: number[];
  factory_unsent_days: number[];
  delivered_unpaid_days: number[];
  delivery_attention_hours: number[];
  urgent_factory_change_hours: number;
  normal_change_merge_minutes: number;
};

export async function fetchNotificationSettings(): Promise<NotificationSettings> {
  const { data, error } = await supabase
    .from("notification_settings")
    .select(
      "quote_delivery_days,factory_unsent_days,delivered_unpaid_days,delivery_attention_hours,urgent_factory_change_hours,normal_change_merge_minutes",
    )
    .eq("singleton", true)
    .single();
  if (error) throw error;
  const row = data as NotificationSettingsRow;
  return {
    quoteDeliveryDays: row.quote_delivery_days,
    factoryUnsentDays: row.factory_unsent_days,
    deliveredUnpaidDays: row.delivered_unpaid_days,
    deliveryAttentionHours: row.delivery_attention_hours,
    urgentFactoryChangeHours: row.urgent_factory_change_hours,
    normalChangeMergeMinutes: row.normal_change_merge_minutes,
  };
}

export async function saveNotificationSettings(settings: NotificationSettings): Promise<void> {
  const { error } = await supabase
    .from("notification_settings")
    .update({
      quote_delivery_days: settings.quoteDeliveryDays,
      factory_unsent_days: settings.factoryUnsentDays,
      delivered_unpaid_days: settings.deliveredUnpaidDays,
      delivery_attention_hours: settings.deliveryAttentionHours,
      urgent_factory_change_hours: settings.urgentFactoryChangeHours,
      normal_change_merge_minutes: settings.normalChangeMergeMinutes,
      updated_by: (await supabase.auth.getUser()).data.user?.id ?? null,
      updated_at: new Date().toISOString(),
    })
    .eq("singleton", true);
  if (error) throw error;
  await refreshDueNotifications();
}

export async function acknowledgeFactoryChange(
  orderId: string,
  deliveryNotePrinted: boolean,
): Promise<void> {
  const { error } = await supabase.rpc("acknowledge_factory_change", {
    p_order_id: orderId,
    p_delivery_note_printed: deliveryNotePrinted,
  });
  if (error) throw error;
}
