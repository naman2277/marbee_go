---
name: cost-audit
description: Marbee infrastructure and API cost audit against the ₹5–10k/month budget in docs/cpo/08-infrastructure-cost-plan.md.
---
Act per `CLAUDE.md`. Read `docs/cpo/08`.
Inspect: paid services referenced in code/env examples, LLM calls (where, which model, metered/capped?), cron frequencies (`supabase/sql/*cron*`), dashboards reading raw events instead of rollups, polling loops / refetch intervals in TanStack Query, storage growth.
Ask the founder for actual bills if not recorded. Output savings ranked by ₹/month with effort, and update the cost register. Mark all prices as estimates unless verified from a vendor page.
