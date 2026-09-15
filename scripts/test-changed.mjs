import { execFileSync, spawn } from "node:child_process";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = process.cwd();

/** Shared modules imported by most tests — do not fan out to the whole suite. */
export const HUB_SOURCE_FILES = new Set([
  "src/i18n.ts",
  "src/App.tsx",
  "src/main.tsx",
  "src/index.css",
  "src/lib/supabase.ts",
  "src/lib/cn.ts",
]);

export function kebabCase(value) {
  return value
    .replace(/([a-z0-9])([A-Z])/g, "$1-$2")
    .replace(/_/g, "-")
    .replace(/[^a-zA-Z0-9-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .toLowerCase();
}

export function sourceStems(file) {
  const relative = file.replaceAll("\\", "/");
  const base = path.parse(relative).name;
  const stems = new Set([kebabCase(base)]);
  if (relative.startsWith("supabase/migrations/")) {
    stems.add(kebabCase(base.replace(/^\d{8,14}_/, "")));
  }
  if (relative.startsWith("supabase/functions/")) {
    const fn = relative.split("/")[2];
    if (fn) stems.add(kebabCase(fn));
  }
  return [...stems].filter(Boolean);
}

function importNeedle(file) {
  const relative = file.replaceAll("\\", "/");
  if (!relative.startsWith("src/")) return null;
  return `@/${relative.slice("src/".length).replace(/\.(tsx?|jsx?|mjs|css)$/, "")}`;
}

function testName(file) {
  return path.parse(file).name.replace(/\.test$/, "");
}

function sharedTokenPrefix(left, right) {
  const a = left.split("-");
  const b = right.split("-");
  let count = 0;
  while (count < a.length && count < b.length && a[count] === b[count]) count += 1;
  return count;
}

function stemMatchesTest(stem, testFile) {
  const name = testName(testFile);
  if (name === stem) return true;
  if (name.startsWith(`${stem}-`) || stem.startsWith(`${name}-`)) return true;
  if (sharedTokenPrefix(stem, name) >= 3) return true;
  return false;
}

function isPageTest(testFile) {
  return /(?:^|[-/])page\.test\.(tsx?|jsx?)$/.test(testFile)
    || testName(testFile).endsWith("-page");
}

function pageStem(file) {
  const relative = file.replaceAll("\\", "/");
  const base = path.parse(relative).name;
  const kebab = kebabCase(base).replace(/-page$/, "");
  if (relative.includes("/components/") && /Page$/.test(base)) return kebab;
  return null;
}

export function selectRelatedTests(changedFiles, testFiles, readText = () => "") {
  const tests = testFiles.map((file) => file.replaceAll("\\", "/"));
  const selected = new Set();
  // Keep the conversation corpus in every changed-code/build run, including
  // indirect dependencies whose filenames do not mention customer service.
  if (changedFiles.some((file) => /^(src|test|supabase|scripts)\//.test(file.replaceAll("\\", "/")) || /^(package(-lock)?\.json|vite.*config.*)$/.test(file))) {
    for (const file of tests) {
      if (/\/customer-service-regression(?:-tools)?\.test\.ts$/.test(file)) selected.add(file);
    }
  }

  for (const raw of changedFiles) {
    const file = raw.replaceAll("\\", "/");
    if (/\.test\.(tsx?|jsx?)$/.test(file) && file.startsWith("test/")) {
      selected.add(file);
      continue;
    }
    if (!/^(src|test|supabase|scripts)\//.test(file)) continue;

    for (const stem of sourceStems(file)) {
      for (const testFile of tests) {
        if (stemMatchesTest(stem, testFile)) selected.add(testFile);
      }
    }

    const page = pageStem(file);
    if (page) {
      for (const testFile of tests) {
        if (testName(testFile) === `${page}-page` || testName(testFile) === page) {
          selected.add(testFile);
        }
      }
    }

    if (HUB_SOURCE_FILES.has(file)) continue;

    const needle = importNeedle(file);
    const basename = path.basename(file);
    for (const testFile of tests) {
      if (selected.has(testFile)) continue;
      const text = readText(testFile);
      if (!text) continue;
      if (needle && text.includes(needle)) selected.add(testFile);
      else if (text.includes(basename)) selected.add(testFile);
    }
  }

  return [...selected].sort();
}

export async function listTestFiles(testRoot = path.join(root, "test")) {
  const entries = await readdir(testRoot, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    if (!entry.isFile()) continue;
    if (!/\.test\.(tsx?|jsx?)$/.test(entry.name)) continue;
    files.push(`test/${entry.name}`);
  }
  return files.sort();
}

function gitLines(args) {
  try {
    const output = execFileSync("git", args, { encoding: "utf8", cwd: root }).trim();
    return output ? output.split("\n").filter(Boolean) : [];
  } catch {
    return [];
  }
}

export function collectChangedFiles({ base, commit } = {}) {
  if (commit) {
    return gitLines(["diff-tree", "--no-commit-id", "--name-only", "-r", commit]);
  }
  const dirty = [
    ...gitLines(["diff", "--name-only"]),
    ...gitLines(["diff", "--name-only", "--cached"]),
    ...gitLines(["ls-files", "--others", "--exclude-standard"]),
  ];
  const unique = [...new Set(dirty)];
  if (unique.length) return unique;
  if (base) {
    const mergeBase = gitLines(["merge-base", base, "HEAD"])[0];
    if (mergeBase) return gitLines(["diff", "--name-only", `${mergeBase}...HEAD`]);
  }
  return gitLines(["diff-tree", "--no-commit-id", "--name-only", "-r", "HEAD"]);
}

function parseArgs(argv) {
  const options = { dryRun: false, base: "", commit: "" };
  const rest = [];
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--dry-run") options.dryRun = true;
    else if (arg === "--base") options.base = argv[++index] ?? "";
    else if (arg.startsWith("--base=")) options.base = arg.slice("--base=".length);
    else if (arg === "--commit") options.commit = argv[++index] ?? "";
    else if (arg.startsWith("--commit=")) options.commit = arg.slice("--commit=".length);
    else rest.push(arg);
  }
  return { options, rest };
}

export async function resolveChangedTests(options = {}) {
  const changed = collectChangedFiles(options);
  const testFiles = await listTestFiles();
  const contents = new Map();
  await Promise.all(testFiles.map(async (file) => {
    try {
      contents.set(file, await readFile(path.join(root, file), "utf8"));
    } catch {
      contents.set(file, "");
    }
  }));
  return {
    changed,
    related: selectRelatedTests(changed, testFiles, (file) => contents.get(file) ?? ""),
  };
}

async function main() {
  const { options, rest } = parseArgs(process.argv.slice(2));
  const { changed, related } = await resolveChangedTests(options);
  if (!changed.length) {
    console.log("No changed files; nothing to test.");
    return 0;
  }
  console.log(`Changed files (${changed.length}):\n${changed.map((file) => `  ${file}`).join("\n")}`);
  if (!related.length) {
    console.log("No matching page/module tests for this change. Use npm test for the full suite.");
    return 0;
  }
  const pageTests = related.filter(isPageTest);
  if (pageTests.length) {
    console.log(`Page tests (${pageTests.length}):\n${pageTests.map((file) => `  ${file}`).join("\n")}`);
  }
  console.log(`Running ${related.length} test file(s):\n${related.map((file) => `  ${file}`).join("\n")}`);
  if (options.dryRun) return 0;

  const child = spawn(process.execPath, [path.join(root, "node_modules/vitest/vitest.mjs"), "run", "--dir", "test", ...related, ...rest], {
    cwd: root,
    stdio: "inherit",
    shell: false,
  });
  const code = await new Promise((resolve) => {
    child.on("error", (error) => { console.error(error.message); resolve(1); });
    child.on("close", (value) => resolve(value ?? 1));
  });
  return code;
}

const isCli = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isCli) {
  process.exit(await main());
}
