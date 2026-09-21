import { sanitizeCustomerServiceContextText } from "./customer-service-context.ts";

/**
 * Phase-1 human conversation cases are response guidance only. They never
 * ground business facts and cannot be promoted to policy by AI. This module is
 * the single trusted source for shape validation, redaction and fingerprinting,
 * shared by the management command, the embedding job and tests.
 */
export type CustomerServiceCaseProvenance = "manual" | "learned_human" | "learned_bot";
export type CustomerServiceCaseOutcome = "unknown" | "positive" | "negative";
export type CustomerServiceCaseRole = "customer" | "assistant" | "human";

export type CustomerServiceCaseExcerptTurn = {
  role: CustomerServiceCaseRole;
  text: string;
  source_message_id?: string;
};

export type CustomerServiceCaseApplicability = {
  intents: string[];
  brand: string | null;
  effective_from: string;
  effective_to: string | null;
};

export type CustomerServiceCaseInput = {
  title: string;
  scenario_context: string;
  known_information: Record<string, unknown>;
  missing_information: string[];
  conversation_excerpt: CustomerServiceCaseExcerptTurn[];
  response_strategy: Record<string, unknown>;
  applicability: {
    intents?: unknown;
    brand?: unknown;
    effective_from?: unknown;
    effective_to?: unknown;
  };
  environment: string;
  source_message_ids: string[];
  source_fingerprint?: string;
  outcome?: string;
  outcome_evidence?: Record<string, unknown>;
  provenance?: string;
  is_synthetic?: boolean;
};

export type NormalizedCustomerServiceCase = {
  title: string;
  scenario_context: string;
  known_information: Record<string, unknown>;
  missing_information: string[];
  conversation_excerpt: CustomerServiceCaseExcerptTurn[];
  response_strategy: Record<string, unknown>;
  applicability: CustomerServiceCaseApplicability;
  environment: string;
  source_message_ids: string[];
  source_fingerprint: string;
  outcome: CustomerServiceCaseOutcome;
  outcome_evidence: Record<string, unknown>;
  provenance: CustomerServiceCaseProvenance;
  is_synthetic: boolean;
};

export type ParseResult =
  | { ok: true; value: NormalizedCustomerServiceCase }
  | { ok: false; errors: string[] };

const ISO_WITH_ZONE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/;
const ROLES: CustomerServiceCaseRole[] = ["customer", "assistant", "human"];
const PROVENANCE: CustomerServiceCaseProvenance[] = ["manual", "learned_human", "learned_bot"];
const OUTCOMES: CustomerServiceCaseOutcome[] = ["unknown", "positive", "negative"];

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function sanitize(value: string): string {
  return sanitizeCustomerServiceContextText(String(value ?? "")).trim();
}

/** Redact strings anywhere inside a nested JSON object/array. */
function sanitizeDeep(value: unknown): unknown {
  if (typeof value === "string") return sanitize(value);
  if (Array.isArray(value)) return value.map(sanitizeDeep);
  if (isPlainObject(value)) {
    const output: Record<string, unknown> = {};
    for (const [key, entry] of Object.entries(value)) output[key] = sanitizeDeep(entry);
    return output;
  }
  return value;
}

/**
 * FNV-1a 64-bit. Stable, dependency-free and good enough for a dedupe key; it
 * is never an authorization token.
 */
export function caseFingerprint(value: string): string {
  let hash = 0xcbf29ce484222325n;
  const prime = 0x100000001b3n;
  const mask = 0xffffffffffffffffn;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= BigInt(value.charCodeAt(index));
    hash = (hash * prime) & mask;
  }
  return hash.toString(16).padStart(16, "0");
}

/** Stable serialisation for hashing and dedupe (object keys sorted). */
export function canonicalCaseJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalCaseJson).join(",")}]`;
  if (isPlainObject(value)) {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalCaseJson(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value ?? null);
}

/**
 * Dedupe key: real cases key on their source messages, synthetic fixtures on
 * their normalized guidance content. Same environment + fingerprint is a rerun
 * and must not create a second case.
 */
export function caseSourceFingerprint(input: {
  environment: string;
  source_message_ids: string[];
  is_synthetic: boolean;
  content: unknown;
}): string {
  if (!input.is_synthetic && input.source_message_ids.length) {
    return caseFingerprint(`${input.environment}\u0000src\u0000${[...input.source_message_ids].sort().join(",")}`);
  }
  return caseFingerprint(`${input.environment}\u0000content\u0000${canonicalCaseJson(input.content)}`);
}

function stringArray(value: unknown, source: string, errors: string[], field: string): string[] {
  if (!Array.isArray(value)) {
    errors.push(`${field}_must_be_array`);
    return [];
  }
  const entries = value.map((item) => (typeof item === "string" ? item.trim() : "")).filter(Boolean);
  if (entries.length !== value.length) errors.push(`${field}_has_empty_entry`);
  if (source === "missing_information") return [...new Set(entries)];
  return entries;
}

export function parseCustomerServiceCaseInput(
  raw: CustomerServiceCaseInput,
  options: { expectedEnvironment?: string } = {},
): ParseResult {
  const errors: string[] = [];
  if (!isPlainObject(raw)) return { ok: false, errors: ["input_must_be_object"] };

  const environment = String(raw.environment ?? "").trim();
  if (!environment) errors.push("environment_required");
  if (options.expectedEnvironment && environment !== options.expectedEnvironment) {
    errors.push("environment_mismatch");
  }
  const isSynthetic = raw.is_synthetic === true;
  if (isSynthetic && environment === "production") errors.push("synthetic_forbidden_in_production");

  const provenance = (typeof raw.provenance === "string" ? raw.provenance : "manual") as CustomerServiceCaseProvenance;
  if (!PROVENANCE.includes(provenance)) errors.push("provenance_invalid");
  if (provenance === "learned_bot") errors.push("learned_bot_not_allowed_in_phase1");

  const sourceMessageIds = stringArray(raw.source_message_ids ?? [], "source_message_ids", errors, "source_message_ids");
  if (isSynthetic && sourceMessageIds.length) errors.push("synthetic_must_not_claim_source_messages");
  if (provenance === "learned_human" && sourceMessageIds.length === 0) {
    errors.push("learned_human_requires_source_message_ids");
  }
  if (provenance === "manual" && !isSynthetic && sourceMessageIds.length === 0) {
    errors.push("manual_case_requires_source_message_ids_or_synthetic_flag");
  }

  const outcome = (typeof raw.outcome === "string" ? raw.outcome : "unknown") as CustomerServiceCaseOutcome;
  if (!OUTCOMES.includes(outcome)) errors.push("outcome_invalid");
  const outcomeEvidence = isPlainObject(raw.outcome_evidence) ? sanitizeDeep(raw.outcome_evidence) as Record<string, unknown> : {};
  if (outcome === "positive" && Object.keys(outcomeEvidence).length === 0) {
    errors.push("positive_outcome_requires_evidence");
  }

  const title = sanitize(raw.title);
  if (!title) errors.push("title_required");
  const scenarioContext = sanitize(raw.scenario_context);
  if (!scenarioContext) errors.push("scenario_context_required");

  const knownInformation = isPlainObject(raw.known_information)
    ? sanitizeDeep(raw.known_information) as Record<string, unknown>
    : {};
  const responseStrategy = isPlainObject(raw.response_strategy)
    ? sanitizeDeep(raw.response_strategy) as Record<string, unknown>
    : {};
  const missingInformation = stringArray(raw.missing_information ?? [], "missing_information", errors, "missing_information");

  const excerpt: CustomerServiceCaseExcerptTurn[] = [];
  if (!Array.isArray(raw.conversation_excerpt)) {
    errors.push("conversation_excerpt_must_be_array");
  } else {
    for (const [index, entry] of raw.conversation_excerpt.entries()) {
      if (!isPlainObject(entry)) {
        errors.push(`conversation_excerpt_${index}_must_be_object`);
        continue;
      }
      const role = entry.role as CustomerServiceCaseRole;
      if (!ROLES.includes(role)) {
        errors.push(`conversation_excerpt_${index}_role_invalid`);
        continue;
      }
      const text = sanitize(String(entry.text ?? ""));
      if (!text) {
        errors.push(`conversation_excerpt_${index}_text_required`);
        continue;
      }
      const turn: CustomerServiceCaseExcerptTurn = { role, text };
      const sourceMessageId = typeof entry.source_message_id === "string" ? entry.source_message_id.trim() : "";
      if (sourceMessageId) turn.source_message_id = sourceMessageId;
      excerpt.push(turn);
    }
  }

  const applicabilityRaw = isPlainObject(raw.applicability) ? raw.applicability : {};
  const intents = stringArray(applicabilityRaw.intents ?? [], "applicability_intents", errors, "applicability_intents");
  const brandRaw = applicabilityRaw.brand;
  const brand = typeof brandRaw === "string" && brandRaw.trim() ? brandRaw.trim() : null;
  const effectiveFrom = String(applicabilityRaw.effective_from ?? "").trim();
  if (!ISO_WITH_ZONE.test(effectiveFrom)) errors.push("applicability_effective_from_invalid");
  const effectiveToRaw = applicabilityRaw.effective_to;
  const effectiveTo = typeof effectiveToRaw === "string" && effectiveToRaw.trim() ? effectiveToRaw.trim() : null;
  if (effectiveTo !== null && !ISO_WITH_ZONE.test(effectiveTo)) errors.push("applicability_effective_to_invalid");
  if (effectiveFrom && effectiveTo && Date.parse(effectiveTo) <= Date.parse(effectiveFrom)) {
    errors.push("applicability_window_invalid");
  }

  if (intents.length === 0) errors.push("applicability_intents_required");

  const sourceFingerprint = typeof raw.source_fingerprint === "string" && raw.source_fingerprint.trim()
    ? raw.source_fingerprint.trim()
    : caseSourceFingerprint({
      environment, source_message_ids: sourceMessageIds, is_synthetic: isSynthetic,
      content: { title, scenarioContext, knownInformation, missingInformation, responseStrategy, excerpt,
        applicability: { intents, brand, effective_from: effectiveFrom, effective_to: effectiveTo } },
    });

  if (errors.length) return { ok: false, errors };

  return {
    ok: true,
    value: {
      title,
      scenario_context: scenarioContext,
      known_information: knownInformation,
      missing_information: missingInformation,
      conversation_excerpt: excerpt,
      response_strategy: responseStrategy,
      applicability: { intents, brand, effective_from: effectiveFrom, effective_to: effectiveTo },
      environment,
      source_message_ids: sourceMessageIds,
      source_fingerprint: sourceFingerprint,
      outcome,
      outcome_evidence: outcomeEvidence,
      provenance,
      is_synthetic: isSynthetic,
    },
  };
}

function flattenValue(value: unknown): string {
  if (typeof value === "string") return value.trim();
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (Array.isArray(value)) return value.map(flattenValue).filter(Boolean).join("、");
  if (isPlainObject(value)) {
    return Object.entries(value).map(([key, entry]) => `${key}: ${flattenValue(entry)}`).filter((line) => !line.endsWith(":")).join("；");
  }
  return "";
}

/**
 * Embedding input matches spec 06: scenario, known/missing information,
 * strategy and short applicability labels. The full excerpt is deliberately
 * excluded so old identities, prices or one-off offers are never embedded.
 */
export type CaseEmbeddingSource = {
  scenario_context: string;
  known_information: Record<string, unknown>;
  missing_information: string[];
  response_strategy: Record<string, unknown>;
  applicability: { intents: string[]; brand: string | null };
};

export function buildCaseEmbeddingText(value: CaseEmbeddingSource): string {
  const known = Object.entries(value.known_information)
    .map(([key, entry]) => `${key}: ${flattenValue(entry)}`)
    .filter((line) => !line.endsWith(":"));
  const strategy = Object.entries(value.response_strategy)
    .map(([key, entry]) => `${key}: ${flattenValue(entry)}`)
    .filter((line) => !line.endsWith(":"));
  const labels = [
    value.applicability.intents.length ? `intents: ${value.applicability.intents.join("、")}` : "",
    value.applicability.brand ? `brand: ${value.applicability.brand}` : "",
  ].filter(Boolean);
  return [
    value.scenario_context,
    known.length ? `已知資訊：${known.join("；")}` : "",
    value.missing_information.length ? `缺少資訊：${value.missing_information.join("、")}` : "",
    strategy.length ? `應對方式：${strategy.join("；")}` : "",
    labels.join("；"),
  ].filter(Boolean).join("\n").slice(0, 6_000);
}

export type CaseResponseExample = {
  caseId: string;
  revision: number;
  scenario: string;
  guidance: Record<string, unknown>;
  missingInformation: string[];
};

/**
 * Online projection handed to the composer/fallback. Keeps only response
 * guidance plus the scenario; historical slot values and outcomes stay out.
 */
export function toCaseResponseExample(row: {
  id: string;
  revision: number;
  scenario_context: string;
  response_strategy: Record<string, unknown> | null;
  missing_information: string[] | null;
}): CaseResponseExample {
  return {
    caseId: row.id,
    revision: Number(row.revision) || 0,
    scenario: sanitize(row.scenario_context),
    guidance: sanitizeDeep(row.response_strategy ?? {}) as Record<string, unknown>,
    missingInformation: (row.missing_information ?? []).map((item) => sanitize(String(item))).filter(Boolean),
  };
}
