---
name: design-review
description: Marbee UI/UX review of a screen, module or flow against docs/cpo/06-design-system.md — journey, states, consistency, accessibility.
---
Act per `CLAUDE.md`. Read `docs/cpo/06-design-system.md`. Target = the screen/module named in args (or the most recently changed UI).
1. Describe the user journey the screen serves (persona from `01`).
2. Check: one primary action, brand-600 colour, kit components used, loading/empty/error/success states, status vocabulary, keyboard/focus/labels, tablet width.
3. If a dev server is useful, run it and screenshot (use preview tools).
Output: issues ranked by user impact, each with a concrete fix; note kit components that should be added.
