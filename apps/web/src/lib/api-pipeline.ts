import type { ApiScope } from './api-scopes';

/** Secure pipeline steps — no arbitrary code, validated JSON only. */
export type ApiPipelineStep =
  | { type: 'require_scope'; scope: ApiScope }
  | { type: 'parse_body'; max_bytes?: number }
  | {
      type: 'track_event';
      event_type_field?: string;
      properties_field?: string;
      identity_field?: string;
      event_type?: string;
    }
  | {
      type: 'upsert_customer';
      match_key: string;
      fields: Record<string, string>;
    }
  | {
      type: 'get_customer';
      id_field: string;
      store_as?: string;
    }
  | {
      type: 'respond';
      status: number;
      body?: Record<string, unknown>;
      include?: string[];
    };

export const PIPELINE_STEP_TYPES = [
  'require_scope',
  'parse_body',
  'track_event',
  'upsert_customer',
  'get_customer',
  'respond',
] as const;

const FORBIDDEN_KEYS = /__(proto|define|lookup)__|constructor|prototype/i;

export function validatePipeline(raw: unknown): { ok: true; steps: ApiPipelineStep[] } | { ok: false; errors: string[] } {
  const errors: string[] = [];

  if (!Array.isArray(raw)) {
    return { ok: false, errors: ['Pipeline must be a JSON array of steps'] };
  }

  if (raw.length === 0) {
    return { ok: false, errors: ['Pipeline must include at least one step'] };
  }

  if (raw.length > 20) {
    return { ok: false, errors: ['Pipeline cannot exceed 20 steps'] };
  }

  const steps: ApiPipelineStep[] = [];
  let hasRespond = false;

  for (let i = 0; i < raw.length; i++) {
    const step = raw[i];
    if (!step || typeof step !== 'object' || Array.isArray(step)) {
      errors.push(`Step ${i + 1}: must be an object`);
      continue;
    }

    const type = (step as { type?: string }).type;
    if (!type || !PIPELINE_STEP_TYPES.includes(type as (typeof PIPELINE_STEP_TYPES)[number])) {
      errors.push(`Step ${i + 1}: unknown type "${String(type)}"`);
      continue;
    }

    if (JSON.stringify(step).match(FORBIDDEN_KEYS)) {
      errors.push(`Step ${i + 1}: contains forbidden keys`);
      continue;
    }

    switch (type) {
      case 'require_scope': {
        const scope = (step as { scope?: string }).scope;
        if (!scope || typeof scope !== 'string') {
          errors.push(`Step ${i + 1}: require_scope needs a scope string`);
        } else {
          steps.push({ type: 'require_scope', scope: scope as ApiScope });
        }
        break;
      }
      case 'parse_body': {
        const maxBytes = (step as { max_bytes?: number }).max_bytes;
        if (maxBytes !== undefined && (typeof maxBytes !== 'number' || maxBytes < 1 || maxBytes > 65536)) {
          errors.push(`Step ${i + 1}: max_bytes must be 1–65536`);
        } else {
          steps.push({ type: 'parse_body', max_bytes: maxBytes ?? 32768 });
        }
        break;
      }
      case 'track_event': {
        const s = step as {
          event_type_field?: string;
          properties_field?: string;
          identity_field?: string;
          event_type?: string;
        };
        if (!s.event_type && !s.event_type_field) {
          errors.push(`Step ${i + 1}: track_event needs event_type or event_type_field`);
        } else {
          steps.push({
            type: 'track_event',
            event_type: s.event_type,
            event_type_field: s.event_type_field,
            properties_field: s.properties_field ?? 'properties',
            identity_field: s.identity_field ?? 'identity',
          });
        }
        break;
      }
      case 'upsert_customer': {
        const s = step as { match_key?: string; fields?: Record<string, string> };
        if (!s.match_key?.trim()) {
          errors.push(`Step ${i + 1}: upsert_customer needs match_key`);
        } else if (!s.fields || typeof s.fields !== 'object') {
          errors.push(`Step ${i + 1}: upsert_customer needs fields map`);
        } else {
          steps.push({ type: 'upsert_customer', match_key: s.match_key.trim(), fields: s.fields });
        }
        break;
      }
      case 'get_customer': {
        const s = step as { id_field?: string; store_as?: string };
        if (!s.id_field?.trim()) {
          errors.push(`Step ${i + 1}: get_customer needs id_field`);
        } else {
          steps.push({ type: 'get_customer', id_field: s.id_field.trim(), store_as: s.store_as ?? 'customer' });
        }
        break;
      }
      case 'respond': {
        const s = step as { status?: number; body?: Record<string, unknown>; include?: string[] };
        if (typeof s.status !== 'number' || s.status < 200 || s.status > 599) {
          errors.push(`Step ${i + 1}: respond needs status 200–599`);
        } else {
          hasRespond = true;
          steps.push({
            type: 'respond',
            status: s.status,
            body: s.body && typeof s.body === 'object' ? s.body : { ok: true },
            include: Array.isArray(s.include) ? s.include.filter((k) => typeof k === 'string') : undefined,
          });
        }
        break;
      }
    }
  }

  if (!hasRespond) {
    errors.push('Pipeline must end with a respond step');
  }

  if (errors.length) return { ok: false, errors };
  return { ok: true, steps };
}

export const PIPELINE_TEMPLATES: {
  id: string;
  label: string;
  description: string;
  method: 'GET' | 'POST' | 'PUT' | 'PATCH';
  scopes: ApiScope[];
  pipeline: ApiPipelineStep[];
}[] = [
  {
    id: 'track-event',
    label: 'Track event',
    description: 'Ingest a behavioral event from your app',
    method: 'POST',
    scopes: ['events:write', 'custom_api:invoke'],
    pipeline: [
      { type: 'require_scope', scope: 'events:write' },
      { type: 'parse_body', max_bytes: 32768 },
      { type: 'track_event', event_type_field: 'event_type', properties_field: 'properties', identity_field: 'identity' },
      { type: 'respond', status: 200, body: { success: true } },
    ],
  },
  {
    id: 'upsert-customer',
    label: 'Upsert customer',
    description: 'Create or update a customer by email',
    method: 'POST',
    scopes: ['customers:write', 'custom_api:invoke'],
    pipeline: [
      { type: 'require_scope', scope: 'customers:write' },
      { type: 'parse_body', max_bytes: 16384 },
      {
        type: 'upsert_customer',
        match_key: 'email',
        fields: { email: 'email', first_name: 'first_name', last_name: 'last_name' },
      },
      { type: 'respond', status: 200, body: { success: true } },
    ],
  },
  {
    id: 'get-customer',
    label: 'Get customer',
    description: 'Fetch a customer by ID from query/body',
    method: 'GET',
    scopes: ['customers:read', 'custom_api:invoke'],
    pipeline: [
      { type: 'require_scope', scope: 'customers:read' },
      { type: 'get_customer', id_field: 'customer_id', store_as: 'customer' },
      { type: 'respond', status: 200, body: { success: true }, include: ['customer'] },
    ],
  },
];

export function formatPipelineJson(steps: ApiPipelineStep[]): string {
  return JSON.stringify(steps, null, 2);
}
