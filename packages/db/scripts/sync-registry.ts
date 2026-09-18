/**
 * Reconcile registry/organizations/*.yaml into Organization and Source rows.
 * The YAML is the source of truth. Never deletes rows; disables sources removed from a file.
 * Usage: pnpm db:sync-registry
 */
import { createHash } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { OrganizationYaml, sourceKey } from "@devspot/schema";
import { parse } from "yaml";
import { db } from "../src/client.ts";

const dir = resolve(import.meta.dirname, "../../../registry/organizations");
const files = readdirSync(dir).filter((f) => f.endsWith(".yaml") && !f.startsWith("_"));
let orgs = 0;
let sources = 0;
let unchanged = 0;

for (const file of files) {
  const text = readFileSync(resolve(dir, file), "utf8");
  const org = OrganizationYaml.parse(parse(text));
  const registryHash = createHash("sha256").update(text).digest("hex");

  const existing = await db.organization.findUnique({
    where: { slug: org.slug },
    select: { id: true, registryHash: true },
  });
  if (existing?.registryHash === registryHash) {
    unchanged++;
    continue;
  }

  const row = await db.organization.upsert({
    where: { slug: org.slug },
    create: {
      slug: org.slug,
      name: org.name,
      category: org.category,
      homepageUrl: org.homepageUrl,
      description: org.description,
      country: org.country,
      city: org.city,
      logoUrl: org.logoUrl,
      enabled: org.enabled,
      registryHash,
    },
    update: {
      name: org.name,
      category: org.category,
      homepageUrl: org.homepageUrl,
      description: org.description,
      country: org.country,
      city: org.city,
      logoUrl: org.logoUrl,
      enabled: org.enabled,
      registryHash,
    },
  });
  orgs++;

  const keys = new Set<string>();
  for (const s of org.sources) {
    const key = sourceKey(org, s);
    keys.add(key);
    await db.source.upsert({
      where: { key },
      create: {
        organizationId: row.id,
        key,
        kind: s.kind,
        url: s.url,
        adapter: s.adapter,
        cadence: s.cadence,
        enabled: s.enabled,
        notes: s.include ? JSON.stringify({ include: s.include, notes: s.notes }) : s.notes,
      },
      update: {
        kind: s.kind,
        url: s.url,
        adapter: s.adapter,
        cadence: s.cadence,
        enabled: s.enabled,
        notes: s.include ? JSON.stringify({ include: s.include, notes: s.notes }) : s.notes,
      },
    });
    sources++;
  }
  await db.source.updateMany({
    where: { organizationId: row.id, key: { notIn: [...keys] }, enabled: true },
    data: { enabled: false },
  });
}

console.log(
  JSON.stringify({
    files: files.length,
    organizationsUpserted: orgs,
    sourcesUpserted: sources,
    unchanged,
  }),
);
await db.$disconnect();
