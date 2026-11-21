"use server";

import type { Prisma } from "@devspot/db";
import { revalidatePath } from "next/cache";
import { cookies, headers } from "next/headers";
import { RateLimiter } from "@/api/rate-limit";
import { ADMIN_COOKIE, adminToken, newSession, SESSION_SECONDS, tokenMatches } from "./auth";
import { createManual, markDuplicateOf, splitDuplicateOf } from "./create";
import { nextReviewId } from "./data";
import { adminDb } from "./db";
import {
  diff,
  EDITABLE_FIELDS,
  type Editable,
  InvalidForm,
  parseEditable,
  publishBlockers,
  REJECT_REASONS,
  safeBack,
} from "./form";
import { go } from "./go";
import { requireAdmin } from "./session";

// Five tries a minute per address, per instance: enough to stop guessing at a 32-byte token.
const loginLimiter = new RateLimiter(5, 60_000);

function log(msg: string, fields: Record<string, unknown>) {
  console.log(JSON.stringify({ level: "info", msg, at: new Date().toISOString(), ...fields }));
}

export async function login(form: FormData): Promise<void> {
  const h = await headers();
  const ip = h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || "unknown";
  if (!adminToken()) go("/admin/login?error=off");
  if (!loginLimiter.take(ip).ok) {
    log("admin.login.limited", { ip });
    go("/admin/login?error=wait");
  }
  const given = form.get("token");
  const session = typeof given === "string" && tokenMatches(given) ? newSession() : null;
  if (!session) {
    log("admin.login.failed", { ip });
    go("/admin/login?error=wrong");
  }
  (await cookies()).set(ADMIN_COOKIE, session, {
    httpOnly: true,
    sameSite: "strict",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_SECONDS,
  });
  log("admin.login", { ip });
  go("/admin");
}

export async function logout(): Promise<void> {
  (await cookies()).delete(ADMIN_COOKIE);
  go("/admin/login");
}

const INTENTS = ["publish", "publishNext", "save", "reject", "unpublish"] as const;
type Intent = (typeof INTENTS)[number];

const itemHref = (id: string, back: string, extra = "") =>
  `/admin/o/${id}?back=${encodeURIComponent(back)}${extra}`;

/**
 * Every action on the review form (docs/01 §4). One transaction changes the row and appends
 * the history row saying what changed (ADR 0016); the console line is for whoever is
 * watching the logs, the table is the record.
 */
export async function saveOpportunity(form: FormData): Promise<void> {
  await requireAdmin();
  const id = String(form.get("id") ?? "");
  const intent = String(form.get("intent") ?? "") as Intent;
  const back = safeBack(form.get("back"));
  if (!id || !INTENTS.includes(intent)) go(back);
  const db = adminDb();
  const current = await db.opportunity.findUnique({ where: { id } });
  if (!current) go(back);
  const now = new Date();
  const note = String(form.get("note") ?? "").trim() || null;

  if (intent === "reject" || intent === "unpublish") {
    // Reject is for an item in review; Unpublish takes a public one back to review.
    const wasPublic = current.status === "published" || current.status === "closed";
    if (intent === "reject" ? current.status !== "review" : !wasPublic) go(itemHref(id, back));
    const reason = String(form.get("reason") ?? "");
    const rejecting = intent === "reject";
    if (rejecting && !(REJECT_REASONS as readonly string[]).includes(reason)) {
      go(itemHref(id, back, `&error=${encodeURIComponent("Choose why you are rejecting it.")}`));
    }
    const status = rejecting ? "rejected" : "review";
    const statusReason = rejecting ? (note ? `${reason}: ${note}` : reason) : note;
    await db.$transaction([
      db.opportunity.update({
        where: { id },
        data: { status, statusReason, reviewedAt: now },
      }),
      db.opportunityEvent.create({
        data: {
          opportunityId: id,
          actor: "admin",
          action: rejecting ? "rejected" : "unpublished",
          changes: {
            status: { from: current.status, to: status },
            ...(rejecting ? { reason: { from: null, to: reason } } : {}),
          },
          note,
        },
      }),
    ]);
    log("admin.action", { action: intent, id, slug: current.slug });
    revalidatePath("/", "layout");
    go(back);
  }

  let after: Editable;
  try {
    after = parseEditable(form);
  } catch (e) {
    if (!(e instanceof InvalidForm)) throw e;
    go(itemHref(id, back, `&error=${encodeURIComponent(e.message)}`));
  }
  const publishing = intent === "publish" || intent === "publishNext";
  if (publishing) {
    const blockers = publishBlockers(after);
    if (blockers.length) {
      go(itemHref(id, back, `&error=${encodeURIComponent(blockers.join(". "))}`));
    }
  }
  const before = Object.fromEntries(EDITABLE_FIELDS.map((f) => [f, current[f]])) as Editable;
  const changes = diff(before, after);
  const edited = Object.keys(changes).length > 0;
  const status = publishing ? "published" : current.status;
  const statusChanged = status !== current.status;
  // Saving an item flagged because its source states another deadline means it was looked at.
  const acknowledged = current.sourceDeadlineAt !== null;

  if (edited || statusChanged || acknowledged) {
    const data: Prisma.OpportunityUpdateInput = {
      ...after,
      status,
      // A maintainer's edit makes the row theirs, however it was first extracted.
      ...(edited ? { extractionMethod: "manual" } : {}),
      ...(acknowledged ? { sourceDeadlineAt: null } : {}),
      ...(publishing
        ? {
            reviewedAt: now,
            publishedAt: current.publishedAt ?? now,
            statusReason: null,
            // Publishing a closed item reopens it.
            ...(current.status === "closed" ? { closedAt: null } : {}),
          }
        : {}),
    };
    await db.$transaction([
      db.opportunity.update({ where: { id }, data }),
      db.opportunityEvent.create({
        data: {
          opportunityId: id,
          actor: "admin",
          action: statusChanged ? "published" : "edited",
          changes: {
            ...changes,
            ...(statusChanged ? { status: { from: current.status, to: status } } : {}),
            ...(acknowledged
              ? {
                  sourceDeadlineAt: {
                    from: current.sourceDeadlineAt?.toISOString() ?? null,
                    to: null,
                  },
                }
              : {}),
          },
          note,
        },
      }),
    ]);
    log("admin.action", {
      action: statusChanged ? "publish" : "edit",
      id,
      slug: current.slug,
      changed: Object.keys(changes),
    });
    revalidatePath("/", "layout");
  }

  if (intent === "publishNext") {
    const next = await nextReviewId(id);
    go(next ? itemHref(next, back) : back);
  }
  go(publishing ? back : itemHref(id, back, "&saved=1"));
}

export async function createOpportunity(form: FormData): Promise<void> {
  await requireAdmin();
  go(await createManual(form, new Date()));
}

export async function markDuplicate(form: FormData): Promise<void> {
  await requireAdmin();
  const to = await markDuplicateOf(form);
  revalidatePath("/", "layout");
  go(to);
}

/** Split: an item the engine took for a copy is a different opportunity (docs/05 §4). */
export async function splitDuplicate(form: FormData): Promise<void> {
  await requireAdmin();
  go(await splitDuplicateOf(form));
}
