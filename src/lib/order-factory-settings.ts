import { supabase } from "@/lib/supabase";

export type OrderFactorySettings = {
  doNotSendToFactory: boolean;
  suppressFactoryReprint: boolean;
  factoryPrintDate: string | null;
  originalFactoryReprintRequired: boolean;
};

export function normalizeDoNotSendToFactory(
  doNotSendToFactory: boolean | null | undefined,
) {
  return doNotSendToFactory === true;
}

export function shouldRestoreFactoryPrintState(settings: OrderFactorySettings) {
  return Boolean(
    settings.suppressFactoryReprint &&
      !settings.doNotSendToFactory &&
      settings.factoryPrintDate &&
      !settings.originalFactoryReprintRequired,
  );
}

export async function saveOrderFactorySettings(
  orderId: string,
  settings: OrderFactorySettings,
) {
  const { error } = await supabase
    .from("orders")
    .update({
      do_not_send_to_factory: settings.doNotSendToFactory,
      updated_at: new Date().toISOString(),
    })
    .eq("id", orderId)
    .eq("document_type", "order")
    .is("archived_at", null)
    .select("id")
    .single();
  if (error) throw error;

  if (!shouldRestoreFactoryPrintState(settings)) return;

  const { error: printedError } = await supabase
    .from("order_lines")
    .update({ is_printed: true })
    .eq("order_id", orderId)
    .eq("is_void", false);
  if (printedError) throw printedError;

  const { error: reprintError } = await supabase
    .from("orders")
    .update({
      factory_reprint_required: false,
      factory_print_date: new Date().toISOString(),
    })
    .eq("id", orderId);
  if (reprintError) throw reprintError;
}
