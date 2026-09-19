import type { HistoryJudgeAiConfig } from "./customer-service-history-judge-ai.ts";

/** The classifier may select a workflow, never write a new intent or policy. */
export const HISTORY_CASE_INTENTS = {
  product_selection: "商品選擇",
  order_intake: "下單資料收集",
  quotation: "報價資料收集",
  order_confirmation: "訂單確認",
  order_item_change: "更改餐點",
  order_quantity_change: "更改數量",
  delivery_date_change: "更改送貨日期",
  delivery_address_change: "更改送貨地址",
  order_status: "查詢訂單進度",
  payment_method: "付款方式諮詢",
  payment_verification: "核對付款記錄",
  payment_followup: "未付款跟進",
  delivery_delay: "送貨延誤",
  delivery_address_issue: "找不到送貨地址",
  recipient_unavailable: "無人收貨",
  missing_item: "漏送",
  wrong_item: "錯送",
  quality_complaint: "品質投訴",
  cancellation_request: "取消訂單請求",
  refund_request: "退款請求",
  receipt_request: "收據需求",
  invoice_request: "發票需求",
  quote_document_request: "報價單需求",
  status_followup: "催辦跟進",
  special_request: "特殊飲食或服務需求",
  handoff: "轉人工處理",
} as const;
const INTENTS = Object.keys(HISTORY_CASE_INTENTS) as Array<keyof typeof HISTORY_CASE_INTENTS>;
const STEPS = ["acknowledge", "ask_missing_details", "check_authoritative_source",
  "check_order_state", "check_payment_state", "check_delivery_state",
  "check_product_availability", "explain_supported_options", "summarize_request",
  "collect_evidence", "handoff_if_needed", "follow_up"] as const;
const SLOTS = ["order_id", "delivery_date", "delivery_time", "delivery_address", "district",
  "quantity", "item_name", "dietary_need", "contact_method", "preferred_option",
  "payment_reference", "issue_details", "evidence_photo", "invoice_details",
  "recipient_contact", "cancellation_reason"] as const;

export type RecognizedHistoryCase = {
  intent: keyof typeof HISTORY_CASE_INTENTS;
  steps: Array<typeof STEPS[number]>;
  missingSlots: Array<typeof SLOTS[number]>;
};

export function parseRecognizedHistoryCase(value: unknown): RecognizedHistoryCase | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const row = value as Record<string, unknown>;
  if (row.reusable !== true || !INTENTS.includes(row.intent as keyof typeof HISTORY_CASE_INTENTS) ||
      !Array.isArray(row.steps) || !row.steps.length || row.steps.length > 5 ||
      !row.steps.every((step) => STEPS.includes(step)) ||
      !Array.isArray(row.missingSlots) || row.missingSlots.length > 8 ||
      !row.missingSlots.every((slot) => SLOTS.includes(slot))) return null;
  const steps = [...new Set(row.steps)] as RecognizedHistoryCase["steps"];
  const missingSlots = [...new Set(row.missingSlots)] as RecognizedHistoryCase["missingSlots"];
  const intent = row.intent as RecognizedHistoryCase["intent"];
  const orderWorkflow = ["order_confirmation", "order_item_change", "order_quantity_change",
    "delivery_date_change", "delivery_address_change", "order_status", "payment_verification",
    "payment_followup", "delivery_delay", "delivery_address_issue", "recipient_unavailable",
    "missing_item", "wrong_item", "quality_complaint", "cancellation_request", "refund_request",
    "receipt_request", "invoice_request", "status_followup"];
  if (steps.includes("check_order_state") && !orderWorkflow.includes(intent)) return null;
  if (steps.includes("check_payment_state") &&
      !["payment_verification", "payment_followup", "refund_request"].includes(intent)) return null;
  if (steps.includes("check_delivery_state") &&
      !["delivery_delay", "delivery_address_issue", "recipient_unavailable", "order_status"].includes(intent)) {
    return null;
  }
  if (["cancellation_request", "refund_request"].includes(intent) &&
      (!steps.includes("check_order_state") || !steps.includes("handoff_if_needed"))) return null;
  if (["missing_item", "wrong_item", "quality_complaint"].includes(intent) &&
      !steps.includes("collect_evidence") && !steps.includes("handoff_if_needed")) return null;
  return { intent, steps, missingSlots };
}

/** AI chooses only bounded workflow labels. It never supplies facts or answer prose. */
export async function recognizeHistoryCase(input: {
  question: string;
  context: Array<{ role: string; text: string }>;
  humanReply: string;
  config: HistoryJudgeAiConfig;
  fetchImpl?: typeof fetch;
}): Promise<RecognizedHistoryCase | null> {
  const { config } = input;
  if (!config.enabled || !config.endpoint || !config.apiKey || !config.model) return null;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), Math.max(1_000, config.timeoutMs));
  try {
    const response = await (input.fetchImpl ?? fetch)(config.endpoint, {
      method: "POST", signal: controller.signal,
      headers: { Authorization: `Bearer ${config.apiKey.replace(/^Bearer\s+/i, "")}`,
        "Content-Type": "application/json" },
      body: JSON.stringify({
        model: config.model, stream: false, temperature: 0, max_tokens: 240,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: `Classify whether this Hong Kong food-service exchange is a reusable response workflow. The historical human reply is not a factual authority. Never copy its claims, prices, policies, promises, or wording. Return JSON only with reusable:boolean, intent, steps, missingSlots. Intent choices: ${Object.entries(HISTORY_CASE_INTENTS).map(([key, label]) => `${key}=${label}`).join("; ")}. Steps must use only ${STEPS.join(",")}; missingSlots must use only ${SLOTS.join(",")}. Workflow guidance means what to verify or ask next, never a claim that an order, payment, delivery, cancellation or refund action has been completed. Return reusable:false for one-off concessions, unclear context, policy or factual questions, completed-action claims, or unsupported commitments. For cancellation/refund choose both check_order_state and handoff_if_needed; for missing/wrong items or quality complaints choose collect_evidence or handoff_if_needed.` },
          { role: "user", content: JSON.stringify({ question: input.question,
            context: input.context.slice(-6), historicalHumanReply: input.humanReply }) },
        ],
      }),
    });
    if (!response.ok) return null;
    const payload = await response.json() as { choices?: Array<{ message?: { content?: string | null } }> };
    const content = payload.choices?.[0]?.message?.content?.trim();
    if (!content) return null;
    return parseRecognizedHistoryCase(JSON.parse(content));
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}
