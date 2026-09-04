import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

function readCssTree(filePath: string, seen: Set<string>): string {
  const absolutePath = resolve(filePath);
  if (seen.has(absolutePath)) return "";
  seen.add(absolutePath);

  const source = readFileSync(absolutePath, "utf8");
  const localImportPattern = /^\s*@import\s+["'](\.\.?\/[^"']+)["'];?\s*$/gm;
  const imports: string[] = [];
  let match: RegExpExecArray | null;
  while ((match = localImportPattern.exec(source)) !== null) {
    imports.push(readCssTree(resolve(dirname(absolutePath), match[1]), seen));
  }

  return `${imports.join("\n")}\n${source.replace(localImportPattern, "")}`;
}

export function readAppStyles() {
  return readCssTree(resolve(process.cwd(), "src/index.css"), new Set());
}
