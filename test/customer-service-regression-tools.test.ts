import { describe, expect, it } from "vitest";
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { compareRegressionTurn, draftFromTranscript, redactRegressionText, validateRegressionCase } from "../scripts/lib/customer-service-regression.mjs";
import { selectRelatedTests } from "../scripts/test-changed.mjs";

const messages = [
  { role: "customer", text: "星期日送貨嗎？", occurredAt: "2026-09-15T07:00:00Z" },
  { role: "human", text: "請提供送貨時間" },
  { role: "customer", text: "下午六點" },
  { role: "assistant", text: "需要確認時段" },
];
const options = { id: "sample-conversation", title: "測試對話" };
const effects = { writeInquiry: 0, queueHandoff: 0 };

describe("conversation regression tools", () => {
  it("imports multi-turn evidence as draft without approving historical answers", () => {
    const draft = draftFromTranscript({ messages }, options);
    expect(draft.status).toBe("draft");
    expect(draft.turns).toHaveLength(2);
    expect(draft.turns[0].referenceReplies[0].role).toBe("human");
    expect(draft.turns.every((turn) => turn.expect === null)).toBe(true);
    expect(validateRegressionCase(draft)).toEqual([]);
    draft.status = "approved";
    expect(validateRegressionCase(draft).join(" ")).toContain("need expectations");
  });

  it("groups customer message fragments until a reply", () => {
    const draft = draftFromTranscript([messages[0], { role: "customer", text: "20人" }, messages[1]], options);
    expect(draft.turns[0].customer).toContain("\n20人");
  });

  it("requires a fixed timestamp and rejects malformed input", () => {
    expect(() => draftFromTranscript([{ role: "customer", text: "你好" }], options)).toThrow("timestamp");
    expect(() => draftFromTranscript(null, options)).toThrow("messages array");
    expect(() => draftFromTranscript([null], options)).toThrow("object");
    const draft = draftFromTranscript(messages, options);
    expect(validateRegressionCase({ ...draft, title: 12, turns: [null] })).toHaveLength(2);
  });

  it("rejects misspelled assertions and incomplete side-effect expectations", () => {
    const draft = draftFromTranscript(messages, options);
    draft.status = "approved";
    draft.turns = [{ customer: "你好", expect: { replyContain: ["好"], replyContains: [], effects: { writeInquiry: 0 } } }];
    const errors = validateRegressionCase(draft).join(" ");
    expect(errors).toContain("unknown expectation");
    expect(errors).toContain("nonempty array");
    expect(errors).toContain("queueHandoff");
  });

  it("detects changed dates, replies and unintended writes or notifications", () => {
    const differences = compareRegressionTurn({ reply: "undefined 已停送", intakeDate: "2026-09-27", effects: { writeInquiry: 1, queueHandoff: 1 } },
      { replyContains: ["20/9"], replyExcludes: ["停送"], intakeDate: "2026-09-20", effects });
    expect(differences).toHaveLength(6);
    expect(differences.join(" ")).toContain("effects.queueHandoff");
  });

  it("allows wording changes while enforcing key facts and intentional silence", () => {
    expect(compareRegressionTurn({ reply: "20/9 可以，請提供時間。", effects }, { replyContains: ["20/9", "時間"], effects })).toEqual([]);
    expect(compareRegressionTurn({ reply: "收到", effects }, { replyEquals: null, effects })).toHaveLength(1);
  });

  it("redacts common personal data from both customer and reference replies", () => {
    const text = "電話：+852 9123 4567 a@example.com https://example.com/order/123 FCC12345678\n地址：九龍某街1號\n姓名：陳先生";
    const safe = redactRegressionText(text);
    for (const privateText of ["9123", "example.com", "FCC12345678", "某街", "陳先生"]) expect(safe).not.toContain(privateText);
  });

  it.each(["src/lib/anything.ts", "supabase/functions/_shared/customer-service-ai.ts", "test/fixtures/customer-service-regression/new.json", "scripts/lib/customer-service-regression.mjs", "package.json"])("automatically selects corpus for %s", (file) => {
    const suite = "test/customer-service-regression.test.ts";
    expect(selectRelatedTests([file], [suite])).toContain(suite);
  });

  it("CLI creates a draft and refuses to overwrite it", () => {
    const temporary = mkdtempSync(join(tmpdir(), "fccd-regression-"));
    try {
      mkdirSync(join(temporary, "input"));
      const input = join(temporary, "input/transcript.json");
      writeFileSync(input, JSON.stringify(messages));
      const args = [resolve("scripts/customer-service-regression-import.mjs"), "--input", input, "--id", options.id, "--title", options.title];
      expect(spawnSync(process.execPath, args, { cwd: temporary }).status).toBe(0);
      const output = join(temporary, `test/fixtures/customer-service-regression/${options.id}.json`);
      const original = readFileSync(output, "utf8");
      expect(JSON.parse(original).status).toBe("draft");
      expect(spawnSync(process.execPath, args, { cwd: temporary }).status).toBe(1);
      expect(readFileSync(output, "utf8")).toBe(original);
    } finally {
      // Only the directory created by mkdtemp above is removed.
      rmSync(temporary, { recursive: true, force: true });
    }
  });
});
