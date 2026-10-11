# Marbee — Product Blueprint

**Customer Engagement & Marketing Automation Platform**

> One platform to collect customer data, understand customers, orchestrate journeys, make decisions, and activate every channel.

**Version:** 1.1  
**Status:** Specification for P1 Development  
**Backend:** Supabase (PostgreSQL, Auth, Storage, Edge Functions, Realtime)  
**Positioning:** Multi-tenant SaaS — Connect → Understand → Decide → Orchestrate → Engage → Measure

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Core Platform Architecture](#2-core-platform-architecture) — incl. [Supabase Backend](#26-supabase-backend-architecture)
3. [Information Architecture & Navigation](#3-information-architecture--navigation)
4. [Multi-Tenancy & Environments](#4-multi-tenancy--environments)
5. [Module Specifications](#5-module-specifications)
6. [Page-Level UI Specifications](#6-page-level-ui-specifications)
7. [Database & Schema Model](#7-database--schema-model)
8. [Event Architecture](#8-event-architecture)
9. [API Architecture](#9-api-architecture)
10. [Channel Abstraction & BYOP Layer](#10-channel-abstraction--byop-layer)
11. [AI Layer](#11-ai-layer)
12. [Security & Compliance](#12-security--compliance)
13. [Scalability & Infrastructure](#13-scalability--infrastructure)
14. [User Roles & Permissions](#14-user-roles--permissions)
15. [Product Roadmap](#15-product-roadmap)
16. [Development Epics](#16-development-epics)

---

## 1. Executive Summary

### 1.1 Product Vision

Marbee is an enterprise-grade, multi-tenant SaaS platform for customer engagement and marketing automation. It is **not** a lightweight CRM or campaign scheduler — it is a full **Customer Engagement Platform (CEP)** built on five core engines:

```
Data → Audience → Decision → Journey → Channel
```

### 1.2 Initial Wedge (P1)

| Capability | Description |
|---|---|
| **Web Push** | Firebase FCM, token lifecycle, delivery & engagement tracking |
| **Real-Time Events** | Event/API-triggered transactional messaging |
| **Journey Automation** | Visual orchestration with conditions, waits, versioning |
| **Data Platform** | Schemas, identity resolution, connectors, data jobs |
| **Customer 360** | Unified profile, timeline, communication history |
| **Content** | Asset CDN, forms, landing pages |
| **Analytics** | Command center, delivery, engagement, conversions |

### 1.3 Progressive Expansion

```
P1: Web Push + Real-Time + Journeys + Data + Content + Analytics
P2: WhatsApp + SMS/RCS (BYOP) + Campaigns + Audiences + Guardrails + AI
P3: Email (BYOP) + Loyalty + Decisioning + Predictive + Attribution
```

### 1.4 Key Differentiators

- **Channel-agnostic architecture** — BYOP from day one in the data model
- **Dual orchestration engines** — Journey (customer-facing) vs Workflow (data-facing)
- **Real-time messaging** separated from batch journeys
- **Embedded AI** across audience, journey, content, insights, and debugging
- **Enterprise multi-tenancy** with environment isolation (Dev / Staging / Prod) via Supabase RLS
- **Supabase-native backend** — ship P1 faster with Postgres, Auth, Storage, Edge Functions, Realtime

---

## 2. Core Platform Architecture

### 2.1 Engine Stack

```
┌─────────────────────────────────────────────────────────────────┐
│                        EXPERIENCE LAYER                          │
│  Command Center │ Customer 360 │ Journey Canvas │ Data Studio   │
└───────────────────────────────┬─────────────────────────────────┘
                                │
┌───────────────────────────────▼─────────────────────────────────┐
│                      ORCHESTRATION LAYER                         │
│   Journey Engine  │  Real-Time Engine  │  Workflow Engine       │
└───────────────────────────────┬─────────────────────────────────┘
                                │
        ┌───────────────────────┼───────────────────────┐
        ▼                       ▼                       ▼
┌───────────────┐     ┌─────────────────┐     ┌─────────────────┐
│   AUDIENCE    │     │    DECISION     │     │    CONTENT      │
│   ENGINE      │     │    ENGINE       │     │    ENGINE       │
│ Segments/Cohort│     │ Rules/Offers    │     │ Assets/Forms/LP │
└───────┬───────┘     └────────┬────────┘     └────────┬────────┘
        │                      │                       │
        └──────────────────────┼───────────────────────┘
                               ▼
                ┌──────────────────────────┐
                │    CUSTOMER PROFILE      │
                │  360° View │ Identity    │
                │  Resolution │ Timeline    │
                └────────────┬─────────────┘
                             ▼
                ┌──────────────────────────┐
                │     DATA PLATFORM        │
                │ Schemas │ Events │ ETL   │
                │ Connectors │ Quality     │
                └────────────┬─────────────┘
                             ▼
                ┌──────────────────────────┐
                │   CHANNEL ABSTRACTION    │
                │ Web Push │ WhatsApp │ SMS │
                │ RCS │ Email │ API        │
                └──────────────────────────┘
```

### 2.2 Data Flow — Real-Time Messaging

```
Event / API Request
       ↓
Event Validation & Schema Enforcement
       ↓
Identity Resolution (ECID → Customer ID)
       ↓
Audience / Trigger Rule Evaluation
       ↓
Decision Engine (Eligibility, Offers) [P3 full; P1 stub]
       ↓
Guardrails (Frequency, Quiet Hours, Suppression)
       ↓
Channel Selection & Provider Routing
       ↓
Send → Track → Engage → Attribute
```

### 2.3 Data Flow — Journey Orchestration

```
Entry Trigger (Event / Schedule / Segment / API / Form)
       ↓
Journey Instance Created (per customer)
       ↓
Node Execution Loop:
  ├── Condition → Branch
  ├── Wait → Resume on timer/event
  ├── Action → Send / Update / Webhook
  └── Exit
       ↓
State Persisted → Audit Log → Analytics
```

### 2.4 Data Flow — Data Workflow (ETL)

```
Source (SFTP / Webhook / Connector)
       ↓
Ingest → Validate → Transform → Deduplicate
       ↓
Load to Schema (Customer / Events / Custom)
       ↓
Side Effects: Update Audience │ Trigger Journey │ Emit Event
```

### 2.5 Technology Stack (Supabase-First)

| Layer | Technology |
|---|---|
| **Frontend** | React 18+, TypeScript, TanStack Query, React Flow (journey canvas), Tailwind CSS |
| **Backend Platform** | **Supabase** — Postgres, Auth, Storage, Edge Functions, Realtime |
| **Database** | Supabase PostgreSQL 15+ with RLS, migrations, pg_cron, pgmq |
| **Auth** | Supabase Auth (email, OAuth, magic link; SSO SAML [P2]) |
| **API — CRUD** | Supabase PostgREST (auto-generated from schema) |
| **API — Logic** | Supabase Edge Functions (Deno/TypeScript) |
| **Realtime** | Supabase Realtime (dashboards, journey monitor, timeline) |
| **Object Storage** | Supabase Storage (assets, form uploads, landing pages) |
| **Job Queue** | pgmq (Postgres message queue) + Edge Function workers |
| **Scheduling** | pg_cron + Supabase Edge Functions |
| **Search** | PostgreSQL full-text search (P1); OpenSearch [P2] if needed |
| **Analytics** | PostgreSQL partitioned tables + materialized views (P1); ClickHouse [P2+] |
| **Web Push** | Firebase FCM via Edge Function adapter (P1 provider) |
| **AI** | Edge Function → OpenAI / Azure OpenAI with tenant-scoped prompts |
| **Observability** | Supabase Dashboard + Logflare; Sentry for app errors [P1] |

### 2.6 Supabase Backend Architecture

#### 2.6.1 High-Level Layout

```
┌─────────────────────────────────────────────────────────────────┐
│  React App (Vite)          │  Web Push SDK (public)            │
│  @supabase/supabase-js     │  Edge Functions (anon key)        │
└──────────────┬─────────────┴──────────────────┬─────────────────┘
               │                                │
               ▼                                ▼
┌──────────────────────────────────────────────────────────────────┐
│                     SUPABASE PLATFORM                             │
│  ┌────────────┐  ┌─────────────┐  ┌──────────┐  ┌─────────────┐ │
│  │ PostgREST  │  │ Edge Funcs  │  │ Realtime │  │  Storage    │ │
│  │ (auto API) │  │ (Deno/TS)   │  │ (WS)     │  │  (CDN URLs) │ │
│  └─────┬──────┘  └──────┬──────┘  └────┬─────┘  └──────┬──────┘ │
│        └────────────────┼──────────────┴───────────────┘        │
│                         ▼                                        │
│              PostgreSQL + RLS + pgmq + pg_cron                   │
│              Supabase Auth (JWT with tenant claims)              │
└──────────────────────────────────────────────────────────────────┘
               │
               ▼
        Firebase FCM, external webhooks, SFTP, CRM APIs
```

#### 2.6.2 Repository Structure

```text
marbee/
├── apps/
│   └── web/                    # React dashboard
├── packages/
│   ├── sdk/                    # Web Push + event tracking SDK
│   └── shared/                 # Types, validators shared with Edge Functions
├── supabase/
│   ├── config.toml
│   ├── migrations/             # SQL schema, RLS policies, functions
│   ├── seed.sql                # OOTB schemas, roles, demo tenant
│   └── functions/
│       ├── events-ingest/      # Event API + batch ingest
│       ├── identity-resolve/   # ECID → customer linking
│       ├── journey-runner/     # Journey instance state machine
│       ├── journey-scheduler/  # Wait nodes, cron resume (pg_cron trigger)
│       ├── realtime-send/      # Real-time trigger → channel send
│       ├── channel-send/       # Unified send + provider adapters
│       ├── channel-webhook/    # FCM/DLR inbound webhooks
│       ├── connector-sync/     # ETL / connector jobs
│       ├── workflow-runner/    # Data job orchestration
│       ├── analytics-rollup/   # Materialized view refresh (pg_cron)
│       ├── ai-assist/          # LLM proxy with tenant context [P2]
│       └── _shared/            # Provider adapters, auth helpers
└── docs/
    └── PRODUCT_BLUEPRINT.md
```

#### 2.6.3 Multi-Tenancy via RLS

Every tenant-scoped table enforces isolation with Row Level Security:

```sql
-- Helper: read tenant + environment from JWT custom claims
CREATE OR REPLACE FUNCTION auth.tenant_id()
RETURNS UUID AS $$
  SELECT (auth.jwt() -> 'app_metadata' ->> 'tenant_id')::UUID;
$$ LANGUAGE sql STABLE;

CREATE OR REPLACE FUNCTION auth.environment()
RETURNS TEXT AS $$
  SELECT auth.jwt() -> 'app_metadata' ->> 'environment';
$$ LANGUAGE sql STABLE;

-- Example policy on customers
ALTER TABLE customers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tenant_isolation" ON customers
  FOR ALL
  USING (
    tenant_id = auth.tenant_id()
    AND environment = auth.environment()
  );
```

**JWT `app_metadata` (set on invite / tenant switch):**

```json
{
  "tenant_id": "uuid",
  "environment": "production",
  "role": "marketing_manager"
}
```

**Service role key:** Used only inside Edge Functions and pg_cron workers — never exposed to the browser.

#### 2.6.4 PostgREST vs Edge Functions

| Use PostgREST (direct) | Use Edge Functions |
|---|---|
| CRUD on journeys, schemas, assets metadata | Event ingestion + validation |
| List/filter customers, connectors, forms | Identity resolution & merge |
| Read audit logs, settings | Journey execution & wait resume |
| Tenant user management (via RLS) | Channel send (Firebase, future BYOP) |
| Realtime subscriptions on tables | Real-time trigger evaluation |
| | Webhook ingress (connectors, DLR) |
| | ETL / connector sync |
| | Analytics rollups, AI proxy |
| | Public form submit & SDK endpoints |

#### 2.6.5 Edge Function API Surface (P1)

Custom APIs live at `{SUPABASE_URL}/functions/v1/`:

```
POST   /events-ingest              # SDK + connector events (API key auth)
POST   /identity-resolve           # Link anonymous → known
POST   /journey-enter              # API trigger entry
POST   /channel-send               # Manual/test send
POST   /channel-webhook            # Provider callbacks
POST   /push-subscribe             # Web Push token registration
POST   /form-submit                # Public form endpoint
POST   /connector-webhook/{id}     # Inbound connector data
GET    /analytics-overview         # Aggregated dashboard metrics
POST   /ai-assist                  # AI features [P2]
```

Dashboard CRUD continues to use `@supabase/supabase-js` against PostgREST tables.

#### 2.6.6 Job Queue & Scheduling

**pgmq** handles async work without external Redis/Kafka in P1:

```text
Event ingested → INSERT events + pgmq.send('journey_triggers', payload)
                      ↓
              Edge Function worker (cron every 10s or DB webhook)
                      ↓
              Journey runner / Real-time send / Analytics update
```

**pg_cron** schedules:

- Journey wait node resume (every minute)
- Connector sync jobs
- Analytics materialized view refresh (every 5 min)
- Data retention cleanup

#### 2.6.7 Supabase Storage Buckets

| Bucket | Access | Purpose |
|---|---|---|
| `assets` | Public read, auth write | Images, videos, CDN URLs |
| `documents` | Private + signed URLs | PDFs, internal files |
| `form-uploads` | Private | User file upload fields |
| `landing-pages` | Public read | Published HTML/assets |
| `connector-staging` | Private | SFTP/CSV inbound files |

Path convention: `{tenant_id}/{environment}/{folder}/{filename}`

#### 2.6.8 Supabase Realtime (P1)

Subscribe to live updates without polling:

- `journey_instances` — journey monitor dashboard
- `engagement_log` — Command Center live counters
- `connector_runs` — sync status
- `events` (filtered by customer_id) — Customer 360 timeline

#### 2.6.9 P1 → P2 Scaling Path

Supabase covers P1 fully. When volume exceeds single-DB comfort:

| Bottleneck | P2+ Option |
|---|---|
| Event volume | Partition `events` by month; archive to cold storage |
| Analytics queries | Read replica + materialized views; ClickHouse export |
| Send throughput | Dedicated channel-send workers; pgmq consumer scaling |
| Enterprise tenant | Supabase dedicated project per tenant |
| Search | OpenSearch or Postgres `pg_trgm` + dedicated index |

---

## 3. Information Architecture & Navigation

### 3.1 Primary Navigation

```
HOME
├── Command Center
├── Insights
└── AI Assistant

CUSTOMER
├── Customer Profiles
├── Audiences                    [P2]
├── Events
└── Subscriptions

JOURNEYS
├── Journeys
├── Campaigns                    [P2]
├── Real-Time Messages
├── Triggers
└── Journey Analytics

CONTENT
├── Asset Library
├── Templates                    [P2]
├── Content Blocks               [P2]
├── Forms
└── Landing Pages

DATA
├── Schemas
├── Data Explorer
├── Connectors
├── Data Jobs
├── Workflows
└── Data Quality

DECISION                       [P3]
├── Offers
├── Decision Rules
├── Coupons
└── Eligibility

LOYALTY                        [P3]
├── Dashboard
├── Customers
├── Tiers & Points
└── Gamification

REPORTING
├── Campaign Performance       [P2 campaigns]
├── Journey Performance
├── Channel Performance
├── Customer Analytics
└── Revenue Attribution

SETTINGS
├── General
├── Channels
├── Guardrails                 [P2 advanced]
├── System Notifications       [P2]
├── API Keys
├── Access Management
├── License & Usage
├── Credits
├── Billing
└── Documentation
```

### 3.2 Global UI Patterns

| Pattern | Usage |
|---|---|
| **List → Detail → Edit** | Journeys, customers, schemas, connectors |
| **Canvas Builder** | Journeys, landing pages, workflow ETL |
| **Wizard** | Connector setup, form publish, channel config |
| **Slide-over Panel** | Quick profile view, node config, audit trail |
| **Command Palette** | ⌘K global search + AI assistant entry |
| **Breadcrumb + Tabs** | Detail pages with sub-sections |
| **Status Badges** | Draft / Published / Paused / Archived |
| **Environment Switcher** | Dev / Staging / Production (header) |

### 3.3 Design System Tokens

- **Primary:** Deep indigo `#4F46E5` — trust, enterprise
- **Accent:** Teal `#14B8A6` — engagement, action
- **Surface:** Slate scale — `#F8FAFC` bg, `#0F172A` text
- **Status:** Green (active), Amber (draft/warning), Red (error/suppressed), Blue (info)
- **Typography:** Inter (UI), JetBrains Mono (code/SQL/API)
- **Density:** Compact tables for data-heavy screens; comfortable for builders

---

## 4. Multi-Tenancy & Environments

### 4.1 Tenant Hierarchy

```
Platform
 └── Tenant (Organization)
      ├── Environment: development
      ├── Environment: staging
      └── Environment: production
           ├── Users & Roles
           ├── Schemas & Data
           ├── Journeys & Campaigns
           ├── Channel Configurations
           ├── Connectors
           └── Analytics
```

### 4.2 Tenant Isolation Model

**Supabase RLS-first approach (P1):**

| Data Type | Isolation Strategy |
|---|---|
| Platform config, billing | Shared Supabase project, `tenant_id` + RLS policies |
| Customer PII, events | Same DB, RLS + environment column; dedicated Supabase project [P3 enterprise] |
| Assets / files | Supabase Storage bucket path: `{tenant_id}/{environment}/` |
| Analytics | PostgreSQL partitioned tables by `tenant_id` + date; materialized views |
| Background jobs | pgmq queues scoped by `tenant_id` in message payload |
| Edge Functions | Validate JWT claims or API key → resolve tenant before any DB write |

**Supabase Auth mapping:**

```text
auth.users          → platform login identity
public.tenant_users → tenant membership + role_id
public.tenants      → organization record
public.environments → dev / staging / production per tenant
```

On login or environment switch, update JWT `app_metadata` via Edge Function or Auth hook.

### 4.3 Standard Entity Fields

Every major entity includes:

```sql
tenant_id       UUID NOT NULL
environment     VARCHAR(20) NOT NULL  -- development | staging | production
created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
created_by      UUID
updated_by      UUID
deleted_at      TIMESTAMPTZ  -- soft delete
version         INTEGER DEFAULT 1
```

### 4.4 Environment Behavior

| Feature | Dev | Staging | Production |
|---|---|---|---|
| Send to real channels | Sandbox only | Limited / test numbers | Full |
| Journey publish | Instant | Requires review optional | Approval required (configurable) |
| Data retention | 30 days | 90 days | Per license |
| API rate limits | Low | Medium | Per plan |

---

## 5. Module Specifications

### 5.1 HOME — Command Center

**Purpose:** Operational heartbeat of the platform.

**Widgets (P1):**
- Today's messages sent, delivered, engaged, conversions, revenue
- Channel performance table (Web Push P1; others as enabled)
- Active journeys count & throughput
- Failed deliveries alert strip
- Recent audit events
- System health (connector status, queue depth)

**Widgets (P2+):**
- AI anomaly alerts ("Campaign X CTR dropped 40%")
- Guardrail violations summary
- Credit consumption gauge

---

### 5.2 CUSTOMER — Customer 360

**Purpose:** Single pane for identity, behavior, and communication.

**Capabilities (P1):**
- Unified profile (attributes from Customer schema)
- Identity graph (ECID, email, mobile, device, external IDs)
- Channel subscription status (Web Push, future channels)
- Communication history (sent, delivered, opened, clicked, failed)
- Event timeline (product viewed, cart created, etc.)
- Active / completed / exited journeys
- Manual profile edit & merge
- Exclusion / suppression view

**Capabilities (P2):**
- Audience membership tags
- AI summary ("High-value inactive traveler")

**Data Sources:** Customer, Identity, Engagement Log, Events, Exclusion, Journey Instances

---

### 5.3 CUSTOMER — Audiences [P2]

**Three builder modes:**

1. **Visual Builder** — AND/OR rule groups on profile & event attributes
2. **SQL / Advanced** — Raw query against tenant schemas
3. **AI Prompt Builder** — NL → rule tree → user confirms → execute

**Audience Types:**
- Static (snapshot)
- Dynamic (re-evaluated on schedule or event)
- Lookalike [P3]

**Outputs:** Used by Journeys, Campaigns, Decision Engine

---

### 5.4 JOURNEYS — Journey Engine [P1]

**Purpose:** Visual customer-facing orchestration — killer feature.

#### Journey Lifecycle

```
Draft → Validate → Test → Submit for Approval → Published → Paused → Archived
                              ↓
                         Version N+1 (duplicate & edit)
```

#### Entry Triggers (P1)

| Trigger | Description |
|---|---|
| Event | `cart_abandoned`, `product_viewed`, custom events |
| API | External system invokes journey entry |
| Schedule | Cron / one-time datetime |
| Profile Update | Attribute change (e.g., tier upgrade) |
| Segment Entry/Exit | [P2 when audiences ship] |
| Form Submission | Form ID match |
| Webhook | Inbound HTTP trigger |
| Transactional Event | Real-time classified events |

#### Node Types (P1)

**Conditions:** Profile attributes, event attributes, audience membership [P2], behavior, date/time, frequency, previous engagement

**Actions:**
- Send Web Push
- Send API Message (generic outbound)
- Update Profile
- Add/Remove Audience [P2]
- Wait (duration or until event)
- Call Webhook
- Data Update (schema record)
- Exit Journey

#### Journey Instance State Machine

```
ENTERED → ACTIVE → WAITING → ACTIVE → ... → COMPLETED
                    ↓
                 EXITED (condition / manual / error)
```

#### Versioning & Audit

- Immutable published versions
- Running instances stay on entry version OR migrate (configurable)
- Full audit: who changed what node when

---

### 5.5 JOURNEYS — Real-Time Messages [P1]

**Purpose:** Event-driven engine separate from batch journeys.

**Pipeline:**
```
Event/API → Validation → Identity → Rules → Guardrails → Channel → Log
```

**Use Cases (P1):**
- OTP / verification
- Booking / payment confirmation
- Dispatch / delivery updates
- Abandon cart (immediate, not journey wait)
- Price drop alerts
- Application status

**Configuration UI:**
- Trigger definition (event type + filters)
- Message template binding
- Channel priority fallback [P2]
- Rate limits per trigger
- Test harness (send to test profile)

---

### 5.6 JOURNEYS — Campaigns [P2]

**Purpose:** One-shot or scheduled blast campaigns.

**Features:**
- Audience selection
- Channel selection (multi-channel orchestration)
- Content / template binding
- Schedule or send now
- Approval workflow
- Frequency caps & guardrails
- A/B variants [P2]
- Personalization tokens [P2]

**Difference from Journey:** Campaign = single send orchestration; Journey = multi-step stateful flow.

---

### 5.7 CONTENT — Asset Library [P1]

**Asset Types:** Images, Videos, Documents, GIFs, Fonts, Files

**Features:**
- Folder hierarchy, tags, search
- Metadata editor (alt text, MIME, dimensions)
- Preview (image/video/PDF)
- Version history
- Public URL + CDN URL generation
- Expiry date
- Usage tracking ("Used in 14 campaigns, 3 journeys, 7 templates")
- Replace-in-place (updates references)
- Archive / soft delete
- Access control (role-based)

**Storage:** Supabase Storage + public CDN URLs; DB tracks metadata & references

---

### 5.8 CONTENT — Forms [P1]

**Form Builder Components:**
Text, Email, Phone, Dropdown, Checkbox, Radio, Date, Number, Hidden, Consent, OTP, File Upload

**Submission Pipeline:**
```
Form Submit → Validation → Create/Update Profile → Emit Event → Audience [P2] → Journey Entry
```

**Features:**
- Embed code / hosted URL
- reCAPTCHA
- Double opt-in
- Field → schema mapping
- Thank-you page / redirect
- Submission export

---

### 5.9 CONTENT — Landing Pages [P1]

**Builder Components:**
Header, Hero, Image, Video, Text, CTA, Form, Product, Offer, Countdown, HTML, Footer

**Features (P1):**
- Drag-drop visual builder
- Responsive preview (desktop / tablet / mobile)
- SEO (title, meta, OG tags)
- Custom domain / subdomain
- UTM parameter support
- Page analytics (views, conversions)
- Versioning & publish

**P2:** A/B testing, personalization blocks

---

### 5.10 CONTENT — Templates & Content Blocks [P2]

- Channel-specific templates (WhatsApp, SMS, Web Push, Email)
- Reusable content blocks (header, footer, legal)
- Variable placeholders `{{customer.name}}`
- Approval status per channel (e.g., WhatsApp Meta approval)

---

### 5.11 DATA — Schema Management [P1]

**Three Tabs:**

1. **Schema List** — Name, Type, Records, Fields, Last Updated, Source, Status
2. **Relationship Diagram** — Interactive ERD
3. **Schema Builder** — Visual field editor

**Field Properties:**
Name, Type, Required, Primary Key, Nullable, Default, PII flag, Index, Description

**OOTB Schemas:** See [Section 7](#7-database--schema-model)

---

### 5.12 DATA — Data Explorer [P1]

- SQL-like query UI against tenant schemas
- Filter, sort, export CSV
- Save queries
- PII masking based on role

---

### 5.13 DATA — Connectors [P1]

**Inbound:** REST API, Webhook, HTTPS, SFTP, CSV, Google Sheets, Forms, Database, Cloud Storage

**Outbound:** REST API, Webhook, HTTPS, SFTP, Google Sheets, Database, File Export

**External Systems:** CRM, CDP, E-commerce, POS, Booking, DWH

**Connector Pipeline:**
```
Source → Connector → Mapping → Validation → Transformation → Schema → Data Store
```

**UI:** Connection wizard, field mapping drag-drop, test connection, sync schedule, error log

---

### 5.14 DATA — Data Jobs & Workflows [P1]

**Job Types:** Scheduled, Event-triggered, Manual

**Operations:** Import, Export, ETL, Validation, Deduplication, Transform, API Call, SQL

**Example Workflow:**
```
SFTP File Arrives → Validate → Transform → Dedupe → Load Customer → Update Audience [P2] → Trigger Journey
```

**UI:** Visual workflow canvas (similar to journey but data-focused)

---

### 5.15 DATA — Data Quality [P1]

- Validation rules per schema field
- Duplicate detection config
- Completeness scores
- Anomaly flags
- Quality dashboard

---

### 5.16 DECISION — Decision Engine [P3]

```
Customer → Eligibility → Business Rules → Prioritization → Offer → Channel
```

**Components:**
- Offers catalogue
- Decision rules (visual + API)
- Coupons
- Eligibility matrices
- Next-best-action [P3]

**P1 Stub:** Pass-through for real-time triggers; full engine P3

---

### 5.17 LOYALTY [P3]

- Programs, tiers, points ledger
- Transactions, rewards, expiry rules
- Gamification (badges, challenges)
- Loyalty dashboard & customer view

---

### 5.18 REPORTING [P1/P2]

| Report | P1 | P2 | P3 |
|---|---|---|---|
| Command Center | ✓ | | |
| Journey Performance | ✓ | ✓ | |
| Channel Performance | ✓ (Web Push) | ✓ (all) | |
| Campaign Performance | | ✓ | |
| Delivery & Engagement | ✓ | ✓ | |
| Conversions | ✓ | ✓ | |
| Revenue Attribution | Basic | | Multi-touch |
| Customer Analytics | ✓ | ✓ | |
| Operational Dashboards | ✓ | ✓ | |

---

### 5.19 SETTINGS [P1]

**Organization:** General, Brand, Domains, Timezone, Currency

**Security:** Users, Roles, Permissions, SSO [P2], API Keys, Audit Logs

**Channels:** Web Push (Firebase), WhatsApp [P2], SMS/RCS [P2], Email [P3]

**Usage:** License, Credits, Consumption, Limits, Billing

**Platform:** Guardrails [P2], System Notifications [P2], Webhooks, Integrations

**Developer:** API docs, SDK, Webhook logs

---

## 6. Page-Level UI Specifications

### 6.1 Command Center (`/home`)

```
┌─────────────────────────────────────────────────────────────────┐
│ [Env: Production ▼]  Marbee                    [🔔] [👤 User]  │
├─────────────────────────────────────────────────────────────────┤
│ COMMAND CENTER                              [Date Range ▼]      │
├──────────┬──────────┬──────────┬──────────┬─────────────────────┤
│ Sent     │ Delivered│ Engaged  │ Converted│ Revenue             │
│ 2.4M     │ 2.2M     │ 684K     │ 82K      │ ₹4.8Cr              │
├─────────────────────────────────────────────────────────────────┤
│ CHANNEL PERFORMANCE                                             │
│ Channel    │ Sent  │ Delivery │ CTR   │ Conv │ Trend            │
│ Web Push   │ 800K  │ 96%      │ 8.2%  │ 21K  │ ▁▂▃▅▆            │
├─────────────────────────────────────────────────────────────────┤
│ ACTIVE JOURNEYS          │ RECENT FAILURES        │ CONNECTORS  │
│ Abandon Cart    12.4K/d  │ Push token invalid 23  │ SFTP ✓      │
│ Welcome Series   3.1K/d  │ Webhook timeout    2   │ CRM  ⚠      │
└─────────────────────────────────────────────────────────────────┘
```

---

### 6.2 Customer 360 (`/customers/:id`)

```
┌─────────────────────────────────────────────────────────────────┐
│ ← Customers    JOHN DOE                    [Edit] [Merge] [···]  │
├─────────────────────────────────────────────────────────────────┤
│ john@email.com  +91 XXXXX XXXXX    Status: Active    Gold [P3]  │
├──────────────────────────────┬──────────────────────────────────┤
│ PROFILE                    │ CHANNELS                          │
│ DOB, Gender, Location      │ ✓ Web Push  ✓ Email [P3]          │
│ Consent: Marketing ✓       │ ✓ WhatsApp [P2]  ✓ SMS [P2]       │
├──────────────────────────────┼──────────────────────────────────┤
│ AUDIENCES [P2]             │ ENGAGEMENT                        │
│ VIP │ Frequent Traveller   │ Open 42% │ Click 8% │ Last: 2h ago │
├──────────────────────────────┴──────────────────────────────────┤
│ [Timeline] [Events] [Communications] [Journeys] [Exclusions]    │
├─────────────────────────────────────────────────────────────────┤
│ TODAY                                                           │
│ 10:31  product_viewed        SKU: FL-123                       │
│ 10:32  cart_created          ₹12,400                           │
│ 10:35  web_push_sent         "Complete your booking"           │
│ 10:40  web_push_clicked                                       │
│ 11:02  purchase_completed    ₹12,400                           │
└─────────────────────────────────────────────────────────────────┘
```

---

### 6.3 Journey Canvas (`/journeys/:id/edit`)

```
┌─────────────────────────────────────────────────────────────────┐
│ ← Abandon Cart Journey    Draft v3    [Validate][Test][Publish] │
├─────────────────────────────────────────────────────────────────┤
│ NODE PALETTE          │           CANVAS                        │
│ ┌ Triggers            │     ┌─────────────┐                     │
│ ├ Conditions          │     │ cart_abandoned│                    │
│ ├ Actions             │     └──────┬──────┘                     │
│ ├ Wait                │            ▼                            │
│ └ Exit                │     ┌─────────────┐                     │
│                       │     │ Wait 1 hour │                     │
│ SELECTED NODE CONFIG  │     └──────┬──────┘                     │
│ ┌─────────────────┐   │            ▼                            │
│ │ Wait: 1 hour    │   │     ┌─────────────┐      ┌──────────┐  │
│ │ Or until event│   │     │ Has booked? │─No──→│ Web Push │  │
│ └─────────────────┘   │     └──────┬──────┘      └──────────┘  │
│                       │          Yes → Exit                     │
└─────────────────────────────────────────────────────────────────┘
```

**Toolbar:** Zoom, minimap, undo/redo, version history, audit log

---

### 6.4 Schema Builder (`/data/schemas/:id`)

**Tab 1 — Fields**

| Field | Type | Required | PK | PII | Index | Actions |
|---|---|---|---|---|---|---|
| customer_id | UUID | ✓ | ✓ | | ✓ | Edit |
| email | Email | | | ✓ | ✓ | Edit |
| mobile | Phone | | | ✓ | ✓ | Edit |

**Tab 2 — ERD** — Interactive React Flow diagram

**Tab 3 — Data** — Inline grid preview (paginated)

---

### 6.5 Real-Time Trigger Editor (`/journeys/real-time/:id`)

```
Trigger Name: booking_confirmation
Event Type:   booking_completed
Filters:      status = "confirmed"
Channel:      Web Push
Template:     booking_confirm_push_v2
Guardrails:   Bypass marketing caps ✓ (transactional)
Fallback:     SMS [P2]
Test:         [Send Test ▼]
```

---

### 6.6 Connector Mapping UI (`/data/connectors/:id/mapping`)

```
SOURCE FIELD          TRANSFORM           TARGET FIELD
crm.email         →   lowercase      →   customer.email
crm.phone         →   E.164            →   customer.mobile
crm.id            →   —                →   identity.external_id
```

---

### 6.7 Web Push Channel Settings (`/settings/channels/web-push`)

```
Firebase Project ID:    [____________]
Service Account JSON:   [Upload]
VAPID Public Key:       [____________]
VAPID Private Key:      [____________]  (encrypted at rest)

SDK SNIPPET:
<script src="https://cdn.marbee.io/sdk/v1/push.js" data-tenant="...">

SUBSCRIBER STATS:
Total: 124K │ Active: 98K │ Permission Denied: 12K
```

---

### 6.8 Asset Library (`/content/assets`)

Grid/list toggle, folder tree left panel, usage badge on hover, upload drag-drop zone.

---

### 6.9 Form Builder (`/content/forms/:id/edit`)

Left: component palette | Center: canvas | Right: field properties + schema mapping

---

### 6.10 Landing Page Builder (`/content/landing-pages/:id/edit`)

Section-based canvas, responsive preview toggle, SEO panel, publish settings.

---

## 7. Database & Schema Model

### 7.1 Platform Tables (Supabase PostgreSQL)

All tables live in `supabase/migrations/`. OOTB schemas are standard Postgres tables — not Supabase's dynamic "schema builder" storage — giving full SQL, RLS, and index control.

**Auth integration:** Platform users authenticate via `auth.users`. Application profile data extends via `public.profiles`. Tenant membership is in `public.tenant_users`.

#### `tenants`
```sql
id              UUID PRIMARY KEY
name            VARCHAR(255) NOT NULL
slug            VARCHAR(100) UNIQUE NOT NULL
plan            VARCHAR(50)  -- starter | growth | enterprise
status          VARCHAR(20)  -- active | suspended | trial
settings        JSONB
created_at      TIMESTAMPTZ
updated_at      TIMESTAMPTZ
```

#### `environments`
```sql
id              UUID PRIMARY KEY
tenant_id       UUID REFERENCES tenants(id)
name            VARCHAR(20)  -- development | staging | production
is_default      BOOLEAN
config          JSONB
```

#### `users` → Supabase Auth

Platform login uses **`auth.users`** (managed by Supabase Auth). Do not duplicate auth credentials in public tables.

#### `profiles`
```sql
id              UUID PRIMARY KEY REFERENCES auth.users(id)
email           VARCHAR(255)
name            VARCHAR(255)
avatar_url      TEXT
last_login_at   TIMESTAMPTZ
```

#### `tenant_users`
```sql
tenant_id       UUID REFERENCES tenants(id)
user_id         UUID REFERENCES auth.users(id)
role_id         UUID REFERENCES roles(id)
status          VARCHAR(20)
PRIMARY KEY (tenant_id, user_id)
```

#### `roles` / `permissions` / `role_permissions`
Standard RBAC with resource + action granularity.

---

### 7.2 OOTB Data Schemas

#### Schema: `customer`
| Field | Type | PK | PII | Index |
|---|---|---|---|---|
| customer_id | UUID | ✓ | | ✓ |
| email | Email | | ✓ | ✓ |
| mobile | Phone | | ✓ | ✓ |
| name | String | | ✓ | |
| dob | Date | | ✓ | |
| gender | Enum | | | |
| location | JSON | | ✓ | |
| consent | JSON | | | |
| status | Enum | | | ✓ |
| created_at | Timestamp | | | ✓ |
| updated_at | Timestamp | | | |

#### Schema: `customer_identity`
| Field | Type | Notes |
|---|---|---|
| identity_id | UUID | PK |
| customer_id | UUID | FK → customer (nullable for anonymous) |
| ecid | String | Experience Cloud / anonymous ID |
| email | Email | |
| mobile | Phone | |
| device_id | String | |
| anonymous_id | String | |
| external_id | String | |
| source | String | web, app, crm, pos |
| identity_type | Enum | anonymous, known, merged |
| created_at | Timestamp | |

**Identity Resolution Logic:**
```
1. Match on customer_id if present
2. Match on ecid / anonymous_id → link or create stub
3. Match on email / mobile (deterministic)
4. Merge profiles on confirmation (manual or rule)
```

#### Schema: `web_push_subscriber`
| Field | Type |
|---|---|
| subscriber_id | UUID PK |
| customer_id | UUID FK (nullable) |
| ecid | String |
| fcm_token | String (encrypted) |
| browser | String |
| os | String |
| device | String |
| permission_status | Enum |
| subscription_status | Enum |
| last_seen | Timestamp |
| token_invalidated_at | Timestamp |

#### Schema: `channel_endpoint` (Abstraction — critical)
| Field | Type |
|---|---|
| endpoint_id | UUID PK |
| subscriber_id | UUID FK |
| channel | Enum (web_push, whatsapp, sms, email) |
| provider | String (firebase, meta, twilio, sendgrid) |
| provider_config_id | UUID FK |
| address | String (token, phone, email) |
| status | Enum |
| metadata | JSONB |

#### Schema: `delivery`
| Field | Type |
|---|---|
| delivery_id | UUID PK |
| campaign_id | UUID (nullable) |
| journey_id | UUID (nullable) |
| journey_instance_id | UUID (nullable) |
| channel | Enum |
| provider | String |
| template_id | UUID |
| audience_id | UUID (nullable) |
| scheduled_at | Timestamp |
| started_at | Timestamp |
| completed_at | Timestamp |
| status | Enum |
| stats | JSONB (sent, delivered, failed counts) |

#### Schema: `customer_delivery_log`
| Field | Type |
|---|---|
| log_id | UUID PK |
| customer_id | UUID |
| delivery_id | UUID |
| journey_id | UUID |
| campaign_id | UUID |
| channel | Enum |
| provider | String |
| message_id | String |
| timestamp | Timestamp |
| status | Enum |
| error_code | String |

#### Schema: `engagement_log`
| Field | Type |
|---|---|
| engagement_id | UUID PK |
| customer_id | UUID |
| channel | Enum |
| message_id | String |
| event | Enum (sent, delivered, opened, clicked, failed, unsubscribed, converted) |
| timestamp | Timestamp |
| metadata | JSONB (url, device, utm) |

#### Schema: `exclusion`
| Field | Type |
|---|---|
| exclusion_id | UUID PK |
| customer_id | UUID |
| channel | Enum (nullable = global) |
| reason | String |
| source | Enum (manual, regulatory, bounce, unsubscribe) |
| start_date | Date |
| end_date | Date (nullable) |
| created_by | UUID |

#### Schema: `events` (Extensible Event Architecture)
| Field | Type |
|---|---|
| event_id | UUID PK |
| event_type | String (indexed) |
| customer_id | UUID (nullable) |
| anonymous_id | String |
| timestamp | Timestamp |
| source | String |
| properties | JSONB |
| session_id | String |

**Example event_types:** `cart_added`, `product_viewed`, `booking_completed`, `form_submitted`, `payment_completed`

#### Schema: `real_time_trigger`
| Field | Type |
|---|---|
| trigger_id | UUID PK |
| name | String |
| event_type | String |
| filters | JSONB |
| channel | Enum |
| template_id | UUID |
| priority | Integer |
| is_transactional | Boolean |
| status | Enum |
| guardrail_profile_id | UUID |

---

### 7.3 Journey Tables

#### `journeys`
```sql
id, tenant_id, environment, name, description, status, current_version_id,
entry_trigger_config JSONB, settings JSONB, created_at, updated_at, created_by
```

#### `journey_versions`
```sql
id, journey_id, version_number, canvas_json JSONB, published_at, published_by
```

#### `journey_nodes`
```sql
id, version_id, node_type, node_key, config JSONB, position_x, position_y
```

#### `journey_edges`
```sql
id, version_id, source_node_id, target_node_id, condition_label
```

#### `journey_instances`
```sql
id, journey_id, version_id, customer_id, status, current_node_id,
entered_at, completed_at, context JSONB
```

#### `journey_instance_events`
```sql
id, instance_id, node_id, event_type, timestamp, details JSONB
```

---

### 7.4 Content Tables

#### `assets`, `asset_versions`, `asset_usage`
#### `forms`, `form_fields`, `form_submissions`
#### `landing_pages`, `landing_page_versions`
#### `templates` [P2], `content_blocks` [P2]

---

### 7.5 Connector & Workflow Tables

#### `connectors`, `connector_mappings`, `connector_runs`, `connector_errors`
#### `data_jobs`, `data_job_runs`, `workflow_definitions`, `workflow_steps`

---

### 7.6 Channel Provider Tables

#### `channel_providers`
```sql
id, tenant_id, environment, channel, provider_type, name,
credentials_encrypted BYTEA, config JSONB, status, is_default
```

#### `provider_templates` [P2]
WhatsApp template ID, approval status, variables schema

---

### 7.7 Analytics Tables (PostgreSQL — P1)

P1 analytics run entirely in Supabase Postgres. High-volume tables use **partitioning** by month on `timestamp`.

#### `events` (partitioned)
Primary event store. Index: `(tenant_id, environment, event_type, timestamp)`, `(tenant_id, customer_id, timestamp)`.

#### `engagement_log` (partitioned)
All channel engagement events for reporting.

#### Materialized views (refreshed by pg_cron via `analytics-rollup` Edge Function)

| View | Purpose |
|---|---|
| `mv_daily_channel_stats` | Sent, delivered, CTR, conversions by channel |
| `mv_journey_funnel` | Entered → completed → exited counts per journey |
| `mv_command_center_today` | Today's KPIs for Command Center |
| `mv_customer_engagement_summary` | Per-customer open/click rates |

**P2+ option:** Export aggregated data to ClickHouse or BigQuery when query volume exceeds Postgres comfort zone.

---

### 7.8 Entity Relationship Diagram

```
                    ┌─────────────┐
                    │   Tenant    │
                    └──────┬──────┘
                           │
         ┌─────────────────┼─────────────────┐
         ▼                 ▼                 ▼
   ┌───────────┐    ┌────────────┐    ┌────────────┐
   │  Customer │◄───│  Identity  │    │  Exclusion │
   └─────┬─────┘    └────────────┘    └────────────┘
         │
    ┌────┴────┬────────────┬──────────────┐
    ▼         ▼            ▼              ▼
┌────────┐ ┌────────┐ ┌──────────┐ ┌─────────────┐
│ Events │ │Delivery│ │Engagement│ │Web Push Sub │
└────────┘ └───┬────┘ └──────────┘ └──────┬──────┘
               │                           │
               ▼                           ▼
          ┌─────────┐              ┌────────────────┐
          │ Journey │              │Channel Endpoint│
          └─────────┘              └────────────────┘
```

---

## 8. Event Architecture

### 8.1 Event Envelope (Standard)

```json
{
  "event_id": "uuid",
  "event_type": "cart_abandoned",
  "timestamp": "2026-08-11T10:32:00Z",
  "tenant_id": "uuid",
  "environment": "production",
  "identity": {
    "customer_id": "uuid",
    "anonymous_id": "anon_123",
    "ecid": "ecid_456"
  },
  "source": "web_sdk",
  "properties": {
    "cart_id": "cart_789",
    "value": 12400,
    "currency": "INR",
    "items": []
  },
  "context": {
    "ip": "hashed",
    "user_agent": "...",
    "page_url": "..."
  }
}
```

### 8.2 Event Processing Pipeline (Supabase)

```
SDK / Connector / Edge Function (events-ingest)
       ↓
Validate against event schema (Postgres function)
       ↓
INSERT INTO events (partitioned table)
       ↓
Identity resolution (Edge Function or DB function)
       ↓
pgmq.enqueue:
  ├── queue: realtime_triggers
  ├── queue: journey_triggers
  └── queue: analytics_rollup
       ↓
Edge Function workers (poll pgmq or DB webhook on INSERT)
  ├── realtime-send → channel-send → Firebase
  ├── journey-runner → evaluate entry / conditions
  └── UPDATE customer timeline + Supabase Realtime broadcast
```

**Realtime UI:** Customer 360 subscribes to `events` and `engagement_log` filtered by `customer_id`.

### 8.3 Internal Platform Events

| Event | Consumers |
|---|---|
| `message.sent` | Analytics, customer timeline |
| `message.delivered` | Analytics, journey node completion |
| `message.clicked` | Engagement, journey conditions |
| `journey.entered` | Analytics, audit |
| `profile.updated` | Journey triggers, audience refresh [P2] |
| `form.submitted` | Profile, journey, event |
| `connector.sync.completed` | Data quality, workflow continuation |

### 8.4 Webhook Delivery (Outbound)

Tenants configure webhooks for:
- Delivery status changes
- Engagement events
- Journey state changes
- Connector job completion

Retry: pgmq dead-letter queue + Edge Function with exponential backoff (3 days max).

---

## 9. API Architecture

### 9.1 API Design Principles

Marbee uses a **hybrid Supabase API model**:

| Layer | Access | Auth |
|---|---|---|
| **PostgREST** | Table CRUD (journeys, customers, schemas, settings) | Supabase JWT (dashboard users) |
| **Edge Functions** | Business logic (events, send, ETL, webhooks) | JWT, API key, or service role |
| **Realtime** | Live subscriptions | Supabase JWT with RLS |
| **Storage** | Asset upload/download | JWT (write) / public URL (read) |

- Cursor-based pagination on all list endpoints (PostgREST `range` headers)
- Idempotency-Key header on send/event Edge Functions
- Rate limits enforced in Edge Functions (Upstash Redis [optional P2] or Postgres counter table)
- Shared TypeScript types in `packages/shared` used by web app and Edge Functions

### 9.2 PostgREST Tables (Direct Access)

Dashboard app uses `@supabase/supabase-js`:

```typescript
// Example: list journeys for current tenant (RLS enforced automatically)
const { data } = await supabase
  .from('journeys')
  .select('*, journey_versions(*)')
  .eq('status', 'published')
  .order('updated_at', { ascending: false });
```

**Direct-access resources:** `tenants`, `environments`, `customers`, `customer_identities`, `journeys`, `journey_versions`, `journey_instances`, `schemas`, `schema_fields`, `connectors`, `assets`, `forms`, `landing_pages`, `exclusions`, `channel_providers`, `audit_logs`, `roles`, `tenant_users`

### 9.3 Edge Function API Groups

Base URL: `https://{project_ref}.supabase.co/functions/v1`

#### Authentication & Tenant Context
```
POST   /auth/set-tenant-context     # Set JWT app_metadata (tenant + env + role)
POST   /auth/invite-user            # Invite user to tenant
POST   /auth/create-api-key         # Generate scoped API key
```

#### Events & Identity
```
POST   /events-ingest               # Single event (SDK)
POST   /events-ingest/batch         # Bulk events
POST   /identity-resolve            # ECID / email / mobile → customer_id
POST   /identity-link               # Merge identities
```

#### Web Push
```
POST   /push-subscribe              # Register FCM token (SDK, anon key + tenant header)
DELETE /push-subscribe              # Unsubscribe token
POST   /channel-send                # Send message (test or manual)
POST   /channel-webhook             # Firebase/provider DLR callback
```

#### Journeys
```
POST   /journey-enter               # API trigger — enter customer into journey
POST   /journey-test                # Test journey for single profile
POST   /journey-scheduler           # Internal: pg_cron invokes wait resume
POST   /journey-runner              # Internal: pgmq worker processes instances
```

#### Real-Time Triggers
```
POST   /realtime-send               # Internal: evaluate + send (<3 sec path)
GET    /realtime-triggers/test      # Send test for trigger config
```

#### Content (Public)
```
POST   /form-submit                 # Public form submission (CORS enabled)
GET    /landing-page/{slug}         # Serve published page [optional SSR]
```

#### Data Platform
```
POST   /connector-webhook/{id}      # Inbound webhook connector
POST   /connector-sync/{id}         # Manual sync trigger
POST   /workflow-runner             # Internal: data job execution
POST   /csv-import                  # CSV upload + map + load
```

#### Analytics
```
GET    /analytics-overview          # Command Center KPIs
GET    /analytics/journey/{id}      # Journey funnel stats
GET    /analytics/channel           # Channel performance
```

#### AI [P2]
```
POST   /ai-assist                   # Audience, journey, content, insights
```

### 9.4 API Key Auth (SDK & External Systems)

External integrations use tenant-scoped API keys stored in `api_keys` table:

```http
POST /functions/v1/events-ingest
Authorization: Bearer {api_key}
X-Tenant-Id: {tenant_id}
X-Environment: production
```

Edge Function validates key → scopes → sets tenant context → uses service role for writes (bypasses RLS safely with explicit tenant filter).

### 9.5 SDK (JavaScript — Web Push + Events)

```javascript
import { createClient } from '@supabase/supabase-js';

// Lightweight SDK wraps Edge Functions (not direct DB access)
const marbee = Marbee.init({
  supabaseUrl: 'https://xxx.supabase.co',
  anonKey: 'eyJ...',
  tenantId: 'uuid',
  environment: 'production'
});

await marbee.push.requestPermission();
marbee.track('product_viewed', { sku: 'FL-123' });  // → POST /events-ingest
marbee.identify({ email: 'john@email.com' });          // → POST /identity-resolve
```

---

## 10. Channel Abstraction & BYOP Layer

### 10.1 Architecture

```
                 ┌─────────────────────┐
                 │  channel-send       │
                 │  Edge Function      │
                 │  send(message)      │
                 │  getStatus(id)      │
                 └──────────┬──────────┘
                            │
        ┌───────────────────┼───────────────────┐
        ▼                   ▼                   ▼
┌───────────────┐  ┌───────────────┐  ┌───────────────┐
│  Web Push     │  │  WhatsApp     │  │  SMS / RCS    │
│  Adapter      │  │  Adapter      │  │  Adapter      │
└───────┬───────┘  └───────┬───────┘  └───────┬───────┘
        │                  │                  │
   Firebase FCM       Meta/Twilio/        Twilio/Gupshup/
                      Gupshup/Infobip     Infobip/Custom
```

### 10.2 Unified Message Object

```json
{
  "message_id": "uuid",
  "channel": "web_push",
  "provider": "firebase",
  "recipient": {
    "customer_id": "uuid",
    "endpoint": "fcm_token_xxx"
  },
  "content": {
    "title": "Complete your booking",
    "body": "Your cart expires in 1 hour",
    "icon_url": "https://cdn.../icon.png",
    "click_action": "https://app.example.com/cart?utm_source=push",
    "data": { "journey_id": "...", "deeplink": "/cart" }
  },
  "metadata": {
    "journey_id": "uuid",
    "transactional": false,
    "idempotency_key": "..."
  }
}
```

### 10.3 Provider Interface (TypeScript)

```typescript
interface ChannelProvider {
  channel: ChannelType;
  send(message: UnifiedMessage): Promise<SendResult>;
  getDeliveryStatus(messageId: string): Promise<DeliveryStatus>;
  validateCredentials(config: ProviderConfig): Promise<boolean>;
  handleWebhook(payload: unknown): WebhookEvent[];
  invalidateEndpoint?(endpoint: string): void;
}
```

### 10.4 P1 Implementation

- **Web Push:** Firebase FCM adapter fully implemented
- **API Message:** Generic HTTP adapter for custom channels
- **Stubs:** WhatsApp, SMS, Email adapters throw `ProviderNotConfigured` until P2/P3

### 10.5 BYOP Configuration UI

Tenant selects channel → provider → enters credentials → test send → set as default.

---

## 11. AI Layer

### 11.1 Embedded AI Features

| Feature | Module | Phase | Description |
|---|---|---|---|
| AI Audience Builder | Audiences | P2 | NL → segment rules |
| AI Journey Builder | Journeys | P2 | "Create 7-day abandon cart journey" |
| AI Content Generator | Content | P2 | Channel-aware copy |
| AI Campaign Assistant | Campaigns | P2 | End-to-end campaign setup |
| AI Insights | Reporting | P2 | "Why did campaign X underperform?" |
| AI Data Explorer | Data | P2 | NL → SQL |
| AI Debugging | Journeys | P2 | "Why did 12,400 customers fail?" |
| Anomaly Detection | Command Center | P2 | Automatic performance alerts |
| Next-Best-Action | Decision | P3 | Offer + channel recommendation |
| Predictive Audiences | Audiences | P3 | Churn / LTV models |

### 11.2 AI Architecture

```
User Prompt + Context (tenant schemas, journey schema, guardrails)
       ↓
Prompt Template (per feature, tenant-scoped)
       ↓
LLM (with function calling)
       ↓
Structured Output (rules JSON, journey canvas, SQL)
       ↓
User Confirmation UI (always for destructive/generative actions)
       ↓
Execute
```

### 11.3 Guardrails for AI

- Never expose cross-tenant data
- PII redaction in prompts
- Human-in-the-loop for publish actions
- Audit log all AI-generated configs

---

## 12. Security & Compliance

### 12.1 Authentication & Authorization

- **Supabase Auth** — email/password, magic link, Google/GitHub OAuth (P1)
- **JWT custom claims** — `tenant_id`, `environment`, `role` in `app_metadata`
- **RLS policies** — enforce tenant + environment on every table
- **SSO / SAML** — Supabase Auth enterprise or custom OIDC [P2]
- **MFA** — Supabase Auth TOTP for admin roles
- **API keys** — tenant-scoped keys validated in Edge Functions; stored hashed in `api_keys`
- **Service role** — Edge Functions only; never shipped to client
- **RBAC** — `roles` + `role_permissions` tables; checked in RLS helper functions and Edge Functions

### 12.2 Data Protection

- Provider credentials encrypted via **Supabase Vault** (`supabase_vault`) or pgcrypto in Postgres
- TLS 1.3 in transit
- Field-level PII flags drive masking in UI & exports
- Tenant data isolation via RLS + application checks
- GDPR: right to erasure, export, consent tracking
- Audit logs: immutable, 2-year retention (configurable)

### 12.3 Guardrails [P2 Advanced]

| Rule Type | Example |
|---|---|
| Global frequency | Max 5 marketing messages/day across channels |
| Channel frequency | WhatsApp 1/day, Email 3/day |
| Quiet hours | 10 PM – 8 AM local time |
| Blackout periods | Holiday calendar |
| Suppression | Exclusion schema + regulatory lists |
| Priority | Transactional bypasses marketing caps |
| Channel priority | WhatsApp → SMS → Email fallback |

### 12.4 Compliance Features

- Consent management on Customer schema
- Unsubscribe / opt-out propagation to Exclusion
- DND registry integration [P2 India]
- Data retention policies per schema
- SOC 2 Type II target [post-P1]

---

## 13. Scalability & Infrastructure

### 13.1 Supabase Service Map (replaces microservices for P1)

| Component | Supabase Feature | Responsibility |
|---|---|---|
| **Database** | PostgreSQL + RLS | All persistent state, tenant isolation |
| **Auth** | Supabase Auth | Dashboard login, JWT, invites |
| **CRUD API** | PostgREST | Auto-generated REST for tables |
| **events-ingest** | Edge Function | Event validation, identity, enqueue |
| **journey-runner** | Edge Function + pgmq | Journey state machine |
| **journey-scheduler** | Edge Function + pg_cron | Wait node resume |
| **realtime-send** | Edge Function | Sub-3-sec trigger → send |
| **channel-send** | Edge Function | Firebase + future BYOP adapters |
| **connector-sync** | Edge Function | ETL, imports, webhooks |
| **workflow-runner** | Edge Function + pgmq | Data job orchestration |
| **analytics-rollup** | Edge Function + pg_cron | Refresh materialized views |
| **ai-assist** | Edge Function [P2] | LLM proxy |
| **Assets** | Supabase Storage | CDN URLs, uploads |
| **Live UI** | Supabase Realtime | Dashboards, timeline, monitors |

### 13.2 Scaling Targets (Year 1 — on Supabase)

| Metric | P1 Target | Notes |
|---|---|---|
| Events ingested | 5K/sec sustained | Partitioned `events` table; pgmq batch workers |
| Journey instances | 1M active | Indexed state table; pg_cron resume |
| Web Push sends | 500K/hour | pgmq send queue; Firebase batch API |
| API latency (p99) | < 300ms read, < 800ms write | PostgREST + connection pooling (Supavisor) |
| Real-time trigger latency | < 3 sec event → send | Dedicated pgmq queue, warm Edge Functions |
| Uptime SLA | 99.9% | Supabase Pro/Team plan + health checks |

### 13.3 Queue & Worker Design (Supabase-native)

- **pgmq:** Primary job queue — `realtime_triggers`, `journey_triggers`, `channel_send`, `connector_jobs`, `webhook_retry`
- **pg_cron:** Schedule Edge Function invocations (waits, syncs, rollups, retention)
- **Database Webhooks:** Optional — fire Edge Function on INSERT to `events` for lowest-latency path
- **Edge Function concurrency:** Configure per-function; scale send workers independently
- **Idempotency:** Postgres `idempotency_keys` table with TTL; checked before send/process

### 13.4 Storage & CDN

- Supabase Storage public buckets with CDN-transform URLs
- Image resize via Supabase Storage transforms (or upload-time WebP generation in Edge Function)
- Signed URLs for private documents and form uploads
- Path isolation: `{tenant_id}/{environment}/`

---

## 14. User Roles & Permissions

### 14.1 Default Roles

| Role | Description |
|---|---|
| **Super Admin** | Platform operator (Marbee staff only) |
| **Tenant Admin** | Full tenant configuration |
| **Marketing Manager** | Journeys, campaigns, content, audiences |
| **Marketing Operator** | Execute, monitor; no publish without approval |
| **Content Editor** | Assets, forms, landing pages, templates |
| **Data Engineer** | Schemas, connectors, workflows, data quality |
| **Analyst** | Read-only analytics & data explorer |
| **Developer** | API keys, webhooks, SDK config |
| **Viewer** | Read-only dashboards |

### 14.2 Permission Matrix (Abbreviated)

| Resource | Admin | Mktg Mgr | Mktg Ops | Content | Data Eng | Analyst |
|---|---|---|---|---|---|---|
| Journeys - Publish | ✓ | ✓ | | | | |
| Journeys - View | ✓ | ✓ | ✓ | | | ✓ |
| Campaigns - Send | ✓ | ✓ | ✓* | | | |
| Customer PII | ✓ | ✓ | ✓ | | ✓ | Masked |
| Schemas - Edit | ✓ | | | | ✓ | |
| Connectors | ✓ | | | | ✓ | |
| Channel Config | ✓ | | | | | |
| API Keys | ✓ | | | | | |
| Billing | ✓ | | | | | |
| Analytics | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |

*Requires approval workflow if enabled

### 14.3 Approval Workflows [P2]

- Journey publish → Marketing Manager approval
- Campaign send → Dual approval for >100K audience
- WhatsApp template → Content + compliance review

---

## 15. Product Roadmap

### P1 — Core Platform (Months 1–6)

**Foundation:** Multi-tenancy, auth, RBAC, API, audit logs, billing/credits stub

**Data:** All OOTB schemas, schema builder, ERD, data explorer, connectors (core set), data jobs/workflows, data quality basics, identity resolution

**Customer:** Customer 360, timeline, profile CRUD, merge, communication history

**Journey:** Visual builder, all P1 triggers/nodes, versioning, test/validate/publish, real-time triggers, abandon cart OOTB journey

**Content:** Asset library + CDN, forms, landing page builder

**Web Push:** Firebase integration, SDK, subscribe/unsubscribe, send, track, analytics

**Analytics:** Command center, journey/channel/delivery/engagement/conversion dashboards

**Admin:** Tenant settings, channel config (Web Push), API keys, users/roles, audit, license/usage

---

### P2 — Growth (Months 7–12)

**Channels:** WhatsApp BYOP, SMS BYOP, RCS BYOP, message composer, DLR handling

**Campaigns:** Blast campaigns, scheduling, approvals, frequency controls

**Audiences:** Visual + SQL + AI builders, dynamic segments

**Content:** Templates, content blocks, channel approval workflows

**Guardrails:** Advanced frequency, quiet hours, blackout, priority rules

**AI:** Audience, journey, content, insights, debugging, anomaly detection

**Analytics:** Campaign performance, A/B testing, personalization

**Connectors:** Advanced (CRM, CDP, DWH), more transformations

---

### P3 — Intelligence & Enterprise (Months 13–18)

**Email BYOP:** Full email channel with drag-drop editor, AMP, deliverability

**Loyalty:** Programs, tiers, points, rewards, gamification

**Decisioning:** Offers catalogue, rules engine, coupons, eligibility, next-best-action

**AI Advanced:** Predictive audiences, multi-touch attribution

**Enterprise:** SSO/SAML, dedicated Supabase project per tenant, data warehouse integrations, CDP capabilities

---

## 16. Development Epics

### P1 Epics

#### EPIC-P1-001: Platform Foundation (Supabase)
**Stories:**
- Initialize Supabase project (`supabase init`, local dev stack)
- Core migrations: tenants, environments, profiles, tenant_users, roles, audit_logs
- RLS policies + JWT helper functions (`auth.tenant_id()`, `auth.environment()`)
- Supabase Auth setup (email + Google OAuth)
- Auth hook / Edge Function to set `app_metadata` on login
- Tenant registration & environment provisioning flow
- RBAC roles & permission helper functions
- API keys table + `create-api-key` Edge Function
- Billing/credits schema (stub)
- Audit log trigger on sensitive tables

**Acceptance:** Tenant signs up via Supabase Auth; invited user gets correct RLS scope; environment switch updates JWT claims; actions logged.

---

#### EPIC-P1-002: Data Platform — Schemas
**Stories:**
- Schema CRUD API & UI (list, builder, field types)
- PII flag & index configuration
- OOTB schema seeding (all 8 schemas)
- ERD visualization (React Flow)
- Schema versioning
- Record CRUD API per schema

**Acceptance:** Admin creates custom schema; OOTB schemas pre-populated; ERD renders relationships.

---

#### EPIC-P1-003: Identity Resolution
**Stories:**
- Identity schema & linking API
- Anonymous → known progression
- ECID generation in SDK
- Profile merge UI & API
- Identity resolution on event ingest

**Acceptance:** Web visitor identified on form submit; timeline shows pre/post identification events.

---

#### EPIC-P1-004: Event Pipeline (Supabase)
**Stories:**
- `events` partitioned table migration + indexes
- `events-ingest` Edge Function (single + batch, API key auth)
- Event validation Postgres function (schema enforcement)
- Identity resolution on ingest (inline or `identity-resolve` call)
- pgmq queue setup: `realtime_triggers`, `journey_triggers`
- Database webhook or cron worker to drain queues
- Supabase Realtime enabled on `events` for Customer 360 timeline
- Event query via PostgREST (RLS-scoped)

**Acceptance:** SDK sends event → appears on customer timeline within 5 sec; pgmq worker picks up trigger within 3 sec.

---

#### EPIC-P1-005: Customer 360
**Stories:**
- Customer list with search & filters
- Profile detail page (all tabs)
- Timeline component
- Communication history aggregation
- Channel subscription display
- Journey membership view
- Exclusion display

**Acceptance:** Single view shows profile, 30-day timeline, all Web Push communications.

---

#### EPIC-P1-006: Channel Abstraction Layer
**Stories:**
- Unified message model
- Provider interface definition
- Channel endpoint model (Subscriber → Identity → Endpoint → Provider)
- Provider configuration CRUD
- Send queue via pgmq (`channel_send` queue) + `channel-send` Edge Function
- Delivery & engagement logging

**Acceptance:** Architecture supports adding new provider without schema changes.

---

#### EPIC-P1-007: Web Push — Firebase
**Stories:**
- Firebase provider adapter in `channel-send` Edge Function
- VAPID & service account config UI
- JavaScript SDK (subscribe, track, identify)
- Token lifecycle (register, refresh, invalidate)
- Send Web Push action in journey
- Deep link & UTM support
- Click tracking endpoint
- Conversion tracking pixel/API

**Acceptance:** End-to-end: SDK subscribe → journey send → delivery log → click tracked.

---

#### EPIC-P1-008: Journey Engine
**Stories:**
- Journey CRUD & canvas UI (React Flow)
- Node types: triggers, conditions, waits, actions, exit
- Journey version management
- Validate & test modes
- Publish / pause / resume
- Journey instance state machine in `journey-runner` Edge Function
- Wait scheduler via pg_cron → `journey-scheduler` Edge Function
- Audit trail
- OOTB abandon cart journey template

**Acceptance:** Publish journey; 1000 customers enter; conditions branch correctly; waits resume.

---

#### EPIC-P1-009: Real-Time Messaging Engine
**Stories:**
- Real-time trigger CRUD UI
- Real-time evaluation in `realtime-send` Edge Function (pgmq consumer)
- Guardrail stub (exclusion check, basic frequency)
- Transactional flag (bypass marketing caps)
- Test harness

**Acceptance:** `booking_completed` event triggers push within 3 seconds.

---

#### EPIC-P1-010: Content — Asset Library
**Stories:**
- Upload (drag-drop), folder, tags
- Supabase Storage bucket setup (`assets`, path convention)
- Upload via supabase-js Storage API (drag-drop)
- Public & CDN URL generation
- Version history
- Usage tracking
- Preview & metadata editor

**Acceptance:** Asset uploaded; URL generated; usage count updates when used in journey.

---

#### EPIC-P1-011: Content — Forms
**Stories:**
- Form builder UI (all P1 components)
- Field → schema mapping
- Public form endpoint via `form-submit` Edge Function (CORS)
- Submission pipeline (validate → profile → event)
- Submission list & export

**Acceptance:** Form submit creates customer, fires event, can trigger journey entry.

---

#### EPIC-P1-012: Content — Landing Pages
**Stories:**
- Page builder (P1 components)
- Responsive preview
- SEO settings
- Publish to Supabase Storage + public URL
- UTM tracking
- Form integration block

**Acceptance:** Landing page published on tenant subdomain with working form.

---

#### EPIC-P1-013: Connectors
**Stories:**
- Connector framework (plugin architecture)
- Inbound webhook via `connector-webhook` Edge Function
- Sync via `connector-sync` Edge Function + pgmq job queue
- REST/HTTPS connector
- SFTP connector
- CSV import/export
- Google Sheets connector
- Database connector (PostgreSQL, MySQL)
- Field mapping UI
- Sync schedule & manual trigger
- Error log & retry

**Acceptance:** CSV import maps to Customer schema; 10K rows loaded with validation errors reported.

---

#### EPIC-P1-014: Data Jobs & Workflows
**Stories:**
- Workflow canvas UI
- Job types: import, export, transform, validate, dedupe, API call
- Scheduled execution via pg_cron + `workflow-runner` Edge Function
- Job run history & logs
- Post-job actions (trigger journey stub)

**Acceptance:** Scheduled SFTP → transform → dedupe → load workflow runs nightly.

---

#### EPIC-P1-015: Data Quality
**Stories:**
- Validation rules per field
- Duplicate detection config
- Quality dashboard (% complete, errors)
- Quarantine invalid records

**Acceptance:** Invalid email quarantined; dashboard shows 94% quality score.

---

#### EPIC-P1-016: Analytics & Command Center (Supabase)
**Stories:**
- Materialized views: `mv_daily_channel_stats`, `mv_journey_funnel`, `mv_command_center_today`
- `analytics-rollup` Edge Function (pg_cron every 5 min)
- `analytics-overview` Edge Function for Command Center KPIs
- Journey performance via PostgREST + RPC functions
- Channel performance report (Web Push)
- Delivery & engagement reports (query `engagement_log`)
- Conversion & basic revenue tracking
- Supabase Realtime subscription for live Command Center counters
- Date range filter & CSV export

**Acceptance:** Dashboard reflects sends within 5 min of rollup; journey funnel renders correctly; live counter updates via Realtime.

---

#### EPIC-P1-017: Admin & Settings
**Stories:**
- Organization settings (brand, timezone, currency)
- User & role management UI
- API key generation via `create-api-key` Edge Function
- Audit log viewer
- License & usage dashboard
- Credits consumption tracking
- Web Push channel settings
- Documentation portal (static)

**Acceptance:** Admin creates API key; audit shows all config changes.

---

#### EPIC-P1-018: Exclusion & Suppression
**Stories:**
- Exclusion CRUD API & UI
- Global & channel-level suppression
- Temporary exclusion (start/end date)
- Integration with send pipeline (block before send)
- Unsubscribe handling for Web Push

**Acceptance:** Excluded customer does not receive journey or real-time push.

---

### P2 Epics (Summary)

| Epic ID | Name | Key Deliverables |
|---|---|---|
| EPIC-P2-001 | WhatsApp BYOP | Meta/Twilio/Gupshup adapters, templates, DLR |
| EPIC-P2-002 | SMS/RCS BYOP | Twilio/Gupshup adapters, unicode detection, RCS cards |
| EPIC-P2-003 | Campaign Engine | Blast send, scheduling, approvals, orchestration |
| EPIC-P2-004 | Audience Engine | Visual, SQL, AI builders; dynamic segments |
| EPIC-P2-005 | Templates & Blocks | Channel templates, reusable blocks, approval flows |
| EPIC-P2-006 | Advanced Guardrails | Frequency, quiet hours, blackout, priority |
| EPIC-P2-007 | AI Layer | Audience, journey, content, insights, debugging |
| EPIC-P2-008 | Message Composer | Unified cross-channel composer UI |
| EPIC-P2-009 | A/B Testing | Journey & campaign variants |
| EPIC-P2-010 | Personalization | Dynamic content tokens, conditional blocks |
| EPIC-P2-011 | System Notifications | Admin alerts, connector failures, credit warnings |
| EPIC-P2-012 | Advanced Analytics | Campaign reports, cohort analysis |

---

### P3 Epics (Summary)

| Epic ID | Name | Key Deliverables |
|---|---|---|
| EPIC-P3-001 | Email BYOP | SendGrid/SES adapters, drag-drop editor, deliverability |
| EPIC-P3-002 | Loyalty Platform | Programs, tiers, points, rewards, gamification |
| EPIC-P3-003 | Decision Engine | Offers, rules, coupons, eligibility, NBA |
| EPIC-P3-004 | Predictive Audiences | Churn, LTV, propensity models |
| EPIC-P3-005 | Multi-Touch Attribution | Revenue attribution across channels |
| EPIC-P3-006 | Enterprise SSO | SAML/OIDC, dedicated infrastructure option |
| EPIC-P3-007 | CDP & DWH | Snowflake/BigQuery connectors, reverse ETL |
| EPIC-P3-008 | Advanced AI | Next-best-action, autonomous optimization |

---

## Appendix A: OOTB Journey Templates (P1)

1. **Abandon Cart** — cart_abandoned → wait 1h → check purchase → push → wait 24h → push
2. **Welcome Series** — profile_created → push welcome → wait 3d → push tips
3. **Browse Abandonment** — product_viewed (3x) + no purchase → push
4. **Booking Confirmation** — Real-time on booking_completed

---

## Appendix B: Web Push SDK Integration Guide

```html
<script src="https://cdn.marbee.io/sdk/v1/marbee.min.js"></script>
<script>
  Marbee.init({
    supabaseUrl: 'https://YOUR_PROJECT.supabase.co',
    anonKey: 'YOUR_ANON_KEY',
    tenantId: 'YOUR_TENANT_ID',
    environment: 'production'
  });
</script>
```

Events and push subscription call Supabase Edge Functions — the browser never gets direct database access.

---

## Appendix C: Glossary

| Term | Definition |
|---|---|
| **ECID** | Experience Cloud ID / anonymous visitor identifier |
| **BYOP** | Bring Your Own Provider — tenant supplies channel credentials |
| **Journey Instance** | Single customer's stateful execution of a journey |
| **Real-Time Trigger** | Event-driven single-action message (not multi-step journey) |
| **Workflow** | Data/system orchestration (not customer-facing) |
| **Guardrail** | Frequency/suppression rule preventing over-messaging |
| **Exclusion** | Suppression record blocking communication |

---

*End of Product Blueprint v1.1 — Supabase Backend*
