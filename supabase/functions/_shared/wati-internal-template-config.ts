export type InternalWatiTemplateKind =
  | "factoryUnsentReminder"
  | "shopifyNewOrder"
  | "reconciliationMissing"
  | "reconciliationFactoryUnsent"
  | "reconciliationClear"
  | "reconciliationUrgent"
  | "orderReadinessIssue";

type InternalWatiTemplateDefinition = {
  templateEnv: string;
  broadcastEnv: string;
  templateName: string;
  broadcastName: string;
};

export const INTERNAL_WATI_TEMPLATE_DEFAULTS = {
  factoryUnsentReminder: {
    templateEnv: "WATI_FACTORY_UNSENT_TEMPLATE_NAME",
    broadcastEnv: "WATI_FACTORY_UNSENT_BROADCAST_NAME",
    templateName: "factory_unsent_internal_reminder",
    broadcastName: "Factory unsent internal reminder",
  },
  shopifyNewOrder: {
    templateEnv: "WATI_SHOPIFY_NEW_ORDER_TEMPLATE_NAME",
    broadcastEnv: "WATI_SHOPIFY_NEW_ORDER_BROADCAST_NAME",
    templateName: "fccd_internal_shopify_new_order",
    broadcastName: "FCCD internal Shopify new order",
  },
  reconciliationMissing: {
    templateEnv: "WATI_ORDER_RECONCILIATION_MISSING_TEMPLATE_NAME",
    broadcastEnv: "WATI_ORDER_RECONCILIATION_MISSING_BROADCAST_NAME",
    templateName: "fccd_internal_missing_order",
    broadcastName: "FCCD internal missing order",
  },
  reconciliationFactoryUnsent: {
    templateEnv: "WATI_ORDER_RECONCILIATION_FACTORY_UNSENT_TEMPLATE_NAME",
    broadcastEnv: "WATI_ORDER_RECONCILIATION_FACTORY_UNSENT_BROADCAST_NAME",
    templateName: "fccd_internal_factory_unsent",
    broadcastName: "FCCD internal factory unsent",
  },
  reconciliationClear: {
    templateEnv: "WATI_ORDER_RECONCILIATION_CLEAR_TEMPLATE_NAME",
    broadcastEnv: "WATI_ORDER_RECONCILIATION_CLEAR_BROADCAST_NAME",
    templateName: "fccd_internal_order_audit_clear",
    broadcastName: "Internal order audit clear",
  },
  reconciliationUrgent: {
    templateEnv: "WATI_ORDER_RECONCILIATION_URGENT_TEMPLATE_NAME",
    broadcastEnv: "WATI_ORDER_RECONCILIATION_URGENT_BROADCAST_NAME",
    templateName: "fccd_internal_missing_order_6h_urgent",
    broadcastName: "Internal missing order urgent",
  },
  orderReadinessIssue: {
    templateEnv: "WATI_ORDER_READINESS_ISSUE_TEMPLATE_NAME",
    broadcastEnv: "WATI_ORDER_READINESS_ISSUE_BROADCAST_NAME",
    templateName: "fccd_internal_order_readiness_issue",
    broadcastName: "Internal order readiness issue",
  },
} as const satisfies Record<InternalWatiTemplateKind, InternalWatiTemplateDefinition>;

export function resolveInternalWatiTemplate(
  kind: InternalWatiTemplateKind,
  readEnv: (name: string) => string | undefined,
) {
  const definition = INTERNAL_WATI_TEMPLATE_DEFAULTS[kind];
  return {
    template_name: readEnv(definition.templateEnv)?.trim() || definition.templateName,
    broadcast_name: readEnv(definition.broadcastEnv)?.trim() || definition.broadcastName,
  };
}

export function numberedInternalWatiParameters(
  values: Array<string | null | undefined>,
) {
  return values.map((value, index) => ({
    name: String(index + 1),
    value: (value || "")
      .replace(/[\r\n\t]+/g, " ")
      .replace(/\s{2,}/g, " ")
      .trim() || "-",
  }));
}
