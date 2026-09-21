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
    await userEvent.click(screen.getByRole("button", { name: /開始歷史回放/ }));

    await waitFor(() => expect(api.startCustomerServiceHistoryReplay).toHaveBeenCalledWith(
      expect.objectContaining({ sourceSince: "2026-08-01T00:00:00+08:00" }),
    ));
    expect(await screen.findByText(/25 個樣本/)).toBeInTheDocument();
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
    expect(screen.getByRole("button", { name: /開始歷史回放/ })).toBeDisabled();
    expect(screen.getByRole("button", { name: /一鍵跑完/ })).toBeDisabled();
  });
});
