import { describe, expect, it } from "vitest";

import {
  buildReportAiProviderRequest,
  canonicalReportAiEvidence,
  sameReportAiScalar,
  textNumbersAreSupported,
} from "../supabase/functions/_shared/report-ai-provider";
import i18n from "@/i18n";

import {
  compactReportAiSnapshot,
  consumeReportAiEventStream,
  createReportAiFallback,
  reportAiSnapshotFingerprint,
  type ReportAiSnapshot,
} from "@/lib/report-ai";

function snapshot(overrides: Partial<ReportAiSnapshot> = {}): ReportAiSnapshot {
  return {
    filters: { year: 2026 },
    currentAggregates: [
      {
        productName: "Chicken",
        customerName: "Private customer",
        amount: 120,
        email: "private@example.com",
      },
    ],
    completeness: { status: "complete" },
    ...overrides,
  };
}

describe("report AI snapshot seam", () => {
  it("keeps business dimensions while removing identifying fields", () => {
    const compact = compactReportAiSnapshot(snapshot());

    expect(compact.currentAggregates[0]).toEqual({
      productName: "Chicken",
      amount: 120,
    });
  });

  it("caps detail rows before invoking the model", () => {
    const compact = compactReportAiSnapshot(
      snapshot({
        detailRows: Array.from({ length: 140 }, (_, index) => ({ index })),
      }),
    );

    expect(compact.detailRows).toHaveLength(100);
  });

  it("changes the cache fingerprint when filters or data change", () => {
    const baseline = reportAiSnapshotFingerprint(snapshot());
    const changedFilter = reportAiSnapshotFingerprint(
      snapshot({ filters: { year: 2025 } }),
    );
    const changedData = reportAiSnapshotFingerprint(
      snapshot({ currentAggregates: [{ amount: 121 }] }),
    );

    expect(changedFilter).not.toBe(baseline);
    expect(changedData).not.toBe(baseline);
  });

  it("creates a fallback whose numbers point to exact evidence paths", () => {
    const result = createReportAiFallback(snapshot());

    expect(result.status).toBe("fallback");
    expect(result.trends[0]?.evidence[0]).toEqual({
      label: "amount",
      value: 120,
      source: "currentAggregates[0].amount",
    });
  });

  it("delivers AI draft text before the final interpretation", async () => {
    const encoder = new TextEncoder();
    const response = new Response(
      new ReadableStream({
        start(controller) {
          controller.enqueue(encoder.encode('event: status\ndata: {"stage":"generating"}\n\n'));
          controller.enqueue(encoder.encode('event: draft\ndata: {"text":"銷售趨勢正在形成"}\n\n'));
          controller.enqueue(encoder.encode(`event: result\ndata: ${JSON.stringify({
            status: "complete",
            headline: "銷售表現保持穩定",
            trends: [],
            anomalies: [],
            limitations: [],
            coverage: { summaryRows: 1, comparisonRows: 0, detailRows: 0, truncated: false },
            generatedAt: "2026-08-23T12:00:00.000Z",
          })}\n\n`));
          controller.close();
        },
      }),
      { headers: { "Content-Type": "text/event-stream" } },
    );
    const progress: string[] = [];

    const result = await consumeReportAiEventStream(response, (event) => {
      if (event.type === "draft") progress.push(event.text);
    });

    expect(progress).toEqual(["銷售趨勢正在形成"]);
    expect(result.headline).toBe("銷售表現保持穩定");
  });

  it("allows enough output for evidence-rich advertising interpretations", () => {
    const request = buildReportAiProviderRequest({
      model: "deepseek-v4-flash",
      systemPrompt: "Return one JSON object",
      reportContext: { currentAggregates: Array.from({ length: 81 }, (_, index) => ({ index })) },
    });

    expect(request.stream).toBe(true);
    expect(request.max_tokens).toBeGreaterThanOrEqual(6_000);
  });

  it("accepts display-formatted numbers only when their numeric value is exact", () => {
    expect(sameReportAiScalar("82,258", 82258)).toBe(true);
    expect(sameReportAiScalar("82,259", 82258)).toBe(false);
  });

  it("grounds years and months against the same evidence rows", () => {
    const text = "non-peak 1月銷售額在2026年上升至82,258。";

    expect(textNumbersAreSupported(text, [1, 2026, 82258])).toBe(true);
    expect(textNumbersAreSupported(text, [1, 2025, 82258])).toBe(false);
  });

  it("repairs a wrong array index only when the evidence value has one exact match", () => {
    const canonical = canonicalReportAiEvidence(
      {
        currentAggregates: [
          { year: 2022, amount: 200485.2 },
          { year: 2022, amount: 109134 },
        ],
      },
      "currentAggregates[0].amount",
      109134,
    );

    expect(canonical).toEqual({
      source: "currentAggregates[1].amount",
      value: 109134,
    });
    expect(canonicalReportAiEvidence(
      { currentAggregates: [{ amount: 109134 }, { amount: 109134 }] },
      "currentAggregates[0].amount",
      109134,
    )).toEqual({ source: "currentAggregates[0].amount", value: 109134 });
  });

  it("describes partial results as using the currently available data", () => {
    expect(i18n.t("reports.ai.partial", { lng: "zh-HK" }))
      .toBe("有限分析：根據目前可用資料");
    expect(i18n.t("reports.ai.partial", { lng: "en" }))
      .toBe("Limited analysis based on the currently available data");
  });
});
