# 06 — UI/UX Design System (proposed)

## 1. Current state (verified)

- Tailwind 4 `@theme` in `apps/web/src/index.css`: brand indigo (`brand-500 #6366f1`, `brand-600 #4f46e5`), accent teal, Inter.
- Shared kit `components/ui/index.tsx` (~98 lines): Button, Card, CardHeader, Badge, StatCard, EmptyState, PageHeader, plus Avatar, MarbeeLogo, ErrorBoundary, IconField.
- Primary-action colour is inconsistent: `bg-purple-600` ×125, `bg-brand-600` ×107, `bg-violet-600` ×66, `bg-indigo-600` ×55, `bg-blue-600` ×14.
- Adobe Spectrum tokens are a dependency and used for canvas styling (`spectrum-canvas.css`).
- Feature UIs are rich but each studio styles itself; very large single-file components.

## 2. Principles

1. **One primary action per view**, always `brand-600`. Secondary = outline; destructive = red, confirm dialog.
2. **Studio pattern** for builders (journey, cohort, email, landing, form): left library · centre canvas · right properties · top bar (name, status, undo/redo, test, publish).
3. **List pattern** for objects: PageHeader → filter bar → table/grid toggle → bulk actions → pagination.
4. **Every view has four states:** loading (skeleton), empty (what it is + one CTA), error (what happened + retry), success.
5. **Status language is uniform:** Draft · Scheduled · Live · Paused · Completed · Failed (same colours everywhere).
6. **Progressive disclosure:** advanced settings collapsed; defaults that work.
7. Accessible: WCAG AA contrast, keyboard reachable, visible focus, labels on icon buttons.
8. Responsive: desktop-first app (marketers work on laptops); lists and dashboards usable at tablet width; public pages (forms, landing, preference centre) mobile-first.

## 3. Tokens (to adopt)

| Token | Value |
|---|---|
| Primary | `brand-600` (hover `brand-700`, tint `brand-50`) |
| Accent | `accent-500/600` for highlights and charts only |
| Neutrals | slate-50 background, white surfaces, slate-200 borders, slate-900/600/400 text |
| Semantic | success emerald-600, warning amber-500, error red-600, info sky-600 |
| Radius | 8px controls, 12px cards, 16px modals |
| Spacing | 4px grid; page padding 24px; card padding 16–24px |
| Type | Inter; 12 / 14 (body) / 16 / 20 / 24 / 30 |
| Elevation | border-first; shadow only for popovers and modals |

## 4. Component work (P1, incremental — no big-bang restyle)

Add to `components/ui`: Input, Select, Textarea, Checkbox/Switch, Tabs, Modal/Drawer, Dropdown menu,
Table (sortable, selectable), Toast, Skeleton, Tooltip, StatusBadge, ConfirmDialog, FilterBar.
Rule: when a screen is touched for other reasons, migrate it to kit components and `brand-*` colours.
A lint check flagging new `bg-purple-600|bg-violet-600|bg-indigo-600` usages enforces it.

## 5. Navigation (recommended IA for MVP)

Home · Customers (profiles, audiences) · Journeys · Content (templates, assets, forms) · Data (sources,
schemas, jobs) · Analytics · Settings. Frozen modules hidden unless their flag is on.
