import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vitest";

import { FileMigrationPage } from "@/components/FileMigrationPage";
import i18n from "@/i18n";

describe("Bubble file migration framework", () => {
  beforeEach(async () => {
    await i18n.changeLanguage("en");
  });

  it("provides list search, type, private, and 50-row pagination controls", async () => {
    const user = userEvent.setup();
    render(<FileMigrationPage />);

    const table = screen.getByRole("table");
    expect(within(table).getByText("Redacted POS sheet aggregate")).toBeInTheDocument();
    expect(screen.getByText("50 rows per page · 5 safe samples")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Previous page" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Next page" })).toBeDisabled();

    await user.selectOptions(screen.getByLabelText("File type"), "image");
    expect(within(table).queryByText("Redacted POS sheet aggregate")).not.toBeInTheDocument();
    expect(within(table).getAllByText(/Redacted Logo_/)).toHaveLength(2);

    await user.click(screen.getByLabelText("Private only"));
    expect(within(table).getAllByText(/Redacted Logo_/)).toHaveLength(2);

    await user.type(screen.getByLabelText("Search files"), "SVG");
    expect(within(table).getByText("Redacted Logo_SVG aggregate")).toBeInTheDocument();
    expect(within(table).queryByText("Redacted Logo_png aggregate")).not.toBeInTheDocument();
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
