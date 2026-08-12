import { readFile, writeFile } from "node:fs/promises";

const sourceFile = "docs/BUBBLE_OPTION_SETS_INVENTORY.md";
const outputFile = "src/data/bubble-option-sets.static.json";
const markdown = await readFile(sourceFile, "utf8");
const headingPattern = /^### (.+)$/gm;
const headings = [...markdown.matchAll(headingPattern)];

const optionSets = headings.map((heading, index) => {
  const name = heading[1].trim();
  const start = heading.index + heading[0].length;
  const end = headings[index + 1]?.index ?? markdown.length;
  const section = markdown.slice(start, end);
  const optionsStart = section.indexOf("Options in source order:");
  const optionSection =
    optionsStart >= 0 ? section.slice(optionsStart) : "";
  const options = [...optionSection.matchAll(/^\d+\.\s+`?([^`\n]+)`?\s*$/gm)].map(
    (match) => match[1].trim(),
  );
  const customAttributesSection =
    section.match(/Custom attributes:\s*\n([\s\S]*?)(?:\n\n|$)/)?.[1] ?? "";
  const customAttributes = [
    ...customAttributesSection.matchAll(/^-\s+`([^`]+)`\s+\(([^)]+)\)/gm),
  ].map((match) => ({ name: match[1], type: match[2] }));

  return { name, options, customAttributes };
});

if (optionSets.length !== 35) {
  throw new Error(`Expected 35 option sets, found ${optionSets.length}.`);
}

await writeFile(
  outputFile,
  `${JSON.stringify(
    {
      source: sourceFile,
      total: optionSets.length,
      storage: "frontend_static",
      optionSets,
    },
    null,
    2,
  )}\n`,
);

console.log(`Generated ${optionSets.length} static Bubble option sets.`);
