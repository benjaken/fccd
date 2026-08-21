import fs from "node:fs";
import path from "node:path";

const args = new Set(process.argv.slice(2));
const apply = args.has("--apply");
const sinceArg = process.argv.slice(2).find((arg) => arg.startsWith("--since="));
const since = sinceArg?.slice("--since=".length) || "2026-08-12T00:00:00.000Z";
const bubbleBase = "https://cs.foodchannels-catering.com/api/1.1/obj";

function loadEnv(filePath) {
  const values = {};
  for (const rawLine of fs.readFileSync(filePath, "utf8").split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const separator = line.indexOf("=");
    if (separator < 1) continue;
    const key = line.slice(0, separator).trim();
    let value = line.slice(separator + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    values[key] = value;
  }
  return values;
}

function jwtPayload(token) {
  return JSON.parse(Buffer.from(token.split(".")[1], "base64url").toString("utf8"));
}

async function fetchJson(url, options = {}) {
  const response = await fetch(url, options);
  const text = await response.text();
  let body;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = text;
  }
  if (!response.ok) {
    throw new Error(`${options.method || "GET"} ${url} failed (${response.status}): ${text.slice(0, 500)}`);
  }
  return body;
}

async function fetchBubbleAll(type, constraints) {
  const results = [];
  let cursor = 0;
  while (true) {
    const params = new URLSearchParams({
      constraints: JSON.stringify(constraints),
      cursor: String(cursor),
      limit: "100",
    });
    const body = await fetchJson(`${bubbleBase}/${type}?${params}`);
    const page = body?.response?.results || [];
    results.push(...page);
    const remaining = body?.response?.remaining ?? 0;
    if (!page.length || remaining <= 0) break;
    cursor += page.length;
  }
  return results;
}

function chunks(values, size = 80) {
  const result = [];
  for (let i = 0; i < values.length; i += size) result.push(values.slice(i, i + size));
  return result;
}

function encodeIn(values) {
  return `(${values.map((value) => `"${String(value).replaceAll('"', '\\"')}"`).join(",")})`;
}

async function main() {
  if (Number.isNaN(Date.parse(since))) throw new Error(`Invalid --since date: ${since}`);

  const env = loadEnv(path.resolve(".env.local"));
  const supabaseUrl = env.VITE_SUPABASE_URL;
  const anonKey = env.VITE_SUPABASE_PUBLISHABLE_KEY;
  const email = env.VITE_QUICK_LOGIN_EMAIL;
  const password = env.VITE_QUICK_LOGIN_PASSWORD;
  if (!supabaseUrl || !anonKey || !email || !password) {
    throw new Error("Missing Supabase URL/key or quick-login credentials in .env.local");
  }

  const auth = await fetchJson(`${supabaseUrl}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { apikey: anonKey, "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  const accessToken = auth.access_token;
  const payload = jwtPayload(accessToken);
  const role = payload?.app_metadata?.role || payload?.user_metadata?.role || "Unknown";
  if (apply && !["Super Admin", "Admin"].includes(role)) {
    throw new Error(`Refusing to apply with role ${role}; Admin or Super Admin is required`);
  }

  const restHeaders = {
    apikey: anonKey,
    Authorization: `Bearer ${accessToken}`,
    "Content-Type": "application/json",
  };
  const restGet = (resourceAndQuery) =>
    fetchJson(`${supabaseUrl}/rest/v1/${resourceAndQuery}`, { headers: restHeaders });

  const modifiedSince = { key: "Modified Date", constraint_type: "greater than", value: since };
  const [sourceOrders, sourceLines] = await Promise.all([
    fetchBubbleAll("a_order", [
      { key: "Factory_date2_Print", constraint_type: "not equal", value: null },
      modifiedSince,
    ]),
    fetchBubbleAll("s_order", [
      { key: "Printed", constraint_type: "equals", value: true },
      modifiedSince,
    ]),
  ]);

  const orderLegacyIds = [...new Set(sourceOrders.map((row) => row._id).filter(Boolean))];
  const lineLegacyIds = [...new Set(sourceLines.map((row) => row._id).filter(Boolean))];
  const targetOrders = [];
  const targetLines = [];

  for (const group of chunks(orderLegacyIds)) {
    const query = new URLSearchParams({
      select: "id,legacy_id,order_number,factory_print_date,factory_reprint_required",
      legacy_id: `in.${encodeIn(group)}`,
    });
    targetOrders.push(...(await restGet(`orders?${query}`)));
  }
  for (const group of chunks(lineLegacyIds)) {
    const query = new URLSearchParams({
      select: "id,legacy_id,order_id,is_printed,is_void",
      legacy_id: `in.${encodeIn(group)}`,
    });
    targetLines.push(...(await restGet(`order_lines?${query}`)));
  }

  const targetOrderByLegacy = new Map(targetOrders.map((row) => [row.legacy_id, row]));
  const targetLineByLegacy = new Map(targetLines.map((row) => [row.legacy_id, row]));
  const orderUpdates = sourceOrders
    .map((source) => ({ source, target: targetOrderByLegacy.get(source._id) }))
    .filter(({ source, target }) => target && source.Factory_date2_Print && !target.factory_print_date);
  const lineUpdates = sourceLines
    .map((source) => ({ source, target: targetLineByLegacy.get(source._id) }))
    .filter(({ source, target }) => target && source.Printed === true && source.Void !== true && !target.is_void && !target.is_printed);

  const affectedOrderIds = [...new Set(lineUpdates.map(({ target }) => target.order_id).filter(Boolean))];
  const affectedOrders = [];
  for (const group of chunks(affectedOrderIds)) {
    const query = new URLSearchParams({ select: "id,order_number", id: `in.${encodeIn(group)}` });
    affectedOrders.push(...(await restGet(`orders?${query}`)));
  }
  const orderNumberById = new Map(affectedOrders.map((row) => [row.id, row.order_number]));
  const affectedNumbers = [...new Set([
    ...orderUpdates.map(({ target }) => target.order_number),
    ...lineUpdates.map(({ target }) => orderNumberById.get(target.order_id)),
  ].filter(Boolean))].sort();

  const p1143 = targetOrders.find((row) => row.order_number === "P-1143");
  const p1143LineUpdates = p1143 ? lineUpdates.filter(({ target }) => target.order_id === p1143.id).length : 0;
  const preview = {
    mode: apply ? "apply" : "dry-run",
    since,
    authenticatedRole: role,
    sourcePrintedOrders: sourceOrders.length,
    sourcePrintedLines: sourceLines.length,
    matchedOrders: targetOrders.length,
    matchedLines: targetLines.length,
    orderDatesToBackfill: orderUpdates.length,
    lineStatusesToBackfill: lineUpdates.length,
    affectedOrderCount: affectedNumbers.length,
    affectedOrders: affectedNumbers,
    p1143: {
      found: Boolean(p1143),
      printDateToBackfill: orderUpdates.some(({ target }) => target.id === p1143?.id),
      lineStatusesToBackfill: p1143LineUpdates,
    },
  };
  console.log(JSON.stringify(preview, null, 2));

  if (!apply) return;

  let appliedLineUpdates = 0;
  for (const group of chunks(lineUpdates.map(({ target }) => target.legacy_id), 50)) {
    const query = new URLSearchParams({
      legacy_id: `in.${encodeIn(group)}`,
      is_printed: "eq.false",
      is_void: "eq.false",
      select: "id,legacy_id,is_printed",
    });
    const updated = await fetchJson(`${supabaseUrl}/rest/v1/order_lines?${query}`, {
      method: "PATCH",
      headers: { ...restHeaders, Prefer: "return=representation" },
      body: JSON.stringify({ is_printed: true }),
    });
    appliedLineUpdates += updated.length;
  }

  let appliedOrderUpdates = 0;
  for (const { source, target } of orderUpdates) {
    const query = new URLSearchParams({
      legacy_id: `eq.${target.legacy_id}`,
      factory_print_date: "is.null",
      select: "id,order_number,factory_print_date",
    });
    const updated = await fetchJson(`${supabaseUrl}/rest/v1/orders?${query}`, {
      method: "PATCH",
      headers: { ...restHeaders, Prefer: "return=representation" },
      body: JSON.stringify({ factory_print_date: source.Factory_date2_Print }),
    });
    appliedOrderUpdates += updated.length;
  }

  const p1143Rows = await restGet(
    "orders?select=id,order_number,factory_print_date,factory_reprint_required&order_number=eq.P-1143",
  );
  const verifiedP1143 = p1143Rows[0];
  const verifiedP1143Lines = verifiedP1143
    ? await restGet(`order_lines?select=id,is_printed,is_void&order_id=eq.${verifiedP1143.id}`)
    : [];
  const activeP1143Lines = verifiedP1143Lines.filter((row) => !row.is_void);

  const verification = {
    appliedOrderDates: appliedOrderUpdates,
    appliedLineStatuses: appliedLineUpdates,
    expectedOrderDates: orderUpdates.length,
    expectedLineStatuses: lineUpdates.length,
    p1143: {
      factoryPrintDate: verifiedP1143?.factory_print_date || null,
      factoryReprintRequired: verifiedP1143?.factory_reprint_required ?? null,
      activeLines: activeP1143Lines.length,
      printedActiveLines: activeP1143Lines.filter((row) => row.is_printed).length,
    },
  };
  console.log(JSON.stringify(verification, null, 2));

  if (appliedOrderUpdates !== orderUpdates.length || appliedLineUpdates !== lineUpdates.length) {
    throw new Error("Applied row count differs from the dry-run count");
  }
  if (!verifiedP1143?.factory_print_date || activeP1143Lines.some((row) => !row.is_printed)) {
    throw new Error("P-1143 verification failed");
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
