import { Prisma, uniqueSlug } from "@devspot/db";
import { baseSlug, identityKey } from "@devspot/schema";
import { revalidatePath } from "next/cache";
import { adminDb } from "./db";
import { InvalidForm, parseEditable, publishBlockers, safeBack } from "./form";

function log(msg: string, fields: Record<string, unknown>) {
  console.log(JSON.stringify({ level: "info", msg, at: new Date().toISOString(), ...fields }));
}

/** A page address as the form gave it: http or https only, in its normalised form. */
export function pageAddress(value: FormDataEntryValue | null): string | null {
  if (typeof value !== "string" || !value.trim()) return null;
  try {
    const u = new URL(value.trim());
    if (u.protocol === "https:" || u.protocol === "http:") return u.toString();
  } catch {}
  return null;
}

/** /admin/new with step one's answers, which is where a refused create goes back to. */
export function newHref(p: { org?: string; url?: string; title?: string; error?: string }): string {
  const q = new URLSearchParams();
  if (p.org) q.set("org", p.org);
  if (p.url) q.set("url", p.url);
  if (p.title) q.set("title", p.title);
  if (p.error) q.set("error", p.error);
  const s = q.toString();
  return s ? `/admin/new?${s}` : "/admin/new";
}

/**
 * /admin/new (docs/01 §4): an opportunity entered by hand. Stored as the maintainer's own
 * work: discovered and extracted by hand, confidence 1, no source text, reviewed now. The
 * address must be new; step one showed anything sharing its identity key. Returns where to
 * go next.
 */
export async function createManual(form: FormData, now: Date): Promise<string> {
  const db = adminDb();
  const orgSlug = String(form.get("org") ?? "");
  const canonicalUrl = pageAddress(form.get("canonicalUrl"));
  const intent = String(form.get("intent") ?? "");
  const back = {
    org: orgSlug,
    url: String(form.get("canonicalUrl") ?? ""),
    title: String(form.get("title") ?? ""),
  };
  const org = orgSlug
    ? await db.organization.findUnique({
        where: { slug: orgSlug },
        select: { id: true, slug: true },
      })
    : null;
  if (!org) return newHref({ ...back, error: "Choose an organisation from the registry." });
  if (!canonicalUrl) return newHref({ ...back, error: "The page address must be a web address." });

  let fields: ReturnType<typeof parseEditable>;
  try {
    fields = parseEditable(form);
  } catch (e) {
    if (!(e instanceof InvalidForm)) throw e;
    return newHref({ ...back, error: e.message });
  }
  const publish = intent === "publish";
  if (publish) {
    const blockers = publishBlockers(fields);
    if (blockers.length) return newHref({ ...back, error: blockers.join(". ") });
  }
  // Refused here as well as by the unique index: two tabs open on the same page.
  const existing = await db.opportunity.findUnique({
    where: { canonicalUrl },
    select: { id: true },
  });
  if (existing) return newHref({ org: org.slug, url: canonicalUrl, title: fields.title });

  const status = publish ? "published" : "review";
  const dates = {
    deadlineAt: fields.deadlineAt?.toISOString(),
    startsAt: fields.startsAt?.toISOString(),
  };
  try {
    const id = await db.$transaction(async (tx) => {
      const created = await tx.opportunity.create({
        data: {
          ...fields,
          slug: await uniqueSlug(tx, baseSlug(org.slug, fields.title, now), canonicalUrl),
          organizationId: org.id,
          canonicalUrl,
          identityKey: identityKey(org.slug, { title: fields.title, ...dates }, now),
          discoveredVia: "manual",
          extractionMethod: "manual",
          confidence: 1,
          status,
          firstSeenAt: now,
          reviewedAt: now,
          lastVerifiedAt: now,
          ...(publish ? { publishedAt: now } : {}),
        },
        select: { id: true, slug: true },
      });
      await tx.opportunityEvent.create({
        data: {
          opportunityId: created.id,
          actor: "admin",
          action: "created",
          changes: { status: { from: null, to: status } },
          note: String(form.get("note") ?? "").trim() || null,
        },
      });
      log("admin.action", { action: "create", id: created.id, slug: created.slug, status });
      return created.id;
    });
    if (publish) revalidatePath("/", "layout");
    return `/admin/o/${id}?back=${encodeURIComponent("/admin")}&saved=1`;
  } catch (e) {
    // Another save got there first: show what is now at that address.
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      return newHref({ org: org.slug, url: canonicalUrl, title: fields.title });
    }
    throw e;
  }
}

/**
 * "Mark duplicate of" (docs/01 §4, invariant 6): the item points at the original and leaves
 * the site, with the reason on record. Returns where to go next.
 */
export async function markDuplicateOf(form: FormData): Promise<string> {
  const db = adminDb();
  const id = String(form.get("id") ?? "");
  const originalId = String(form.get("originalId") ?? "");
  const back = safeBack(form.get("back"));
  const item = id ? await db.opportunity.findUnique({ where: { id } }) : null;
  if (!item) return back;
  const here = `/admin/o/${id}?back=${encodeURIComponent(back)}`;
  const original =
    originalId && originalId !== id
      ? await db.opportunity.findUnique({
          where: { id: originalId },
          select: { id: true, slug: true, title: true, duplicateOfId: true },
        })
      : null;
  // Never a loop: the original must not itself be a duplicate of something.
  if (!original || original.duplicateOfId) {
    return `${here}&error=${encodeURIComponent("Choose an original that is not itself a duplicate.")}`;
  }
  const note = String(form.get("note") ?? "").trim() || null;
  await db.$transaction([
    db.opportunity.update({
      where: { id },
      data: {
        duplicateOfId: original.id,
        status: "rejected",
        statusReason: `Duplicate of ${original.title}`,
        reviewedAt: new Date(),
      },
    }),
    db.opportunityEvent.create({
      data: {
        opportunityId: id,
        actor: "admin",
        action: "markedDuplicate",
        changes: {
          status: { from: item.status, to: "rejected" },
          duplicateOf: { from: null, to: original.slug },
        },
        note,
      },
    }),
  ]);
  log("admin.action", { action: "markDuplicate", id, slug: item.slug, of: original.slug });
  return here;
}

/**
 * "Split" (docs/05 §4): the engine took this item for a copy because it shares an identity key
 * with an earlier one, and the reviewer says it is a different opportunity. The link is cleared
 * and the item stays in review, to be published on its own; history records the split.
 */
export async function splitDuplicateOf(form: FormData): Promise<string> {
  const db = adminDb();
  const id = String(form.get("id") ?? "");
  const back = safeBack(form.get("back"));
  const item = id
    ? await db.opportunity.findUnique({
        where: { id },
        include: { duplicateOf: { select: { slug: true } } },
      })
    : null;
  if (!item) return back;
  const here = `/admin/o/${id}?back=${encodeURIComponent(back)}`;
  if (!item.duplicateOf || item.status !== "review") return here;
  await db.$transaction([
    db.opportunity.update({ where: { id }, data: { duplicateOfId: null } }),
    db.opportunityEvent.create({
      data: {
        opportunityId: id,
        actor: "admin",
        action: "edited",
        changes: { duplicateOf: { from: item.duplicateOf.slug, to: null } },
        note: "Split: a different opportunity from the one it was taken for a copy of.",
      },
    }),
  ]);
  log("admin.action", { action: "splitDuplicate", id, slug: item.slug });
  return here;
}
