# Marbee CPO / CTO Documents

Living documents maintained by the AI CTO. They are the shared memory between the founder and every AI
coding agent working on Marbee. Update them in the same change as the decision they record.

**Baseline:** discovery performed 2026-11-10 on branch `claude/ai-cpo-agent-architecture-dc5831`
(single initial commit `7920146`).

| # | Document | Status |
|---|---|---|
| 01 | [Product Vision](01-product-vision.md) | Draft — needs founder input on ICP & pricing |
| 02 | [Current Architecture Assessment](02-architecture-assessment.md) | Baseline |
| 03 | [Product Gap Analysis](03-gap-analysis.md) | Baseline |
| 04 | [Target Architecture](04-target-architecture.md) | Proposed |
| 05 | [MVP Scope](05-mvp-scope.md) | Proposed |
| 06 | [UI/UX Design System](06-design-system.md) | Proposed |
| 07 | [Development Roadmap](07-roadmap.md) | Proposed |
| 08 | [Infrastructure & Cost Plan](08-infrastructure-cost-plan.md) | Proposed (prices are estimates) |
| 09 | [Security Baseline](09-security-baseline.md) | **Action required** |
| 10 | [Decision Log](10-decision-log.md) | Active |
| 11 | [Technical Debt Register](11-tech-debt-register.md) | Active |
| — | [Runbooks](runbooks/README.md): run, test, deploy, environments | Active |

## Evidence labels used throughout

- **Verified** — seen directly in the code or schema at the baseline commit.
- **Assumption** — reasonable belief not yet confirmed; listed so it can be confirmed.
- **Recommendation** — the CTO's proposal; not done until approved and built.
- **Estimate** — numbers (cost, effort) that need checking against live pricing or real measurement.

## Confirmed context (founder, 2026-11-10)

- **No live customers; dummy data only** in the Supabase project. App **not deployed publicly**.
- **Commitments:** 5 customers by **end of December 2026**, ~100k end-customer profiles each (~500k total);
  growing to **15 customers by March 2027** (~1.5M profiles).
- **Market sequence:** India → MENA → APAC → EMEA → North America (last).
- **Team:** founder + AI CTO (Claude). No other developers.

## Open questions for the founder

1. Which channels do the 5 committed customers need at go-live (Web Push / WhatsApp / Email / SMS)?
2. Are the commitments paid, and at what price? Signed or verbal?
3. What data do they bring (Shopify, website SDK, CSV, CRM)?
4. Execution authority for the AI CTO (to be recorded as a decision).
