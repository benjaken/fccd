import { beforeEach, describe, expect, it, vi } from "vitest";

const rpcMock = vi.hoisted(() => vi.fn());
const fromMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/supabase", () => ({
  supabase: {
    rpc: rpcMock,
    from: fromMock,
  },
}));

import { archiveSalesPartner } from "@/lib/sales-partners";

function mockDeleteEq(result: { error: { message?: string; code?: string } | null }) {
  const eq = vi.fn().mockResolvedValue(result);
  fromMock.mockReturnValue({
    delete: vi.fn().mockReturnValue({ eq }),
  });
  return eq;
}

describe("archiveSalesPartner", () => {
  beforeEach(() => {
    rpcMock.mockReset();
    fromMock.mockReset();
  });

  it("uses the archive RPC when the migration is applied", async () => {
    rpcMock.mockResolvedValue({ error: null });

    await archiveSalesPartner("sp-1");

    expect(rpcMock).toHaveBeenCalledWith("archive_sales_partner", {
      p_partner_id: "sp-1",
    });
    expect(fromMock).not.toHaveBeenCalled();
  });

  it("deletes from the table when the archive RPC is not migrated yet", async () => {
    rpcMock.mockResolvedValue({
      error: {
        code: "PGRST202",
        message:
          "Could not find the function public.archive_sales_partner without parameters in the schema cache",
      },
    });
    const eq = mockDeleteEq({ error: null });

    await archiveSalesPartner("sp-new");

    expect(fromMock).toHaveBeenCalledWith("sales_partners");
    expect(eq).toHaveBeenCalledWith("id", "sp-new");
  });

  it("deletes from the table when archived_at has not been migrated", async () => {
    rpcMock.mockResolvedValue({
      error: {
        code: "42703",
        message: 'column sales_partners.archived_at does not exist',
      },
    });
    mockDeleteEq({ error: null });

    await archiveSalesPartner("sp-2");

    expect(fromMock).toHaveBeenCalledWith("sales_partners");
  });

  it("does not fall back for authorization failures", async () => {
    rpcMock.mockResolvedValue({
      error: {
        code: "42501",
        message: "not authorized to delete sale partners",
      },
    });

    await expect(archiveSalesPartner("sp-1")).rejects.toMatchObject({
      message: "not authorized to delete sale partners",
    });
    expect(fromMock).not.toHaveBeenCalled();
  });
});
