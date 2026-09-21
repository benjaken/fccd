import { readFile } from "node:fs/promises";

/**
 * Thin CLI over the controlled `customer-service-cases-admin` command.
 * All shape validation, redaction and idempotency live in the trusted function
 * so there is a single source of truth. Supports dry-run and explicit
 * environment; never writes real transcripts into the repository.
 */
const args = process.argv.slice(2);
const option = (name) => { const index = args.indexOf(name); return index < 0 ? undefined : args[index + 1]; };
const flag = (name) => args.includes(name);

const input = option("--input");
const action = flag("--activate") ? "activate" : flag("--retire") ? "retire" : flag("--list") ? "list" : "upsert";
const dryRun = flag("--dry-run");
const environment = option("--environment") ?? process.env.CUSTOMER_SERVICE_ENVIRONMENT ?? "develop";
const caseId = option("--id");
const reason = option("--reason");
const limit = option("--limit");
const url = (option("--url") ?? process.env.CUSTOMER_SERVICE_CASES_URL ?? process.env.SUPABASE_URL ?? "").replace(/\/+$/, "");
const token = option("--token") ?? process.env.CUSTOMER_SERVICE_CASES_TOKEN ?? process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
const cronSecret = option("--cron-secret") ?? process.env.CUSTOMER_SERVICE_REPORT_CRON_SECRET ?? "";

function usage() {
  console.log([
    "Usage:",
    '  npm run cases:import -- --input case.json [--dry-run] [--environment develop]',
    "  npm run cases:import -- --activate --id <uuid>",
    "  npm run cases:import -- --retire --id <uuid> [--reason text]",
    "  npm run cases:import -- --list [--limit 50]",
    "",
    "Env: SUPABASE_URL (or CUSTOMER_SERVICE_CASES_URL),",
    "     SUPABASE_SERVICE_ROLE_KEY (or CUSTOMER_SERVICE_CASES_TOKEN),",
    "     optional CUSTOMER_SERVICE_REPORT_CRON_SECRET.",
  ].join("\n"));
}

async function readCases(path) {
  if (!path) return [];
  const source = await readFile(path, "utf8");
  if (source.length > 2_000_000) throw new Error("Input exceeds 2 MB; split it into individual cases");
  const parsed = JSON.parse(source);
  return Array.isArray(parsed) ? parsed : [parsed];
}

async function invoke(body) {
  if (!url || !token) throw new Error("SUPABASE_URL and service token are required");
  const response = await fetch(`${url}/functions/v1/customer-service-cases-admin`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...(cronSecret ? { "x-cron-secret": cronSecret } : {}),
    },
    body: JSON.stringify({ environment, ...body }),
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok || payload?.ok === false) {
    const detail = payload?.errors ? payload.errors.join(", ") : payload?.error ?? `HTTP ${response.status}`;
    throw new Error(`${body.action} failed: ${detail}`);
  }
  return payload;
}

try {
  if (action === "list") {
    console.log(JSON.stringify(await invoke({ action: "list", limit: limit ? Number(limit) : undefined }), null, 2));
  } else if (action === "activate" || action === "retire") {
    if (!caseId) throw new Error("--id is required");
    console.log(JSON.stringify(await invoke({ action, case_id: caseId, reason }), null, 2));
  } else {
    const cases = await readCases(input);
    if (!cases.length) throw new Error("--input is required for upsert");
    const effectiveAction = dryRun ? "dry_run" : "upsert";
    let failed = 0;
    for (const [index, entry] of cases.entries()) {
      try {
        const result = await invoke({ action: effectiveAction, case: entry });
        console.log(`[${index + 1}/${cases.length}] ${effectiveAction} ${result.id ?? result.fingerprint ?? ""} changed=${result.changed ?? "-"}`);
      } catch (error) {
        failed += 1;
        console.error(`[${index + 1}/${cases.length}] ${error instanceof Error ? error.message : error}`);
      }
    }
    if (failed) process.exitCode = 1;
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : "Import failed");
  if (!input && action === "upsert") usage();
  process.exitCode = 1;
}
