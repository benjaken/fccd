import { createHash } from "node:crypto";

const expectationKeys = new Set(["replyContains", "replyExcludes", "replyEquals", "intent", "state", "pendingRequest", "slots", "effects", "failureReason", "intakeDate", "intakeTime"]);
const object = (value) => value !== null && typeof value === "object" && !Array.isArray(value);

export function validateRegressionCase(value) {
  const errors = [];
  if (!object(value)) return ["Case must be an object"];
  if (value.schemaVersion !== 1) errors.push("schemaVersion must be 1");
  if (!/^[a-z0-9][a-z0-9-]*$/.test(value.id ?? "")) errors.push("id must be a lowercase slug");
  if (typeof value.title !== "string" || !value.title.trim()) errors.push("title is required");
  if (!["approved", "draft"].includes(value.status)) errors.push("status must be approved or draft");
  if (!value.source?.kind || !value.source?.reference) errors.push("source kind and reference are required");
  if (!/^\d{4}-\d{2}-\d{2}T.*(?:Z|[+-]\d{2}:\d{2})$/.test(value.clock ?? "") || !Number.isFinite(Date.parse(value.clock))) errors.push("clock must be an ISO timestamp with timezone");
  if (!Array.isArray(value.turns) || !value.turns.length || value.turns.length > 100) return [...errors, "turns must contain 1-100 customer turns"];
  for (const [index, turn] of value.turns.entries()) {
    const label = `turn ${index + 1}`;
    if (!object(turn)) { errors.push(`${label}: turn must be an object`); continue; }
    if (typeof turn.customer !== "string" || !turn.customer.trim()) errors.push(`${label}: customer text is required`);
    if (turn.customer?.length > 5000) errors.push(`${label}: customer text exceeds 5000 characters`);
    if (value.status === "draft" && turn.expect == null) continue;
    if (!object(turn.expect)) { errors.push(`${label}: approved turns need expectations`); continue; }
    for (const key of Object.keys(turn.expect)) if (!expectationKeys.has(key)) errors.push(`${label}: unknown expectation ${key}`);
    const expected = turn.expect;
    if (!object(expected.effects) || ![expected.effects.writeInquiry, expected.effects.queueHandoff].every((n) => Number.isInteger(n) && n >= 0)) {
      errors.push(`${label}: effects must specify nonnegative writeInquiry and queueHandoff counts`);
    }
    if (!["replyContains", "replyEquals", "state", "intent", "failureReason"].some((key) => Object.hasOwn(expected, key))) errors.push(`${label}: at least one reply or behavior expectation is required`);
    for (const key of ["replyContains", "replyExcludes"]) {
      if (expected[key] !== undefined && (!Array.isArray(expected[key]) || !expected[key].length || !expected[key].every((item) => typeof item === "string" && item.trim()))) errors.push(`${label}: ${key} must be a nonempty array of text`);
    }
    if (Object.hasOwn(expected, "replyEquals") && expected.replyEquals !== null && typeof expected.replyEquals !== "string") errors.push(`${label}: replyEquals must be text or null`);
  }
  return errors;
}

export function compareRegressionTurn(actual, expected) {
  const differences = [];
  const text = actual.reply ?? "";
  if (/(?:undefined|NaN)/.test(text)) differences.push("reply contains undefined/NaN");
  for (const phrase of expected.replyContains ?? []) if (!text.includes(phrase)) differences.push(`reply is missing: ${phrase}`);
  for (const phrase of expected.replyExcludes ?? []) if (text.includes(phrase)) differences.push(`reply must not contain: ${phrase}`);
  for (const key of ["replyEquals", "intent", "state", "pendingRequest", "failureReason", "intakeDate", "intakeTime"]) {
    if (!Object.hasOwn(expected, key)) continue;
    const current = key === "replyEquals" ? actual.reply : actual[key];
    if (current !== expected[key]) differences.push(`${key}: expected ${JSON.stringify(expected[key])}, received ${JSON.stringify(current)}`);
  }
  for (const key of ["slots", "effects"]) {
    for (const [field, wanted] of Object.entries(expected[key] ?? {})) {
      if (actual[key]?.[field] !== wanted) differences.push(`${key}.${field}: expected ${JSON.stringify(wanted)}, received ${JSON.stringify(actual[key]?.[field])}`);
    }
  }
  return differences;
}

export function redactRegressionText(text) {
  return String(text ?? "")
    .replace(/https?:\/\/[^\s<>]+/gi, "[連結已隱藏]")
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "[電郵已隱藏]")
    .replace(/\b[A-Z]{2,8}\d{6,}\b/gi, "[訂單編號已隱藏]")
    .replace(/(?<![\d-])(?!20\d{2}[-/.]\d{1,2}[-/.]\d{1,2}\b)(?:\+?\d[\s-]*){8,}(?!\d)/g, "[電話或編號已隱藏]")
    .replace(/((?:地址|address|姓名|name|聯絡人|联系人)\s*[:：])[^\n]+/gi, "$1[資料已隱藏]")
    .trim();
}

/** Imports evidence, never treats an old assistant/human answer as an approved expected answer. */
export function draftFromTranscript(input, { id, title }) {
  const messages = Array.isArray(input) ? input : input?.messages;
  if (!Array.isArray(messages) || !messages.length) throw new Error("Input must contain a messages array");
  const turns = [];
  let clock;
  for (const message of messages) {
    if (!object(message)) throw new Error("Each message must be an object");
    const role = message.role;
    if (!["customer", "assistant", "human"].includes(role)) throw new Error(`Unsupported message role: ${role}`);
    const text = redactRegressionText(message.text ?? message.message_text);
    if (!text) continue;
    const timestamp = message.occurredAt ?? message.created_at;
    if (!clock && Number.isFinite(Date.parse(timestamp))) clock = new Date(timestamp).toISOString();
    if (role === "customer") {
      const last = turns.at(-1);
      if (last && !last.referenceReplies.length) last.customer += `\n${text}`;
      else turns.push({ customer: text, referenceReplies: [], expect: null });
    } else if (turns.length) turns.at(-1).referenceReplies.push({ role, text });
  }
  if (!clock) throw new Error("At least one message must have an occurredAt or created_at timestamp");
  if (!turns.length) throw new Error("Transcript has no customer message");
  const fixture = { schemaVersion: 1, id, title, status: "draft", clock,
    source: { kind: messages.some((message) => message.role === "human") ? "human_conversation" : "historical_test",
      reference: `transcript-sha256:${createHash("sha256").update(JSON.stringify(messages)).digest("hex")}` },
    world: {}, turns };
  const errors = validateRegressionCase(fixture);
  if (errors.length) throw new Error(errors.join("\n"));
  return fixture;
}
