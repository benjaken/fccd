import { beforeEach, describe, expect, it, vi } from "vitest";
import { uploadStaffBr } from "@/lib/customer-portal-applications-ops";
import { uploadOrganizationBr } from "@/lib/customer-organization-application";

const mocks = vi.hoisted(() => ({ upload: vi.fn() }));
vi.mock("@/lib/supabase", () => ({ supabase: { storage: { from: () => ({ upload: mocks.upload }) } } }));
beforeEach(() => { mocks.upload.mockReset().mockResolvedValue({ error: null }); });

describe.each([uploadStaffBr, uploadOrganizationBr])("BR attachment versions", upload => {
  it("stores same-name versions separately without replacing the earlier document", async () => {
    const first = await upload("scope", "user", new File(["old"], "BR.pdf", { type: "application/pdf" }));
    const second = await upload("scope", "user", new File(["new"], "BR.pdf", { type: "application/pdf" }));
    expect(first).toMatch(/^user\/scope\/[0-9a-f-]{36}\.pdf$/);
    expect(second).not.toBe(first);
    expect(mocks.upload.mock.calls.every(call => call[2].upsert === false)).toBe(true);
  });
  it("propagates upload failures rather than returning an unusable version path", async () => {
    mocks.upload.mockResolvedValue({ error: { message: "network" } });
    await expect(upload("scope", "user", new File(["scan"], "BR.pdf"))).rejects.toMatchObject({ message: "network" });
  });
});
