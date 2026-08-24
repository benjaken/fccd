import { execFileSync } from "node:child_process";
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const outputPath = path.join(root, "docs", "architecture", "generated", "index.json");
const sourceRoots = ["src", "supabase/migrations", "supabase/functions", "scripts", "test", "docs"];
const sourceExtensions = new Set([".ts", ".tsx", ".js", ".mjs", ".sql", ".md", ".json"]);

async function walk(relativeDir) {
  const absoluteDir = path.join(root, relativeDir);
  const entries = await readdir(absoluteDir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    if (entry.name === "node_modules" || entry.name.startsWith(".")) continue;
    const relativePath = path.join(relativeDir, entry.name).replaceAll("\\", "/");
    if (entry.isDirectory()) files.push(...(await walk(relativePath)));
    else if (sourceExtensions.has(path.extname(entry.name))) files.push(relativePath);
  }
  return files;
}

function lineNumberAt(text, index) {
  return text.slice(0, index).split("\n").length;
}

function matches(text, pattern, mapper) {
  return [...text.matchAll(pattern)].map((match) => mapper(match, lineNumberAt(text, match.index ?? 0)));
}

function unique(values) {
  return [...new Set(values)].sort((left, right) => left.localeCompare(right));
}

function relativeEvidence(file, line, symbol) {
  return { file, line, ...(symbol ? { symbol } : {}) };
}

async function readSources(files) {
  return Object.fromEntries(await Promise.all(files.map(async (file) => [file, await readFile(path.join(root, file), "utf8")])));
}

function gitHead() {
  try {
    return execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim();
  } catch {
    return null;
  }
}

const files = (await Promise.all(sourceRoots.map((sourceRoot) => walk(sourceRoot)))).flat().sort();
const sources = await readSources(files);
const codeFiles = files.filter((file) => /^(src|supabase|scripts|test)\//.test(file));
const frontendFiles = codeFiles.filter((file) => /^(src|test)\//.test(file));
const sqlFiles = files.filter((file) => file.startsWith("supabase/migrations/") && file.endsWith(".sql"));
const functionFiles = files.filter((file) => /^supabase\/functions\/[^/]+\/index\.ts$/.test(file));

const routes = [];
const modules = [];
const dataCalls = [];
const permissions = [];
const migrationObjects = [];
const integrations = [];
const tests = [];

for (const file of codeFiles) {
  const text = sources[file];
  routes.push(...matches(text, /<Route\s+path=["']([^"']+)["']/g, (match, line) => ({ path: match[1], ...relativeEvidence(file, line) })));
  modules.push(...matches(text, /from\s+["']@\/(components|lib|auth|data)\/([^"']+)["']/g, (match, line) => ({ layer: match[1], module: match[2], ...relativeEvidence(file, line) })));
  dataCalls.push(...matches(text, /\.(from|rpc|invoke)\(\s*["'`]([^"'`]+)["'`]/g, (match, line) => ({ kind: match[1], target: match[2], ...relativeEvidence(file, line) })));
  dataCalls.push(...matches(text, /\.storage\.from\(\s*["'`]([^"'`]+)["'`]/g, (match, line) => ({ kind: "storage", target: match[1], ...relativeEvidence(file, line) })));
  permissions.push(...matches(text, /["'`]((?:[a-z][a-z0-9_-]*\.){1,4}[a-z][a-z0-9_.-]*)["'`]/g, (match, line) => {
    const key = match[1];
    return /^(?:frozen|orders|quotes|products|kitchen|delivery|restaurant|reports|settings|finance|factory|migration|driver|customer)\./.test(key)
      ? { key, ...relativeEvidence(file, line) }
      : null;
  }).filter(Boolean));
  if (/\.test\.(?:ts|tsx)$/.test(file) || /\.spec\.(?:ts|tsx)$/.test(file)) tests.push({ file });
}

for (const file of sqlFiles) {
  const text = sources[file];
  migrationObjects.push(...matches(text, /create\s+table\s+(?:if\s+not\s+exists\s+)?(?:public\.)?([a-z0-9_]+)/gi, (match, line) => ({ kind: "table", name: match[1], ...relativeEvidence(file, line) })));
  migrationObjects.push(...matches(text, /create\s+(?:or\s+replace\s+)?function\s+(?:public\.)?([a-z0-9_]+)/gi, (match, line) => ({ kind: "function", name: match[1], ...relativeEvidence(file, line) })));
  migrationObjects.push(...matches(text, /create\s+(?:or\s+replace\s+)?view\s+(?:public\.)?([a-z0-9_]+)/gi, (match, line) => ({ kind: "view", name: match[1], ...relativeEvidence(file, line) })));
  migrationObjects.push(...matches(text, /create\s+(?:unique\s+)?index\s+(?:if\s+not\s+exists\s+)?([a-z0-9_]+)/gi, (match, line) => ({ kind: "index", name: match[1], ...relativeEvidence(file, line) })));
  migrationObjects.push(...matches(text, /create\s+trigger\s+([a-z0-9_]+)/gi, (match, line) => ({ kind: "trigger", name: match[1], ...relativeEvidence(file, line) })));
  migrationObjects.push(...matches(text, /create\s+policy\s+["']?([^"'\n]+?)["']?\s+on\s+(?:public\.)?([a-z0-9_]+)/gi, (match, line) => ({ kind: "policy", name: match[1].trim(), table: match[2], ...relativeEvidence(file, line) })));
  migrationObjects.push(...matches(text, /storage\.buckets[^\n]*\n[\s\S]{0,250}?\('([^']+)'/gi, (match, line) => ({ kind: "storage_bucket", name: match[1], ...relativeEvidence(file, line) })));
}

for (const file of functionFiles) {
  const text = sources[file];
  const functionName = file.split("/")[2];
  integrations.push({
    function: functionName,
    entrypoint: relativeEvidence(file, text.includes("Deno.serve") ? lineNumberAt(text, text.indexOf("Deno.serve")) : 1),
    npmImports: unique(matches(text, /from\s+["']npm:([^"']+)["']/g, (match) => match[1])),
    invokes: unique(matches(text, /(?:fetch|invoke)\([^\n]{0,200}?https?:\/\/([^/\s"']+)/g, (match) => match[1])),
    hasAuthHeader: /authorization/i.test(text),
    hasStorageAccess: /\.storage\./.test(text),
  });
}

const docs = files.filter((file) => file.startsWith("docs/") || file === "README.md");
const index = {
  generatedAt: new Date().toISOString(),
  gitHead: gitHead(),
  scope: sourceRoots,
  counts: {
    files: files.length,
    frontendFiles: frontendFiles.length,
    routes: routes.length,
    modules: modules.length,
    dataCalls: dataCalls.length,
    migrationObjects: migrationObjects.length,
    edgeFunctions: functionFiles.length,
    integrations: integrations.length,
    tests: tests.length,
    docs: docs.length,
  },
  routes,
  modules,
  dataCalls,
  permissions: unique(permissions.map((entry) => entry.key)).map((key) => ({ key, evidence: permissions.filter((entry) => entry.key === key).slice(0, 8) })),
  migrationObjects,
  edgeFunctions: integrations,
  tests,
  docs,
};

await mkdir(path.dirname(outputPath), { recursive: true });
await writeFile(outputPath, `${JSON.stringify(index, null, 2)}\n`, "utf8");
console.log(JSON.stringify(index.counts, null, 2));
