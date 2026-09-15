import { readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { draftFromTranscript } from "./lib/customer-service-regression.mjs";

const args = process.argv.slice(2);
const option = (name) => { const index = args.indexOf(name); return index < 0 ? undefined : args[index + 1]; };
const input = option("--input");
const id = option("--id");
const title = option("--title");
if (!input || !id || !title) {
  console.error('Usage: npm run regression:import -- --input transcript.json --id case-slug --title "案例名稱"');
  process.exitCode = 1;
} else {
  try {
    const source = await readFile(input, "utf8");
    if (source.length > 1_000_000) throw new Error("Transcript exceeds 1 MB; split it into individual conversations");
    const fixture = draftFromTranscript(JSON.parse(source), { id, title });
    const directory = path.resolve("test/fixtures/customer-service-regression");
    await mkdir(directory, { recursive: true });
    const destination = path.join(directory, `${fixture.id}.json`);
    await writeFile(destination, `${JSON.stringify(fixture, null, 2)}\n`, { flag: "wx" });
    console.log(`Created draft: ${destination}\nReview personal data, add fixed tool data and expected behavior, then set status to approved.`);
  } catch (error) {
    console.error(error instanceof Error ? error.message : "Import failed");
    process.exitCode = 1;
  }
}
