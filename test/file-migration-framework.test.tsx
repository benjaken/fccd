import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { FileMigrationPage } from "@/components/FileMigrationPage";
import i18n from "@/i18n";

const invokeMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/supabase", () => ({
  supabase: { functions: { invoke: invokeMock } },
}));

describe("Bubble file migration framework", () => {
  beforeEach(async () => {
    invokeMock.mockReset();
    invokeMock.mockImplementation(
      async (_name: string, options: { body?: { action?: string } }) => {
        if (options.body?.action === "status") {
          return {
            data: {
              total: 4201,
              verified: 4094,
              failed: 107,
              excluded: 0,
              uniqueContent: 3988,
              uniqueBytes: 6959019911,
              generatedAt: "2026-08-13T05:00:00.000Z",
            },
            error: null,
          };
        }
        if (options.body?.action === "analyze") {
          return {
            data: {
              records: 1,
              uniqueIds: 1,
              duplicateIds: 0,
              verified: 1,
              failed: 0,
              changed: 0,
              missing: 0,
              actionableIds: [],
            },
            error: null,
          };
        }
        return { data: null, error: null };
      },
    );
    await i18n.changeLanguage("en");
  });

  it("provides list search, type, private, and 50-row pagination controls", async () => {
    const user = userEvent.setup();
    render(<FileMigrationPage isSuperAdmin={false} />);

    const table = screen.getByRole("table");
    expect(within(table).getByText("Redacted POS sheet aggregate")).toBeInTheDocument();
    expect(screen.getByText("50 rows per page · 5 safe samples")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Previous page" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Next page" })).toBeDisabled();
    expect(
      screen.getByRole("button", { name: "Upload and compare" }),
    ).toBeDisabled();

    await user.selectOptions(screen.getByLabelText("File type"), "image");
    expect(within(table).queryByText("Redacted POS sheet aggregate")).not.toBeInTheDocument();
    expect(within(table).getAllByText(/Redacted Logo_/)).toHaveLength(2);

    await user.click(screen.getByLabelText("Private only"));
    expect(within(table).getAllByText(/Redacted Logo_/)).toHaveLength(2);

    await user.type(screen.getByLabelText("Search files"), "SVG");
    expect(within(table).getByText("Redacted Logo_SVG aggregate")).toBeInTheDocument();
    expect(within(table).queryByText("Redacted Logo_png aggregate")).not.toBeInTheDocument();
  });

  it("uploads and compares a valid JSON inventory for a Super Admin", async () => {
    const user = userEvent.setup();
    render(<FileMigrationPage isSuperAdmin />);
    const inventory = {
      response: {
        results: [
          {
            _id: "bubble-file-id",
            app_version_text: "live",
            appname_text: "fc-order-system",
            content_type_text: "application/pdf",
            filename_text: "sample.pdf",
            s3_key_text: "f123/sample.pdf",
            size_number: 123,
            "Created Date": "2026-08-13T00:00:00.000Z",
            "Modified Date": "2026-08-13T00:00:00.000Z",
            user_id_text: "bubble-user-id",
          },
        ],
      },
    };
    const file = new File([JSON.stringify(inventory)], "uploaded-files.json", {
      type: "application/json",
    });

    await user.upload(
      screen.getByLabelText(/Choose uploaded-files JSON/),
      file,
    );
    await user.click(screen.getByRole("button", { name: "Upload and compare" }));

    await waitFor(() =>
      expect(invokeMock).toHaveBeenCalledWith(
        "attachment-incremental",
        expect.objectContaining({
          body: expect.objectContaining({ action: "analyze" }),
        }),
      )
    );
    expect(screen.getByText("uploaded-files.json")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Run incremental migration" }),
    ).toBeDisabled();
  });

  it("keeps incremental execution locked while another run holds the lock", () => {
    const workDir = mkdtempSync(join(tmpdir(), "bubble-files-lock-"));
    mkdirSync(workDir, { recursive: true });
    writeFileSync(join(workDir, "incremental.lock"), "{}\n");

    try {
      expect(() =>
        execFileSync(
          process.execPath,
          [resolve("scripts/migrate-bubble-files.mjs"), "incremental"],
          {
            cwd: resolve("."),
            env: {
              ...process.env,
              BUBBLE_FILE_MIGRATION_WORK_DIR: workDir,
            },
            stdio: "pipe",
            timeout: 10_000,
          },
        ),
      ).toThrow(/Incremental migration is locked by another run/);
    } finally {
      rmSync(workDir, { recursive: true, force: true });
    }
  });

  it("resets a newer Modified Date entry without deleting its prior object", () => {
    const root = mkdtempSync(join(tmpdir(), "bubble-files-incremental-"));
    const workDir = join(root, "work");
    const snapshotDir = join(root, "snapshot");
    const objectsDir = join(snapshotDir, "objects");
    mkdirSync(objectsDir, { recursive: true });
    writeFileSync(
      join(snapshotDir, "export-manifest.json"),
      JSON.stringify({
        snapshotAt: "2026-08-12T00:00:00.000Z",
        exports: [{ type: "quote_file", file: "quote-file.jsonl" }],
      }),
    );
    const objectPath = join(objectsDir, "quote-file.jsonl");
    writeFileSync(
      objectPath,
      `${JSON.stringify({
        _id: "local-test-id",
        "Modified Date": "2026-08-12T00:00:00.000Z",
        file: "//example.invalid/private-test.pdf",
      })}\n`,
    );
    const runDiscover = (extra: string[] = []) =>
      execFileSync(
        process.execPath,
        [
          resolve("scripts/migrate-bubble-files.mjs"),
          "discover",
          "--snapshot-dir",
          snapshotDir,
          ...extra,
        ],
        {
          cwd: resolve("."),
          env: {
            ...process.env,
            BUBBLE_FILE_MIGRATION_WORK_DIR: workDir,
          },
          stdio: "pipe",
          timeout: 10_000,
        },
      );

    try {
      runDiscover();
      const manifestPath = join(workDir, "manifest.json");
      const baseline = JSON.parse(readFileSync(manifestPath, "utf8"));
      baseline.entries[0] = {
        ...baseline.entries[0],
        migrationStatus: "verified",
        sha256: "a".repeat(64),
        objectPath: "retained/prior/object.pdf",
      };
      writeFileSync(manifestPath, JSON.stringify(baseline));
      writeFileSync(
        objectPath,
        `${JSON.stringify({
          _id: "local-test-id",
          "Modified Date": "2026-08-12T01:00:00.000Z",
          file: "//example.invalid/private-test.pdf",
        })}\n`,
      );

      runDiscover([
        "--mode",
        "incremental",
        "--modified-after",
        "2026-08-12T00:00:00.000Z",
      ]);
      const incremental = JSON.parse(readFileSync(manifestPath, "utf8"));
      expect(incremental.entries[0]).toMatchObject({
        migrationMode: "incremental",
        migrationStatus: "discovered",
        objectPath: null,
        sha256: null,
        sourceModifiedAt: "2026-08-12T01:00:00.000Z",
      });
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("strips Bubble analytics parameters before file deduplication", () => {
    const root = mkdtempSync(join(tmpdir(), "bubble-files-canonical-"));
    const workDir = join(root, "work");
    const snapshotDir = join(root, "snapshot");
    const objectsDir = join(snapshotDir, "objects");
    mkdirSync(objectsDir, { recursive: true });
    writeFileSync(
      join(snapshotDir, "export-manifest.json"),
      JSON.stringify({
        snapshotAt: "2026-08-12T00:00:00.000Z",
        exports: [{ type: "quote_file", file: "quote-file.jsonl" }],
      }),
    );
    const base =
      "//a112cb5fe9cbba3717fadc05fb8851f0.cdn.bubble.io/f1786493312607x692656199919109200/DeliveryOrderDelete.pdf";
    writeFileSync(
      join(objectsDir, "quote-file.jsonl"),
      [
        {
          _id: "row-one",
          "Modified Date": "2026-08-12T00:00:00.000Z",
          file: `${base}?_gl=first&_ga=one`,
        },
        {
          _id: "row-one",
          "Modified Date": "2026-08-12T00:00:00.000Z",
          file: `${base}?_gl=second&_ga_BFPVR2DEE2=two`,
        },
      ].map(JSON.stringify).join("\n"),
    );

    try {
      execFileSync(
        process.execPath,
        [
          resolve("scripts/migrate-bubble-files.mjs"),
          "discover",
          "--snapshot-dir",
          snapshotDir,
        ],
        {
          cwd: resolve("."),
          env: {
            ...process.env,
            BUBBLE_FILE_MIGRATION_WORK_DIR: workDir,
          },
          stdio: "pipe",
        },
      );
      const manifest = JSON.parse(
        readFileSync(join(workDir, "manifest.json"), "utf8"),
      );
      expect(manifest.entries).toHaveLength(1);
      expect(manifest.entries[0].sourceUrl).toBe(
        `https:${base}`,
      );
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("commits only safe aggregate file status without URLs, IDs, or filenames", () => {
    const generated = readFileSync(
      resolve("src/data/file-migration-status.generated.json"),
      "utf8",
    );
    const parsed = JSON.parse(generated);

    expect(generated).not.toMatch(/https?:\/\//i);
    expect(generated).not.toMatch(/\/\/[a-z0-9]/i);
    expect(generated).not.toMatch(/\d{10,}x\d{10,}/);
    expect(parsed.safeSamples).toHaveLength(5);
    expect(
      parsed.safeSamples.every(
        (sample: { fileName: string; userId: string }) =>
          sample.fileName.startsWith("Redacted ") && sample.userId === "••••••••",
      ),
    ).toBe(true);
    expect(parsed.attachmentRows).toBe(0);
    expect(parsed.binaryMigrated).toBe(0);
  });
});
