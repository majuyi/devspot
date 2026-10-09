import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { parse } from "yaml";
import { formatRegistryIssue, type RegistryFile, validateRegistry } from "../src/index.js";

const dir = resolve(import.meta.dirname, "../../../registry/organizations");
const files: RegistryFile[] = readdirSync(dir)
  .filter((f) => f.endsWith(".yaml") && !f.startsWith("_"))
  .map((file) => {
    try {
      return { file, raw: parse(readFileSync(resolve(dir, file), "utf8")) };
    } catch (e) {
      return { file, parseError: e instanceof Error ? e.message : String(e) };
    }
  });

const { organizations, issues } = validateRegistry(files);
for (const org of organizations) {
  const n = org.sources.length;
  console.log(`✓ ${org.file} (${n} source${n === 1 ? "" : "s"})`);
}
for (const issue of issues) console.error(`✗ ${formatRegistryIssue(issue)}`);
console.log(`${organizations.length} organizations, ${issues.length} problems`);
process.exit(issues.length ? 1 : 0);
