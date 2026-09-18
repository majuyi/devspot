---
name: ship-task
description: Pick up a milestone task from docs/08-milestones.md, do it, and close it properly. Use when asked to "do the next task", "work on M1.3", or "continue the milestone".
---

# Ship a milestone task

1. Open `docs/08-milestones.md`. Take the first unticked task in the current milestone
   unless the user named one. Do not skip ahead across a milestone gate.
2. Read the spec sections the task cites, then the files it names. Write a short plan
   (five lines) before editing. If the plan needs a decision the specs do not cover, write an
   ADR (status Proposed) and stop.
3. Implement in small commits on a branch named `m<N>/<short-task>`. Match surrounding code.
4. Run the `run-and-verify` skill.
5. Update docs if behaviour or commands changed. Add a line under Unreleased in
   `CHANGELOG.md`. Tick the task in `docs/08-milestones.md`.
6. Final message: what changed and where; checks run and results; anything not verified;
   the next task's id. Do not push unless asked.
