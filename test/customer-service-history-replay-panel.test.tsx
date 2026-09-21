import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const api = vi.hoisted(() => ({
  fetchCustomerServiceHistoryReplayRuns: vi.fn(),
  fetchCustomerServiceHistoryReplaySamples: vi.fn(),
  fetchCustomerServiceRepairProposals: vi.fn(),
  runCustomerServiceHistoryAutoRepair: vi.fn(),
  proposeCustomerServiceHistoryRepair: vi.fn(),
  reviewCustomerServiceRepairProposal: vi.fn(),
  validateCustomerServiceRepairProposal: vi.fn(),
  applyCustomerServiceRepairProposal: vi.fn(),
  rollbackCustomerServiceRepairProposal: vi.fn(),
  startCustomerServiceHistoryReplay: vi.fn(),
  processCustomerServiceHistoryReplay: vi.fn(),
  judgeCustomerServiceHistoryReplay: vi.fn(),
}));

vi.mock("@/lib/customer-faq", () => api);

import { CustomerServiceHistoryReplayPanel } from "@/components/settings/CustomerServiceHistoryReplayPanel";

const run = {
  id: "run-1", environment: "develop", scope: "answer_quality", status: "partial",
  planned: 10, processed: 4, scored: 3, failed: 1, skipped: 0,
  completeSampleSet: false, createdAt: "2026-09-19T02:00:00.000Z", completedAt: null,
};

describe("CustomerServiceHistoryReplayPanel", () => {
  beforeEach(() => {
    api.fetchCustomerServiceHistoryReplayRuns.mockReset();
    api.fetchCustomerServiceHistoryReplaySamples.mockReset();
    api.fetchCustomerServiceRepairProposals.mockReset();
    api.runCustomerServiceHistoryAutoRepair.mockReset();
    api.proposeCustomerServiceHistoryRepair.mockReset();
    api.reviewCustomerServiceRepairProposal.mockReset();
    api.validateCustomerServiceRepairProposal.mockReset();
    api.applyCustomerServiceRepairProposal.mockReset();
    api.rollbackCustomerServiceRepairProposal.mockReset();
    api.startCustomerServiceHistoryReplay.mockReset();
    api.processCustomerServiceHistoryReplay.mockReset();
    api.judgeCustomerServiceHistoryReplay.mockReset();
    api.fetchCustomerServiceHistoryReplaySamples.mockResolvedValue([]);
    api.fetchCustomerServiceRepairProposals.mockResolvedValue([]);
    api.runCustomerServiceHistoryAutoRepair.mockResolvedValue({ results: [] });
  });

  const expandAllConversations = async () => {
    const headers = screen.getAllByRole("button", { name: /^(對話 \d+|獨立決策點)/ });
    for (const header of headers) {
      await userEvent.click(header);
    }
  };

  it("runs processing then judging from a single click and shows a real log", async () => {
    api.fetchCustomerServiceHistoryReplayRuns.mockResolvedValue([run]);
    api.processCustomerServiceHistoryReplay.mockResolvedValue({
      processed: 6, remaining: 0, items: [{ question: "有冇月餅？", status: "scored" }],
    });
    api.judgeCustomerServiceHistoryReplay
      .mockResolvedValueOnce({ judged: 3, remaining: 0, items: [{ question: "有冇月餅？", status: "scored", comparison: "match" }] })
      .mockResolvedValue({ judged: 0, remaining: 0, items: [] });
    render(<CustomerServiceHistoryReplayPanel canEdit />);

    await waitFor(() => expect(api.fetchCustomerServiceHistoryReplayRuns).toHaveBeenCalled());
    expect(await screen.findByText(/計劃 10/)).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: /一鍵跑完/ }));

    expect(await screen.findByText(/歷史回放進度/)).toBeInTheDocument();
    expect(await screen.findByText(/回放 · 可評估：有冇月餅？/)).toBeInTheDocument();
    await waitFor(() =>
      expect(api.processCustomerServiceHistoryReplay).toHaveBeenCalledWith("run-1", 8, 4),
    );
    await waitFor(() =>
      expect(api.judgeCustomerServiceHistoryReplay).toHaveBeenCalledWith("run-1", 8, 4),
    );
  });

  it("starts a replay with the selected time range and reports the planned count", async () => {
    api.fetchCustomerServiceHistoryReplayRuns.mockResolvedValue([]);
    api.startCustomerServiceHistoryReplay.mockResolvedValue({ run_id: "run-2", planned: 25 });
    render(<CustomerServiceHistoryReplayPanel canEdit />);
    await waitFor(() => expect(api.fetchCustomerServiceHistoryReplayRuns).toHaveBeenCalled());

    fireEvent.change(screen.getByLabelText("起始日期"), { target: { value: "2026-08-01" } });
    await userEvent.click(screen.getByRole("button", { name: /建立歷史回放/ }));

    await waitFor(() => expect(api.startCustomerServiceHistoryReplay).toHaveBeenCalledWith(
      expect.objectContaining({ sourceSince: "2026-08-01T00:00:00+08:00" }),
    ));
    expect(await screen.findByText(/25 個樣本/)).toBeInTheDocument();
  });

  it("passes the chosen seed when random sampling is selected", async () => {
    api.fetchCustomerServiceHistoryReplayRuns.mockResolvedValue([]);
    api.startCustomerServiceHistoryReplay.mockResolvedValue({ run_id: "run-3", planned: 10 });
    render(<CustomerServiceHistoryReplayPanel canEdit />);
    await waitFor(() => expect(api.fetchCustomerServiceHistoryReplayRuns).toHaveBeenCalled());

    await userEvent.selectOptions(screen.getByLabelText("抽樣方式"), "random");
    fireEvent.change(screen.getByLabelText("隨機種子"), { target: { value: "seed-123" } });
    await userEvent.click(screen.getByRole("button", { name: /建立歷史回放/ }));

    await waitFor(() => expect(api.startCustomerServiceHistoryReplay).toHaveBeenCalledWith(
      expect.objectContaining({ seed: "seed-123" }),
    ));
    expect(await screen.findByText(/種子 seed-123/)).toBeInTheDocument();
  });

  it("omits the seed when the recent mode is used", async () => {
    api.fetchCustomerServiceHistoryReplayRuns.mockResolvedValue([]);
    api.startCustomerServiceHistoryReplay.mockResolvedValue({ run_id: "run-4", planned: 5 });
    render(<CustomerServiceHistoryReplayPanel canEdit />);
    await waitFor(() => expect(api.fetchCustomerServiceHistoryReplayRuns).toHaveBeenCalled());

    await userEvent.click(screen.getByRole("button", { name: /建立歷史回放/ }));

    await waitFor(() => expect(api.startCustomerServiceHistoryReplay).toHaveBeenCalledWith(
      expect.not.objectContaining({ seed: expect.anything() }),
    ));
  });

  it("shows the diagnosis list with the AI and human answers", async () => {
    api.fetchCustomerServiceHistoryReplayRuns.mockResolvedValue([run]);
    api.fetchCustomerServiceHistoryReplaySamples.mockResolvedValue([
      {
        id: "s1", question: "有冇月餅？", context: [], aiAnswer: "冇",
        referenceAnswer: "有，可訂", status: "scored", comparison: "divergent",
        aiGrounding: "unsupported", requiresHumanReview: true, issues: [],
        scenarioAt: "2026-09-18T14:54:47.000Z",
      },
    ]);
    render(<CustomerServiceHistoryReplayPanel canEdit />);

    await userEvent.click(await screen.findByRole("button", { name: /開啟側邊欄/ }));
    await expandAllConversations();
    expect(await screen.findByText("有冇月餅？")).toBeInTheDocument();
    expect(await screen.findByText("有，可訂")).toBeInTheDocument();
    expect(await screen.findByText(/需人手覆核/)).toBeInTheDocument();
  });

  it("continues automatic diagnosis for a divergent case", async () => {
    api.fetchCustomerServiceHistoryReplayRuns.mockResolvedValue([run]);
    api.fetchCustomerServiceHistoryReplaySamples.mockResolvedValue([
      {
        id: "s1", question: "有冇月餅？", context: [], aiAnswer: "冇",
        referenceAnswer: "有，可訂", status: "scored", comparison: "divergent",
        aiGrounding: "unsupported", requiresHumanReview: true, issues: [],
        scenarioAt: "2026-09-18T14:54:47.000Z",
      },
    ]);
    api.runCustomerServiceHistoryAutoRepair.mockResolvedValue({
      results: [{ sample_id: "s1", proposal_id: "p1", status: "insufficient_evidence", reason: "verified_faq_missing_or_ambiguous" }],
    });
    render(<CustomerServiceHistoryReplayPanel canEdit />);

    await userEvent.click(await screen.findByRole("button", { name: /開啟側邊欄/ }));
    await userEvent.click(await screen.findByRole("button", { name: "繼續自動診斷" }));

    await waitFor(() =>
      expect(api.runCustomerServiceHistoryAutoRepair).toHaveBeenCalledWith("run-1", 1),
    );
    expect((await screen.findAllByText(/自動判定：insufficient_evidence/)).length).toBeGreaterThan(0);
  });

  it("offers emergency rollback for an active verified repair", async () => {
    api.fetchCustomerServiceHistoryReplayRuns.mockResolvedValue([run]);
    api.fetchCustomerServiceRepairProposals.mockResolvedValue([
      {
        id: "p1", repairKind: "alias_candidate", riskLevel: "R1", status: "active",
        reason: "verified_faq_retrieval_miss", sourceSampleIds: ["s1"], candidatePatch: {},
        createdAt: "2026-09-19T02:00:00.000Z",
      },
    ]);
    api.rollbackCustomerServiceRepairProposal.mockResolvedValue({ status: "rolled_back" });
    render(<CustomerServiceHistoryReplayPanel canEdit />);

    await userEvent.click(await screen.findByRole("button", { name: /開啟側邊欄/ }));
    await userEvent.click(await screen.findByRole("tab", { name: /修復提案/ }));
    await userEvent.click(await screen.findByRole("button", { name: "緊急撤回" }));

    await waitFor(() =>
      expect(api.rollbackCustomerServiceRepairProposal).toHaveBeenCalledWith("p1"),
    );
  });

  it("disables all actions without edit permission", async () => {
    api.fetchCustomerServiceHistoryReplayRuns.mockResolvedValue([run]);
    render(<CustomerServiceHistoryReplayPanel canEdit={false} />);
    await waitFor(() => expect(api.fetchCustomerServiceHistoryReplayRuns).toHaveBeenCalled());
    expect(screen.getByRole("button", { name: /建立歷史回放/ })).toBeDisabled();
    expect(screen.getByRole("button", { name: /一鍵跑完/ })).toBeDisabled();
  });

  const sample = (overrides: Record<string, unknown> = {}) => ({
    id: "s1", question: "有冇月餅？", context: [], aiAnswer: "冇",
    referenceAnswer: "有，可訂", status: "scored", comparison: "divergent",
    aiGrounding: "supported", requiresHumanReview: true, issues: [],
    scenarioAt: "2026-09-18T14:54:47.000Z",
    ...overrides,
  });

  it("filters to samples needing review", async () => {
    api.fetchCustomerServiceHistoryReplayRuns.mockResolvedValue([run]);
    api.fetchCustomerServiceHistoryReplaySamples.mockResolvedValue([
      sample({ id: "s1", question: "需覆核問題" }),
      sample({ id: "s2", question: "正常問題", requiresHumanReview: false,
        comparison: "match", aiGrounding: "supported" }),
      sample({ id: "s3", question: "阻擋問題", status: "not_evaluable", requiresHumanReview: false }),
    ]);
    render(<CustomerServiceHistoryReplayPanel canEdit />);

    await userEvent.click(await screen.findByRole("button", { name: /開啟側邊欄/ }));
    await userEvent.click(await screen.findByRole("button", { name: /需覆核/ }));
    await expandAllConversations();

    expect(screen.getByText("需覆核問題")).toBeInTheDocument();
    expect(screen.getByText("阻擋問題")).toBeInTheDocument();
    expect(screen.queryByText("正常問題")).not.toBeInTheDocument();
  });

  it("groups decision points from the same conversation into one thread", async () => {
    api.fetchCustomerServiceHistoryReplayRuns.mockResolvedValue([run]);
    api.fetchCustomerServiceHistoryReplaySamples.mockResolvedValue([
      sample({ id: "s2", conversationId: "conversation-a", question: "第二問",
        scenarioAt: "2026-09-18T15:00:00.000Z",
        context: [{ role: "customer", text: "第一問" }, { role: "assistant", text: "第一答" }] }),
      sample({ id: "s1", conversationId: "conversation-a", question: "第一問",
        scenarioAt: "2026-09-18T14:54:47.000Z", context: [] }),
    ]);
    render(<CustomerServiceHistoryReplayPanel canEdit />);

    await userEvent.click(await screen.findByRole("button", { name: /開啟側邊欄/ }));

    expect(await screen.findByText("2 個決策點")).toBeInTheDocument();
    await userEvent.click(await screen.findByRole("button", { name: /對話 1/ }));
    expect((await screen.findAllByText("第一問")).length).toBeGreaterThan(0);
    expect(await screen.findByText("第二問")).toBeInTheDocument();
  });

  it("shows the judge suggested fix on a divergent diagnosis and its proposal", async () => {
    api.fetchCustomerServiceHistoryReplayRuns.mockResolvedValue([run]);
    api.fetchCustomerServiceHistoryReplaySamples.mockResolvedValue([
      sample({
        id: "s1", question: "我想訂20/9到會", comparison: "divergent",
        issues: [{
          layer: "generation", category: "incomplete_response", severity: "medium",
          suggestedFix: "Answer availability for 20/9 first using approved source",
          evidence: [{ sourceType: "approved_source", quote: "節日只提供中秋套餐" }],
        }],
      }),
    ]);
    api.fetchCustomerServiceRepairProposals.mockResolvedValue([
      {
        id: "p1", repairKind: "code_change_proposal", riskLevel: "R3",
        status: "unsupported_repair", reason: "answer_logic_code_change_required",
        sourceSampleIds: ["s1"], candidatePatch: {}, validation: {},
        createdAt: "2026-09-21T02:35:00.000Z",
      },
    ]);
    render(<CustomerServiceHistoryReplayPanel canEdit />);

    await userEvent.click(await screen.findByRole("button", { name: /開啟側邊欄/ }));
    await expandAllConversations();
    expect(await screen.findByText(/Answer availability for 20\/9 first/)).toBeInTheDocument();
    expect(await screen.findByText(/節日只提供中秋套餐/)).toBeInTheDocument();

    await userEvent.click(await screen.findByRole("tab", { name: /修復提案/ }));
    expect((await screen.findAllByText(/Answer availability for 20\/9 first/)).length).toBeGreaterThan(0);
  });

  it("keeps decision points without a conversation separate", async () => {
    api.fetchCustomerServiceHistoryReplayRuns.mockResolvedValue([run]);
    api.fetchCustomerServiceHistoryReplaySamples.mockResolvedValue([
      sample({ id: "s1", question: "獨立問題" }),
    ]);
    render(<CustomerServiceHistoryReplayPanel canEdit />);

    await userEvent.click(await screen.findByRole("button", { name: /開啟側邊欄/ }));

    expect(await screen.findByText("獨立決策點")).toBeInTheDocument();
    await userEvent.click(await screen.findByRole("button", { name: /獨立決策點/ }));
    expect(await screen.findByText("獨立問題")).toBeInTheDocument();
  });
});
