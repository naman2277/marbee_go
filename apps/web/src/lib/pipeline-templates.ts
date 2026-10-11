import { defaultConfigForType } from '@/lib/data-jobs';

/* Starter pipelines — real graphs the create flow can seed. Stored in the
   legacy { steps } shape, which `parseWorkflowGraph` expands into a linear
   node/edge graph. */

export type PipelineTemplate = {
  id: string;
  name: string;
  jobType: string;
  description: string;
  steps: { type: string; label: string; config?: Record<string, unknown> }[];
};

const step = (type: string, label: string, config: Record<string, unknown> = {}) => ({
  type,
  label,
  config: { ...defaultConfigForType(type), ...config },
});

export const PIPELINE_TEMPLATES: PipelineTemplate[] = [
  {
    id: 'blank',
    name: 'Blank pipeline',
    jobType: 'etl',
    description: 'Start from an empty canvas.',
    steps: [],
  },
  {
    id: 'csv_import',
    name: 'CSV → Contacts',
    jobType: 'import',
    description: 'Load a CSV, validate emails, map fields, upsert into the customer schema.',
    steps: [
      step('source_file', 'Read CSV', { format: 'csv', path: 'imports/contacts.csv', has_header: true }),
      step('validate', 'Validate email', { on_fail: 'reject', rules_text: 'email email_format\nemail not_empty' }),
      step('transform_map', 'Map fields', { target_schema: 'customer', mapping_text: 'email → email\nfirst_name → first_name\nphone → mobile' }),
      step('target', 'Write customer', { schema: 'customer', mode: 'upsert', match_key: 'email' }),
    ],
  },
  {
    id: 'schema_export',
    name: 'Schema → CSV export',
    jobType: 'export',
    description: 'Read a schema, keep active rows, drop a CSV into storage.',
    steps: [
      step('source', 'Read customers', { schema: 'customer' }),
      step('filter', 'Active only', { mode: 'and', conditions_text: 'status equals active' }),
      step('target_export', 'Export CSV', { format: 'csv', destination: 'storage', filename: 'customers_{{today}}' }),
    ],
  },
  {
    id: 'api_ingest',
    name: 'REST API → schema',
    jobType: 'etl',
    description: 'Pull from a paginated API, map, schema-check, upsert.',
    steps: [
      step('source_api', 'Fetch API', { url: 'https://api.example.com/v1/customers', method: 'GET', pagination: 'cursor' }),
      step('transform_map', 'Map to schema', { target_schema: 'customer', mapping_text: 'id → external_id\nemail → email' }),
      step('validate_schema', 'Schema check', { schema: 'customer', strict: true }),
      step('target', 'Upsert', { schema: 'customer', mode: 'upsert', match_key: 'external_id' }),
    ],
  },
  {
    id: 'dedupe',
    name: 'Deduplicate & upsert',
    jobType: 'transform',
    description: 'Remove duplicate rows by email, then upsert the survivors.',
    steps: [
      step('source', 'Read customers', { schema: 'customer' }),
      step('transform_dedupe', 'Dedupe by email', { keys: 'email', keep: 'first' }),
      step('target', 'Write back', { schema: 'customer', mode: 'upsert', match_key: 'email' }),
    ],
  },
  {
    id: 'digest_webhook',
    name: 'Scheduled digest → webhook',
    jobType: 'etl',
    description: 'On a schedule, aggregate events and POST the summary to a webhook.',
    steps: [
      step('trigger_schedule', 'Every morning', { cron: '0 7 * * *', timezone: 'UTC' }),
      step('source', 'Read events', { schema: 'event' }),
      step('transform_aggregate', 'Count by type', { group_by: 'event_type', metrics_text: 'count id total' }),
      step('target_webhook', 'POST digest', { url: 'https://hooks.example.com/digest', method: 'POST', payload_template: '{{row}}' }),
    ],
  },
];

export function templateWorkflowJson(t: PipelineTemplate): Record<string, unknown> {
  return {
    steps: t.steps.map((s, i) => ({ id: `s${i + 1}`, type: s.type, label: s.label, config: s.config ?? {} })),
  };
}
