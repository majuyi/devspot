# 0016 · A history table for opportunities, and a separate database role for admin

**Context.** `/admin` (M2.10) is the first part of the web app that writes. Two things in the
specs did not hold up. First, `01` §4 made Vercel's logs the audit trail, but the Hobby plan
keeps runtime logs for about an hour, so there would be no record of who published or
changed what. Second, the public site connects as a read-only `web` role (agreed
2026-11-08); giving that role write access for admin's sake would remove the guarantee that
a bug in a public page cannot change data. Separately, the "Deadline moved" state in the
design (`07` §5) needs to know a deadline's previous value, which nothing stored.

**Decision.**

1. A table `opportunity_events`: one row per thing done to an opportunity, with the actor
   (`admin` or `engine`), the action, the changed fields as `{ field: { from, to } }`, an
   optional note, and the time. It is append-only: no role is granted update or delete on
   it. Every admin action writes its row in the same transaction as the change.
2. A third restricted role, `admin`, with its own connection string `ADMIN_DATABASE_URL`,
   used only by `/admin`. It can read what a reviewer needs, insert and update
   `opportunities`, and insert into `opportunity_events`. It cannot delete anything or
   touch the registry tables. The public pages keep `web`, which cannot read the history.
3. In production `/admin` refuses to run without `ADMIN_DATABASE_URL`; it never falls back
   to the public connection. Outside production it uses `DATABASE_URL`, so local work needs
   no extra role.

**Consequences.** One more role to create by hand and one more secret in Vercel. The
history grows with every action; at one maintainer and a few hundred items this is
negligible, and it is never read on a public page until "Deadline moved" is built. The
engine does not write history yet: recording a changed deadline there, and showing it on
the public pages, is a later task that this table makes possible. The console still gets a
JSON line per action, for whoever is watching the logs.

**Status.** Accepted, 2026-11-16. Agreed with Dami in the M2.10 plan (decisions B and C).

**Update, 2026-11-20.** The engine now writes `deadlineChanged` events, and the latest move
is copied onto the row (`previousDeadlineAt`, `deadlineChangedAt`) so the public pages can
show "Deadline moved" without the `web` role reading the history. A reviewed row's
disagreeing source date goes to `sourceDeadlineAt` for review (`04` §1 stage 5).
