import { readFile, readdir, stat, writeFile } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const docsRoot = path.join(root, "docs", "architecture");
const output = path.join(docsRoot, "generated", "validation.json");

async function walk(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    if (entry.name === "generated") continue;
    const file = path.join(dir, entry.name);
    if (entry.isDirectory()) files.push(...(await walk(file)));
    else if (entry.name.endsWith(".md")) files.push(file);
  }
  return files;
}

function lineNumberAt(text, index) {
  return text.slice(0, index).split("\n").length;
}

const files = await walk(docsRoot);
const errors = [];
const warnings = [];
let linkCount = 0;
let evidenceCount = 0;
let mermaidBlocks = 0;

for (const file of files) {
  const text = await readFile(file, "utf8");
  const relativeFile = path.relative(root, file).replaceAll("\\", "/");
  const mermaidOpen = [...text.matchAll(/```mermaid\b/g)].length;
  const mermaidClose = [...text.matchAll(/```/g)].length - [...text.matchAll(/```mermaid\b/g)].length;
  mermaidBlocks += mermaidOpen;
  if (mermaidOpen > mermaidClose) warnings.push(`${relativeFile}: unmatched mermaid fence`);

  for (const match of text.matchAll(/\]\(([^)\s#]+)(?:#[^)]*)?\)/g)) {
    const target = match[1];
    if (/^(?:https?:|mailto:)/i.test(target)) continue;
    linkCount += 1;
    const resolved = path.resolve(path.dirname(file), target);
    try {
      await stat(resolved);
    } catch {
      errors.push(`${relativeFile}:${lineNumberAt(text, match.index ?? 0)} missing link target ${target}`);
    }
  }

  for (const match of text.matchAll(/((?:src|supabase|scripts|test|docs)\/[A-Za-z0-9_./-]+):(\d+)/g)) {
    evidenceCount += 1;
    const target = path.resolve(root, match[1]);
    try {
      const source = await readFile(target, "utf8");
      const line = Number(match[2]);
      if (line < 1 || line > source.split("\n").length) {
        errors.push(`${relativeFile}:${lineNumberAt(text, match.index ?? 0)} evidence line out of range ${match[1]}:${line}`);
      }
    } catch {
      errors.push(`${relativeFile}:${lineNumberAt(text, match.index ?? 0)} evidence target missing ${match[1]}`);
    }
  }

  for (const match of text.matchAll(/`((?:src|supabase|scripts|test|docs)\/[A-Za-z0-9_./-]+)`/g)) {
    const target = path.resolve(root, match[1]);
    try {
      await stat(target);
    } catch {
      errors.push(`${relativeFile}:${lineNumberAt(text, match.index ?? 0)} inline path target missing ${match[1]}`);
    }
  }

  if (/(?:SUPABASE_SERVICE_ROLE_KEY|SUPABASE_ACCESS_TOKEN|VITE_SUPABASE_PUBLISHABLE_KEY)\s*=\s*[^`\s<]/i.test(text)) {
    errors.push(`${relativeFile}: possible environment value embedded in architecture docs`);
  }
  if (/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----|(?:sk|sb_secret)_[A-Za-z0-9]{20,}/.test(text)) {
    errors.push(`${relativeFile}: possible credential or private key embedded in architecture docs`);
  }
}

const result = {
  checkedAt: new Date().toISOString(),
  files: files.map((file) => path.relative(root, file).replaceAll("\\", "/")),
  counts: { files: files.length, links: linkCount, evidence: evidenceCount, mermaidBlocks },
  errors,
  warnings,
  passed: errors.length === 0,
};
await writeFile(output, `${JSON.stringify(result, null, 2)}\n`, "utf8");
console.log(JSON.stringify({ ...result.counts, errors: errors.length, warnings: warnings.length, passed: result.passed }, null, 2));
if (errors.length) process.exitCode = 1;
