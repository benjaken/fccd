import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { CustomerFaqPage } from "@/components/settings/CustomerFaqPage";
import i18n from "@/i18n";
import { normalizeCustomerFaqInput } from "@/lib/customer-faq";

const accessState = vi.hoisted(() => ({
  canAccess: (_key: string) => true,
}));

vi.mock("@/auth/use-page-access", async () => {
  const actual = await vi.importActual<typeof import("@/auth/use-page-access")>(
    "@/auth/use-page-access",
  );
  return {
    ...actual,
    useCurrentPageAccess: () => ({
      canAccess: (key: string) => accessState.canAccess(key),
      canManage: () => accessState.canAccess(key),
      loading: false,
      error: null,
      pageKey: "settings.customer_faq",
    }),
  };
});

const faq = {
  id: "faq-1",
  category: "delivery",
  question: "運費幾多？",
  answer: "地面交收：新界 HK$50。",
  keywords: "運費",
  locale: "zh-HK",
  isPublished: true,
  sortOrder: 120,
  updatedAt: "2026-09-04T00:00:00.000Z",
};

describe("normalizeCustomerFaqInput", () => {
  it("requires a known category, question, and answer", () => {
    expect(() =>
      normalizeCustomerFaqInput({
        category: "unknown",
        question: "問",
        answer: "答",
        keywords: "",
        isPublished: false,
        sortOrder: 1,
      }),
    ).toThrow("faq_category_required");
    expect(
      normalizeCustomerFaqInput({
        category: "delivery",
        question: "  運費幾多？  ",
        answer: " HK$50 ",
        keywords: " 運費 ",
        isPublished: true,
        sortOrder: 12.8,
      }),
    ).toEqual({
      category: "delivery",
      question: "運費幾多？",
      answer: "HK$50",
      keywords: "運費",
      isPublished: true,
      sortOrder: 12,
    });
  });
});

describe("published FAQ seed allowlist", () => {
  const seed = JSON.parse(
    readFileSync(resolve(process.cwd(), "supabase/seeds/customer-faqs.json"), "utf8"),
  ) as {
    published: Array<{ question: string; answer: string }>;
    unpublished: Array<{ question: string; answer: string }>;
  };

  it("answers shipping from the published table and hides blocked playbook rows", () => {
    const shipping = seed.published.find((row) => row.question.includes("運費"));
    expect(shipping?.answer).toContain("HK$50");
    expect(shipping?.answer).toContain("HK$2800");
    expect(shipping?.answer).toContain("HK$200");
    const publishedText = seed.published.map((row) => `${row.question}\n${row.answer}`).join("\n");
    expect(publishedText).not.toContain("747-221000");
    expect(publishedText).not.toContain("HSBC2024");
    expect(seed.unpublished.some((row) => row.answer.includes("747-221000"))).toBe(true);
    expect(seed.unpublished.some((row) => row.question.includes("取消"))).toBe(true);
  });
});

describe("CustomerFaqPage", () => {
  beforeEach(async () => {
    accessState.canAccess = () => true;
    await i18n.changeLanguage("zh-HK");
  });

  it("lists FAQs, creates a row, and runs a multi-turn AI conversation preview", async () => {
    const user = userEvent.setup();
    const createFaq = vi.fn().mockResolvedValue(undefined);
    const previewTurn = vi.fn()
      .mockResolvedValueOnce({
        reply: "你好，新界地面交收運費係 HK$50。",
        conversation: {
          phone_normalized: "8613828747224",
          state: "identifying",
          selected_order_id: null,
          handoff_at: null,
        },
        usedModel: true,
        simulatedWrite: false,
        humanHandoff: false,
      })
      .mockResolvedValueOnce({
        reply: "唔好意思，呢單要同事跟進。",
        conversation: {
          phone_normalized: "8613828747224",
          state: "human_owned",
          selected_order_id: null,
          handoff_at: "2026-09-04T00:00:00.000Z",
        },
        usedModel: false,
        simulatedWrite: false,
        humanHandoff: true,
      });

    render(
      <CustomerFaqPage
        loadFaqs={vi.fn().mockResolvedValue({ items: [faq], total: 1 })}
        createFaq={createFaq}
        loadControls={vi.fn().mockResolvedValue({
          botEnabled: false,
          allowedPhones: ["8613828747224"],
          updatedAt: faq.updatedAt,
        })}
        previewTurn={previewTurn}
      />,
    );

    expect(await screen.findByRole("heading", { name: "WhatsApp 客服 FAQ" })).toBeInTheDocument();
    const layout = document.querySelector(".customer-faq-layout");
    expect(layout).toBeTruthy();
    expect(layout?.querySelector(".orders-panel")).toBeTruthy();
    expect(layout?.querySelector(".customer-faq-preview")).toBeTruthy();
    expect(await screen.findByText("運費幾多？")).toBeInTheDocument();
    expect(screen.getByText("已發布")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "新增 FAQ" }));
    const panel = screen.getByRole("dialog", { name: "新增 FAQ" });
    await user.type(within(panel).getByLabelText("問題"), "可唔可以荃灣自取？");
    await user.type(within(panel).getByLabelText("答覆"), "可以喺荃灣工場自取。");
    await user.click(within(panel).getByRole("button", { name: "儲存" }));

    await waitFor(() =>
      expect(createFaq).toHaveBeenCalledWith(
        expect.objectContaining({
          category: "ordering",
          question: "可唔可以荃灣自取？",
          answer: "可以喺荃灣工場自取。",
          isPublished: false,
        }),
      ),
    );

    await user.type(screen.getByLabelText("客人會點問"), "運費");
    await user.click(screen.getByRole("button", { name: "傳送測試訊息" }));
    await waitFor(() => expect(previewTurn).toHaveBeenCalledWith(expect.objectContaining({
      text: "運費",
      phone: "8613828747224",
      conversation: null,
    })));
    expect(await screen.findByText(/HK\$50/)).toBeInTheDocument();
    expect(screen.getByText("大模型根據已發布 FAQ 回覆")).toBeInTheDocument();

    await user.type(screen.getByLabelText("客人會點問"), "我要退款");
    await user.click(screen.getByRole("button", { name: "傳送測試訊息" }));
    await waitFor(() => expect(previewTurn).toHaveBeenLastCalledWith(expect.objectContaining({
      text: "我要退款",
      conversation: expect.objectContaining({ state: "identifying" }),
    })));
    expect(await screen.findByText("已進入人工接手範圍")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "重新開始對話" }));
    expect(screen.getByText("輸入客人問題開始多輪測試。")).toBeInTheDocument();
  });

  it("hides write actions without edit permission", async () => {
    accessState.canAccess = (key: string) => key === "settings.customer_faq";

    render(
      <CustomerFaqPage
        loadFaqs={vi.fn().mockResolvedValue({ items: [faq], total: 1 })}
        loadControls={vi.fn().mockResolvedValue({ botEnabled: true, updatedAt: faq.updatedAt })}
      />,
    );

    expect(await screen.findByText("運費幾多？")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "新增 FAQ" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "編輯 FAQ" })).not.toBeInTheDocument();
    expect(screen.getByRole("switch", { name: "啟用 WhatsApp 自動回覆" })).toBeDisabled();
  });

  it("toggles the bot switch independently of FAQ rows", async () => {
    const user = userEvent.setup();
    const setBotEnabled = vi.fn().mockResolvedValue({
      botEnabled: true,
      updatedAt: faq.updatedAt,
    });

    render(
      <CustomerFaqPage
        loadFaqs={vi.fn().mockResolvedValue({ items: [faq], total: 1 })}
        loadControls={vi.fn().mockResolvedValue({ botEnabled: false, updatedAt: faq.updatedAt })}
        setBotEnabled={setBotEnabled}
      />,
    );

    await user.click(await screen.findByRole("switch", { name: "啟用 WhatsApp 自動回覆" }));
    await waitFor(() => expect(setBotEnabled).toHaveBeenCalledWith(true));
  });

  it("keeps allowlist copy with the bot hint instead of stretching a page row", async () => {
    render(
      <CustomerFaqPage
        loadFaqs={vi.fn().mockResolvedValue({ items: [faq], total: 1 })}
        loadControls={vi.fn().mockResolvedValue({
          botEnabled: true,
          allowedPhones: ["8613828747224"],
          updatedAt: faq.updatedAt,
        })}
      />,
    );

    expect(await screen.findByText(/8613828747224/)).toBeInTheDocument();
    const notes = document.querySelector(".customer-faq-notes");
    const layout = document.querySelector(".customer-faq-layout");
    expect(notes).toBeTruthy();
    expect(layout).toBeTruthy();
    expect(notes?.contains(screen.getByText(/8613828747224/))).toBe(true);
    expect(notes?.nextElementSibling).toBe(layout);
  });
});
