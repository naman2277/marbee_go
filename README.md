# Marbee — Customer Engagement & Marketing Automation Platform

Multi-tenant SaaS built on **Supabase** + **React**.

## Stack

- **Frontend:** React 19, TypeScript, Vite, Tailwind CSS, TanStack Query, React Flow
- **Backend:** Supabase (PostgreSQL, Auth, Storage, Edge Functions, Realtime)
- **Channels (P1):** Web Push via Firebase FCM

## Project Structure

```text
marbee/
├── apps/web/              # React dashboard
├── packages/shared/       # Shared TypeScript types
├── supabase/
│   ├── migrations/        # Database schema + RLS
│   ├── seed.sql           # Demo tenant, OOTB schemas
│   └── functions/         # Edge Functions (Deno)
└── docs/PRODUCT_BLUEPRINT.md
```

## Quick Start

### 1. Prerequisites

- Node.js 20+
- [Supabase CLI](https://supabase.com/docs/guides/cli)
- Docker (for local Supabase)

### 2. Install dependencies

```bash
npm install
```

### 3. Start Supabase locally

```bash
supabase start
supabase db reset   # runs migrations + seed
```

Copy the `anon key` and `API URL` from the output.

### 4. Configure environment

```bash
cp apps/web/.env.example apps/web/.env.local
```

Edit `apps/web/.env.local` with your Supabase URL and anon key.

### 5. Start the web app

```bash
npm run dev
```

Open [http://localhost:5173](http://localhost:5173)

### 6. Create an account

Sign up on the login page. For full tenant access, link your user to the demo tenant in Supabase Studio (`tenant_users` table).

## Edge Functions

```bash
supabase functions serve
```

| Function | Purpose |
|---|---|
| `events-ingest` | Track events from SDK/API |
| `push-subscribe` | Register Web Push FCM tokens |
| `channel-send` | Send Web Push via Firebase |
| `rtm-ingest` | Real-Time Messages — public `POST /v1/messages` ingest (auth, validate, enqueue, 202) |
| `rtm-worker` | Real-Time Messages — replay / retry a message through the pipeline |

Example event:

```bash
curl -X POST http://127.0.0.1:54321/functions/v1/events-ingest \
  -H "Authorization: Bearer YOUR_ANON_KEY" \
  -H "X-Tenant-Id: 00000000-0000-0000-0000-000000000001" \
  -H "X-Environment: production" \
  -H "Content-Type: application/json" \
  -d '{"event_type":"cart_abandoned","identity":{"ecid":"anon_123"},"properties":{"cart_value":12400}}'
```

Example real-time message (needs a tenant API key with the `events:write` scope, and
an **active** definition for the event — see Real-Time Messages in the dashboard):

```bash
curl -X POST http://127.0.0.1:54321/functions/v1/rtm-ingest \
  -H "Authorization: Bearer YOUR_TENANT_API_KEY" \
  -H "Idempotency-Key: $(uuidgen)" \
  -H "Content-Type: application/json" \
  -d '{"event":"order_shipped","to":{"customer_id":"..."},"data":{"order_id":"A-2231","eta":"2026-08-30","tracking_url":"https://track.acme.io/A-2231"}}'
```

Schema: run `supabase/sql/51_realtime_messages.sql` (after `37_access_management_rbac.sql`).

## What's Built (P1 Foundation)

- [x] Supabase schema: tenants, customers, events, journeys, content, connectors
- [x] Row Level Security for multi-tenancy
- [x] React dashboard with full navigation
- [x] Command Center with live stats
- [x] Customer 360 list + detail + timeline
- [x] Journey list + visual canvas editor (React Flow)
- [x] Real-Time Messages engine — payload schema builder, template editor + live preview, guardrails, per-message trace, DLQ replay, usage metering (`rtm-ingest` / `rtm-worker`)
- [x] Schema management list view
- [x] Edge Functions: events, push subscribe, channel send
- [x] Auth (sign up / sign in)

## Roadmap

See [docs/PRODUCT_BLUEPRINT.md](docs/PRODUCT_BLUEPRINT.md) for full P1/P2/P3 specification.

## License

Private — All rights reserved.
