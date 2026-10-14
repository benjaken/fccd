import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { CustomerPortalGuidesPage } from "@/components/settings/CustomerPortalGuidesPage";
import { supabase } from "@/lib/supabase";

vi.mock("@/auth/use-page-access", () => ({ useCurrentPageAccess: () => ({ canAccess: () => true }) }));

const guides = [
  { slug: "about", title: "關於我們", body: "", is_published: true, sort_order: 10 },
  { slug: "promise", title: "服務承諾", body: "準時送到。", is_published: false, sort_order: 50 },
];

describe("customer guide editor", () => {
  beforeEach(() => {
    vi.mocked(supabase.rpc).mockImplementation(async (fn: string) => {
      if (fn === "customer_portal_ops_list_guides") return { data: guides, error: null };
      if (fn === "customer_portal_ops_save_guide") return { data: guides.map(guide => guide.slug === "about" ? { ...guide, title: "關於食品頻道", body: "新內容", is_published: true } : guide), error: null };
      return { data: null, error: null };
    });
  });

  it("saves an edited guide title and body", async () => {
    render(<CustomerPortalGuidesPage />);
    expect(await screen.findByText("關於我們")).toBeInTheDocument();
    expect(screen.getByText("已隱藏")).toBeInTheDocument();
    fireEvent.click(screen.getAllByRole("button", { name: "編輯" })[0]);
    fireEvent.change(screen.getByLabelText("標題"), { target: { value: "關於食品頻道" } });
    fireEvent.change(screen.getByLabelText("內容"), { target: { value: "新內容" } });
    fireEvent.click(screen.getByRole("button", { name: "儲存" }));
    await waitFor(() => expect(supabase.rpc).toHaveBeenCalledWith("customer_portal_ops_save_guide", {
      p_slug: "about", p_title: "關於食品頻道", p_body: "新內容", p_published: true,
    }));
    expect(await screen.findByRole("status")).toHaveTextContent("已儲存。");
    expect(screen.getByText("關於食品頻道")).toBeInTheDocument();
  });
});
