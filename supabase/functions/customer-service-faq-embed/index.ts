import { createClient } from "npm:@supabase/supabase-js@2";

import {
  buildFaqEmbeddingText,
  faqEmbeddingContentHash,
} from "../_shared/customer-service-embedding-content.ts";
import {
  customerServiceEmbeddingConfig,
  embedCustomerServiceTexts,
} from "../_shared/customer-service-embedding.ts";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
  });
}

function env(name: string) {
  return Deno.env.get(name)?.trim() || "";
}

function serviceRoleKey() {
  if (env("SUPABASE_SERVICE_ROLE_KEY")) return env("SUPABASE_SERVICE_ROLE_KEY");
  const configured = env("SUPABASE_SECRET_KEYS");
  const keys = configured ? JSON.parse(configured) as Record<string, string> : {};
  if (!keys.default) throw new Error("missing_supabase_service_role_key");
  return keys.default;
}

type FaqRow = {
  id: string;
  question: string;
  answer: string;
  content_hash: string | null;
  embedding_status: string;
};

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: CORS_HEADERS });
  if (request.method !== "POST") return json({ error: "method_not_allowed" }, 405);
  const authorization = request.headers.get("authorization")?.trim() || "";
  if (!/^Bearer\s+\S+/i.test(authorization)) return json({ error: "authentication_required" }, 401);

  const url = env("SUPABASE_URL");
  const serviceKey = serviceRoleKey();
  const bearer = authorization.replace(/^Bearer\s+/i, "");
  // Scheduled/internal calls authenticate with the service-role key; interactive
  // calls must additionally hold the FAQ edit page permission.
  if (bearer !== serviceKey) {
    const user = createClient(url, env("SUPABASE_ANON_KEY"), {
      global: { headers: { Authorization: authorization } },
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { error: accessError } = await user.rpc("customer_service_edit_access_check");
    if (accessError) return json({ error: "page_access_required" }, 403);
  }

  let payload: Record<string, unknown> = {};
  try {
    payload = await request.json() as Record<string, unknown>;
  } catch {
    payload = {};
  }
  const faqIds = Array.isArray(payload.faq_ids)
    ? payload.faq_ids.filter((id): id is string => typeof id === "string" && id.trim() !== "")
    : [];
  const force = payload.force === true;
  const requestedLimit = Number(payload.limit || 250);
  const limit = Math.max(1, Math.min(Number.isFinite(requestedLimit) ? requestedLimit : 250, 500));

  const embeddingConfig = customerServiceEmbeddingConfig();
  if (!embeddingConfig.enabled) return json({ error: "embedding_not_configured" }, 503);

  const admin = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  let targetQuery = admin
    .from("customer_faqs")
    .select("id,question,answer,content_hash,embedding_status")
    .eq("is_published", true);
  if (faqIds.length) targetQuery = targetQuery.in("id", faqIds);
  const { data: faqRows, error: faqError } = await targetQuery
    .order("sort_order")
    .limit(limit);
  if (faqError) return json({ error: "faq_query_failed", detail: faqError.message }, 500);
  const faqs = (faqRows ?? []) as FaqRow[];

  const aliasByFaq = new Map<string, string[]>();
  if (faqs.length) {
    const { data: aliasRows } = await admin
      .from("customer_faq_aliases")
      .select("faq_id,alias_text")
      .eq("alias_type", "similar")
      .eq("is_active", true)
      .in("faq_id", faqs.map((faq) => faq.id));
    for (const row of (aliasRows ?? []) as Array<{ faq_id: string; alias_text: string }>) {
      const list = aliasByFaq.get(row.faq_id) ?? [];
      list.push(row.alias_text);
      aliasByFaq.set(row.faq_id, list);
    }
  }

  const pending = faqs.map((faq) => {
    const text = buildFaqEmbeddingText({
      question: faq.question,
      aliases: aliasByFaq.get(faq.id) ?? [],
    });
    return { faq, text, hash: faqEmbeddingContentHash(text) };
  });
  const targets = force
    ? pending
    : pending.filter((item) =>
      item.faq.embedding_status !== "ready" || item.faq.content_hash !== item.hash
    );

  if (!targets.length) {
    return json({ scanned: faqs.length, embedded: 0, skipped: faqs.length, failed: 0 });
  }

  let embeddings: number[][];
  try {
    embeddings = await embedCustomerServiceTexts(targets.map((item) => item.text), {
      config: embeddingConfig,
    });
  } catch (error) {
    const detail = error instanceof Error ? error.message.slice(0, 200) : String(error);
    await admin
      .from("customer_faqs")
      .update({ embedding_status: "failed" })
      .in("id", targets.map((item) => item.faq.id));
    return json({ error: "embedding_failed", detail }, 502);
  }

  let embedded = 0;
  const failures: string[] = [];
  for (const [index, item] of targets.entries()) {
    const embedding = embeddings[index];
    // Guard the fixed-width vector column: a provider/dimension mismatch must
    // mark the row failed instead of aborting the whole batch.
    if (!embedding?.length || embedding.length !== embeddingConfig.dimensions) {
      failures.push(item.faq.id);
      continue;
    }
    const { error: upsertError } = await admin
      .from("customer_faq_embeddings")
      .upsert({
        faq_id: item.faq.id,
        source_type: "question",
        source_id: "question",
        embedding: JSON.stringify(embedding),
        model: embeddingConfig.model,
        content_hash: item.hash,
        updated_at: new Date().toISOString(),
      }, { onConflict: "faq_id,source_type,source_id" });
    if (upsertError) {
      failures.push(item.faq.id);
      continue;
    }
    await admin
      .from("customer_faqs")
      .update({
        embedding_status: "ready",
        content_hash: item.hash,
        embedding_updated_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", item.faq.id);
    embedded += 1;
  }
  if (failures.length) {
    await admin.from("customer_faqs").update({ embedding_status: "failed" }).in("id", failures);
  }

  return json({
    scanned: faqs.length,
    embedded,
    skipped: faqs.length - targets.length,
    failed: failures.length,
  });
});
