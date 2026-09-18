# 0005 · Record and replay fixtures and source health from day one

**Context.** CLIST's best idea is offline HTTP replay with the network disabled; its freshness strategy is noticing when a source goes quiet. Both were missing from TechNG.

**Decision.** Every source ships with a recorded fixture and golden output. The engine computes health after every run and fails the scheduled job when a source starts erroring.

**Consequences.** We can distinguish 'the site changed' from 'our code broke' from 'nothing this week'. Contributors can work without the network.

**Status.** Accepted, 2026-09-06.
