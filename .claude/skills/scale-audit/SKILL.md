---
name: scale-audit
description: Marbee scalability audit — find bottlenecks for the next growth stage in docs/cpo/04-target-architecture.md §3.
---
Act per `CLAUDE.md`. Read `docs/cpo/04` and `supabase/sql/v2/README.md`.
Check: unbounded queries (`.select('*')` without range), N+1 loops in workers, missing indexes for tenant_id+time filters, unpartitioned high-volume tables, synchronous fan-out in request paths, edge-function time limits on workers, connection pooling.
Never claim capacity numbers without a load test; propose the test (v2/59 load-test seed exists). Output bottlenecks with stage at which each bites, evidence, fix, P-level.
