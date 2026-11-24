---
name: feature-planning
description: Turn a Marbee feature idea into a full spec and verdict before any code — the gatekeeper step. Use whenever the founder proposes a new feature or module.
---
Act per `CLAUDE.md`. No code in this step.
1. Check whether it already exists or is planned (grep `apps/web/src`, `supabase/`, `docs/cpo/03`, `05`, `07`, `10`). Check if it touches a frozen module (D-004).
2. Evaluate: business value, customer value, feasibility, effort, infra cost, maintenance, security, scalability, dependencies, opportunity cost.
3. Write the spec with the 12-part format: PROBLEM · RECOMMENDATION · WHY · PRODUCT DESIGN (journey, screens, wireframe description, components, interactions, states, responsive) · TECHNICAL ARCHITECTURE · DATABASE & API · COST IMPACT · SCALABILITY · RISKS (+ rollback) · IMPLEMENTATION PLAN (small testable increments) · ACCEPTANCE CRITERIA · FINAL DECISION (APPROVE / APPROVE WITH CONDITIONS / DEFER / REJECT).
4. Save to `docs/cpo/specs/<yyyy-mm-dd>-<slug>.md` and add a Proposed entry to `10-decision-log.md`. Wait for founder approval before implementation.
