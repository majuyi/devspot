import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { parse } from "yaml";
import { OrganizationYaml } from "../src/index.js";

const dir = resolve(import.meta.dirname, "../../../registry/organizations");
let failed = 0;
const slugs = new Set<string>();
for (const file of readdirSync(dir).filter((f) => f.endsWith(".yaml") && !f.startsWith("_"))) {
  const raw = parse(readFileSync(resolve(dir, file), "utf8"));
  const result = OrganizationYaml.safeParse(raw);
  if (!result.success) {
    failed++;
    console.error(`✗ ${file}`);
    for (const issue of result.error.issues)
      console.error(`    ${issue.path.join(".") || "(root)"}: ${issue.message}`);
    continue;
  }
  if (result.data.slug !== file.replace(/\.yaml$/, "")) {
    failed++;
    console.error(`✗ ${file}: slug "${result.data.slug}" must match the file name`);
    continue;
  }
  if (slugs.has(result.data.slug)) {
    failed++;
    console.error(`✗ ${file}: duplicate slug`);
    continue;
  }
  slugs.add(result.data.slug);
  console.log(
    `✓ ${file} (${result.data.sources.length} source${result.data.sources.length === 1 ? "" : "s"})`,
  );
}
console.log(`${slugs.size} organizations, ${failed} failed`);
process.exit(failed ? 1 : 0);
