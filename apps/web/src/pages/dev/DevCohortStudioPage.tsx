/**
 * DEV-ONLY harness for the Cohort Studio. Mounted at /dev/cohort-studio
 * when import.meta.env.DEV (see App.tsx). No Supabase / auth — everything
 * runs against a seed dataset built from fake data.
 */
import { useCallback, useMemo, useState } from 'react';
import { CohortStudio } from '@/components/cohorts/CohortStudio';
import {
  createCohortIR,
  type CohortIR,
} from '@/lib/cohorts/ir';
import type { CohortDataset, EventRecord } from '@/lib/cohorts/evaluate';
import { buildCatalog, type CatalogEvent, type SemanticCatalog } from '@/lib/cohorts/catalog';
import type { SchemaWithFields } from '@/lib/fetch-schemas';

/* ------------------------------------------------------------------ *
 * Seed data
 * ------------------------------------------------------------------ */

const TENANT = '00000000-0000-0000-0000-000000000001';
const ENV = 'production';

function seedSchema(): SchemaWithFields {
  return {
    id: 'sch-1',
    tenant_id: TENANT,
    environment: ENV,
    name: 'Customer',
    slug: 'customer',
    table_name: 'customers',
    is_system: false,
    description: 'Main customer schema',
    status: 'active',
    created_at: '2025-01-01',
    updated_at: '2025-06-01',
    schema_fields: [
      { id: 'f1', schema_id: 'sch-1', name: 'email', slug: 'email', field_type: 'email' },
      { id: 'f2', schema_id: 'sch-1', name: 'first_name', slug: 'first_name', field_type: 'text' },
      { id: 'f3', schema_id: 'sch-1', name: 'last_name', slug: 'last_name', field_type: 'text' },
      { id: 'f4', schema_id: 'sch-1', name: 'status', slug: 'status', field_type: 'text' },
      { id: 'f5', schema_id: 'sch-1', name: 'country', slug: 'country', field_type: 'text' },
      { id: 'f6', schema_id: 'sch-1', name: 'plan', slug: 'plan', field_type: 'text' },
      { id: 'f7', schema_id: 'sch-1', name: 'created_at', slug: 'created_at', field_type: 'datetime' },
      { id: 'f8', schema_id: 'sch-1', name: 'consent_email', slug: 'consent_email', field_type: 'boolean' },
    ],
  };
}

const FIRST_NAMES = ['Alice', 'Bob', 'Carol', 'Dave', 'Eve', 'Frank', 'Grace', 'Hank', 'Iris', 'Jack',
  'Kara', 'Leo', 'Mona', 'Ned', 'Olga', 'Paul', 'Quinn', 'Rosa', 'Sam', 'Tina'];
const LAST_NAMES = ['Smith', 'Lee', 'Patel', 'Garcia', 'Kim', 'Chen', 'Müller', 'Tanaka', 'Ali', 'Singh'];
const COUNTRIES = ['US', 'IN', 'GB', 'DE', 'JP', 'BR', 'FR', 'KR', 'AU', 'CA'];
const PLANS = ['free', 'starter', 'pro', 'enterprise'];
const EVENT_NAMES = ['page_view', 'button_click', 'form_submit', 'purchase', 'signup', 'login', 'feature_used', 'email_opened'];

function seedRows(n: number): Record<string, unknown>[] {
  const now = Date.now();
  return Array.from({ length: n }, (_, i) => ({
    id: `cust-${String(i).padStart(4, '0')}`,
    email: `user${i}@example.com`,
    first_name: FIRST_NAMES[i % FIRST_NAMES.length],
    last_name: LAST_NAMES[i % LAST_NAMES.length],
    status: i % 10 === 0 ? 'inactive' : 'active',
    country: COUNTRIES[i % COUNTRIES.length],
    plan: PLANS[i % PLANS.length],
    consent_email: i % 3 !== 0,
    created_at: new Date(now - (n - i) * 86_400_000 * 2).toISOString(),
    is_email_reachable: i % 5 !== 0,
  }));
}

function seedEvents(rows: Record<string, unknown>[]): Map<string, EventRecord[]> {
  const map = new Map<string, EventRecord[]>();
  const now = Date.now();
  for (const row of rows) {
    const id = row.id as string;
    const count = 1 + Math.floor(Math.random() * 12);
    const events: EventRecord[] = [];
    for (let j = 0; j < count; j++) {
      events.push({
        name: EVENT_NAMES[Math.floor(Math.random() * EVENT_NAMES.length)],
        ts: now - Math.floor(Math.random() * 60 * 86_400_000),
        properties: {},
      });
    }
    events.sort((a, b) => a.ts - b.ts);
    map.set(id, events);
  }
  return map;
}

function seedDataset(): { dataset: CohortDataset; catalog: SemanticCatalog } {
  const schema = seedSchema();
  const rows = seedRows(200);
  const eventsByEntity = seedEvents(rows);

  const eventSamples: CatalogEvent[] = EVENT_NAMES.map((name) => {
    let total = 0;
    const users = new Set<string>();
    for (const [id, evs] of eventsByEntity) {
      for (const e of evs) {
        if (e.name === name) { total++; users.add(id); }
      }
    }
    return { name, label: name.replace(/_/g, ' '), volume: total, uniqueUsers: users.size, synonyms: [], properties: [], source: 'events' as const };
  });

  const catalog = buildCatalog({ schema, rows, events: eventSamples, cohorts: [] });

  const dataset: CohortDataset = {
    catalog,
    rows,
    eventsByEntity,
    membership: new Map(),
    accountMembers: new Map(),
    sampled: false,
    loadedAt: Date.now(),
  };

  return { dataset, catalog };
}

/* ------------------------------------------------------------------ *
 * Page
 * ------------------------------------------------------------------ */

export function DevCohortStudioPage() {
  const { dataset, catalog } = useMemo(() => seedDataset(), []);
  const [name, setName] = useState('Dev Cohort Harness');

  const initialIR = useMemo(() => createCohortIR('user', 'customer'), []);

  const handleSave = useCallback(async (ir: CohortIR, n: string) => {
    console.debug('[dev cohort-studio] save', { name: n, ir });
  }, []);

  return (
    <CohortStudio
      initialIR={initialIR}
      catalog={catalog}
      dataset={dataset}
      name={name}
      onRename={setName}
      onSave={handleSave}
      onBack={() => (window.location.href = '/')}
      dirty={false}
    />
  );
}
