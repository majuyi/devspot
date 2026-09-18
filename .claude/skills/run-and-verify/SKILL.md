---
name: run-and-verify
description: Choose and run the narrowest relevant checks after a change, then broaden. Use after any edit, before claiming a task is done, and when asked to verify.
---

# Run and verify

1. Identify the packages touched: `git status --porcelain`.
2. Narrow first:
   - `packages/schema`: `pnpm --filter @devspot/schema test`.
   - `packages/db`: `pnpm --filter @devspot/db validate` then its tests (needs
     `docker compose up -d db` and `pnpm db:migrate`).
   - `packages/engine`: `pnpm --filter @devspot/engine test` (network disabled).
   - `apps/web`: `pnpm --filter @devspot/web test` then `pnpm --filter @devspot/web build`.
3. Then `pnpm lint` and `pnpm typecheck` across the workspace.
4. Then `pnpm check` if the change crosses packages or touches config.
5. For web pages: run `pnpm dev`, open the route, check the acceptance list in
   `docs/01-product-spec.md`. Run Lighthouse on any new or changed public route.
6. Report exactly what ran, with pass or fail per command. Do not say "tests pass" unless
   you ran them in this session.
