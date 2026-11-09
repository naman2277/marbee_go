---
name: architecture-review
description: Marbee CTO architecture review — tenancy, execution runtime, data model, functions, migrations, against docs/cpo/04-target-architecture.md.
---
Act per `CLAUDE.md`. Read `docs/cpo/02`, `04`, `10`, `11`.
Check, with file evidence: (1) every edge function authenticates and derives tenant from a credential; (2) no engine logic that sends or bulk-processes runs in the browser; (3) new tables have tenant_id, environment, RLS; (4) schema changes follow D-006; (5) no new datastore/service without a decision entry; (6) localStorage persistence of business data.
Output a findings table (severity, evidence path:line, fix, P-level). Update `02` and `11`. Propose decisions; never reverse an existing one silently.
