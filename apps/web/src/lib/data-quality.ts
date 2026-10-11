import { supabase } from './supabase';
import { fetchSchemaRows } from './schema-records';
import { logAudit } from './audit';

export type QualityRuleType =
  | 'email_format'
  | 'phone_format'
  | 'not_empty'
  | 'regex'
  | 'min_length'
  | 'max_length'
  | 'unique'
  | 'schema_required'
  | 'duplicate';

export type QualityRule = {
  id: string;
  tenant_id: string;
  environment: string;
  schema_id: string;
  field_name: string;
  rule_type: QualityRuleType;
  config: Record<string, unknown>;
  is_active: boolean;
  created_at?: string;
};

export type QualityRun = {
  id: string;
  tenant_id: string;
  environment: string;
  schema_id: string;
  status: string;
  quality_score: number | null;
  records_checked: number;
  records_failed: number;
  records_quarantined: number;
  summary: Record<string, unknown>;
  started_at: string;
  completed_at: string | null;
};

export type QualityViolation = {
  id?: string;
  run_id?: string;
  record_id: string | null;
  field_name: string;
  rule_type: string;
  message: string;
  severity: 'error' | 'warn';
};

export type QuarantineRecord = {
  id: string;
  tenant_id: string;
  environment: string;
  schema_id: string;
  record_id: string | null;
  record_data: Record<string, unknown>;
  violations: QualityViolation[];
  status: 'quarantined' | 'released';
  run_id: string | null;
  created_at: string;
  released_at: string | null;
};

export type DuplicateConfig = {
  id: string;
  tenant_id: string;
  environment: string;
  schema_id: string;
  match_keys: string[];
  strategy: 'flag' | 'quarantine';
  is_active: boolean;
};

export type ParsedRule = {
  field: string;
  rule: QualityRuleType;
  config?: Record<string, unknown>;
};

export const QUALITY_RULE_TYPES: { value: QualityRuleType; label: string; needsConfig?: boolean }[] = [
  { value: 'email_format', label: 'Email format' },
  { value: 'phone_format', label: 'Phone format' },
  { value: 'not_empty', label: 'Not empty' },
  { value: 'regex', label: 'Regex match', needsConfig: true },
  { value: 'min_length', label: 'Min length', needsConfig: true },
  { value: 'max_length', label: 'Max length', needsConfig: true },
  { value: 'unique', label: 'Unique in dataset' },
];

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_RE = /^\+?[0-9\s\-().]{7,20}$/;

export function parseRulesText(text: string): ParsedRule[] {
  return text
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const parts = line.split(/\s+/);
      const field = parts[0] ?? '';
      const rule = (parts[1] ?? 'not_empty') as QualityRuleType;
      const config: Record<string, unknown> = {};
      if (rule === 'regex' && parts[2]) config.pattern = parts.slice(2).join(' ');
      if (rule === 'min_length' && parts[2]) config.min = Number(parts[2]);
      if (rule === 'max_length' && parts[2]) config.max = Number(parts[2]);
      return { field, rule, config: Object.keys(config).length ? config : undefined };
    });
}

export function rulesTextFromRules(rules: ParsedRule[]): string {
  return rules
    .map((r) => {
      if (r.rule === 'regex' && r.config?.pattern) return `${r.field} regex ${r.config.pattern}`;
      if (r.rule === 'min_length' && r.config?.min != null) return `${r.field} min_length ${r.config.min}`;
      if (r.rule === 'max_length' && r.config?.max != null) return `${r.field} max_length ${r.config.max}`;
      return `${r.field} ${r.rule}`;
    })
    .join('\n');
}

function strValue(value: unknown): string {
  if (value == null) return '';
  return String(value).trim();
}

export function validateFieldValue(
  field: string,
  value: unknown,
  ruleType: QualityRuleType,
  config: Record<string, unknown> = {},
): string | null {
  const text = strValue(value);

  switch (ruleType) {
    case 'not_empty':
    case 'schema_required':
      if (!text) return `${field} must not be empty`;
      return null;
    case 'email_format':
      if (!text) return null;
      if (!EMAIL_RE.test(text)) return `${field} is not a valid email`;
      return null;
    case 'phone_format':
      if (!text) return null;
      if (!PHONE_RE.test(text)) return `${field} is not a valid phone number`;
      return null;
    case 'regex': {
      if (!text) return null;
      const pattern = String(config.pattern ?? '');
      if (!pattern) return null;
      try {
        if (!new RegExp(pattern).test(text)) return `${field} does not match pattern`;
      } catch {
        return `${field} has invalid regex pattern`;
      }
      return null;
    }
    case 'min_length': {
      const min = Number(config.min ?? 1);
      if (text && text.length < min) return `${field} must be at least ${min} characters`;
      return null;
    }
    case 'max_length': {
      const max = Number(config.max ?? 255);
      if (text.length > max) return `${field} must be at most ${max} characters`;
      return null;
    }
    default:
      return null;
  }
}

export function validateRecordAgainstRules(
  record: Record<string, unknown>,
  rules: Array<{ field_name: string; rule_type: QualityRuleType; config?: Record<string, unknown> }>,
  recordId: string | null,
): QualityViolation[] {
  const violations: QualityViolation[] = [];
  for (const rule of rules) {
    const msg = validateFieldValue(rule.field_name, record[rule.field_name], rule.rule_type, rule.config ?? {});
    if (msg) {
      violations.push({
        record_id: recordId,
        field_name: rule.field_name,
        rule_type: rule.rule_type,
        message: msg,
        severity: 'error',
      });
    }
  }
  return violations;
}

export function findDuplicateGroups(
  records: Record<string, unknown>[],
  matchKeys: string[],
): Map<string, string[]> {
  const groups = new Map<string, string[]>();
  if (!matchKeys.length) return groups;

  for (const record of records) {
    const id = strValue(record.id) || crypto.randomUUID();
    const key = matchKeys.map((k) => strValue(record[k]).toLowerCase()).join('|');
    if (!key || key === matchKeys.map(() => '').join('|')) continue;
    const existing = groups.get(key) ?? [];
    existing.push(id);
    groups.set(key, existing);
  }

  return new Map([...groups.entries()].filter(([, ids]) => ids.length > 1));
}

export function computeQualityScore(checked: number, failed: number): number {
  if (checked <= 0) return 100;
  return Math.round(((checked - failed) / checked) * 10000) / 100;
}

export function computeCompleteness(records: Record<string, unknown>[], fields: string[]): number {
  if (!records.length || !fields.length) return 100;
  let filled = 0;
  const total = records.length * fields.length;
  for (const record of records) {
    for (const field of fields) {
      if (strValue(record[field])) filled += 1;
    }
  }
  return Math.round((filled / total) * 10000) / 100;
}

// ─── Supabase CRUD ───────────────────────────────────────────────────────────

export async function fetchQualityRules(tenantId: string, environment: string, schemaId?: string) {
  let q = supabase
    .from('data_quality_rules')
    .select('*')
    .eq('tenant_id', tenantId)
    .eq('environment', environment)
    .order('field_name');
  if (schemaId) q = q.eq('schema_id', schemaId);
  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []) as QualityRule[];
}

export async function createQualityRule(input: Omit<QualityRule, 'id' | 'created_at'>) {
  const { data, error } = await supabase.from('data_quality_rules').insert(input).select().single();
  if (error) throw error;
  const rule = data as QualityRule;
  void logAudit({
    tenantId: input.tenant_id,
    environment: input.environment,
    action: 'create',
    resourceType: 'data_quality_rule',
    resourceId: rule.id,
    resourceName: `${input.field_name} · ${input.rule_type}`,
    summary: input.rule_type,
  });
  return rule;
}

export async function deleteQualityRule(id: string) {
  const { data: prev } = await supabase.from('data_quality_rules').select('*').eq('id', id).maybeSingle();
  const { error } = await supabase.from('data_quality_rules').delete().eq('id', id);
  if (error) throw error;
  if (prev) {
    void logAudit({
      tenantId: prev.tenant_id,
      environment: prev.environment,
      action: 'delete',
      resourceType: 'data_quality_rule',
      resourceId: id,
      resourceName: `${prev.field_name} · ${prev.rule_type}`,
    });
  }
}

export async function fetchQualityRuns(tenantId: string, environment: string, limit = 20) {
  const { data, error } = await supabase
    .from('data_quality_runs')
    .select('*')
    .eq('tenant_id', tenantId)
    .eq('environment', environment)
    .order('started_at', { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data ?? []) as QualityRun[];
}

export async function fetchQuarantineRecords(tenantId: string, environment: string, schemaId?: string) {
  let q = supabase
    .from('quarantine_records')
    .select('*')
    .eq('tenant_id', tenantId)
    .eq('environment', environment)
    .eq('status', 'quarantined')
    .order('created_at', { ascending: false });
  if (schemaId) q = q.eq('schema_id', schemaId);
  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []) as QuarantineRecord[];
}

export async function releaseQuarantineRecord(id: string) {
  const { data: prev } = await supabase.from('quarantine_records').select('*').eq('id', id).maybeSingle();
  const { error } = await supabase
    .from('quarantine_records')
    .update({ status: 'released', released_at: new Date().toISOString() })
    .eq('id', id);
  if (error) throw error;
  if (prev) {
    void logAudit({
      tenantId: prev.tenant_id,
      environment: prev.environment,
      action: 'release',
      resourceType: 'quarantine_record',
      resourceId: id,
      resourceName: prev.field_name ?? 'Record',
    });
  }
}

export async function deleteQuarantineRecord(id: string) {
  const { error } = await supabase.from('quarantine_records').delete().eq('id', id);
  if (error) throw error;
}

export async function fetchDuplicateConfigs(tenantId: string, environment: string) {
  const { data, error } = await supabase
    .from('schema_duplicate_config')
    .select('*')
    .eq('tenant_id', tenantId)
    .eq('environment', environment);
  if (error) throw error;
  return (data ?? []) as DuplicateConfig[];
}

export async function upsertDuplicateConfig(input: {
  tenant_id: string;
  environment: string;
  schema_id: string;
  match_keys: string[];
  strategy: 'flag' | 'quarantine';
  is_active?: boolean;
}) {
  const { data, error } = await supabase
    .from('schema_duplicate_config')
    .upsert(
      { ...input, is_active: input.is_active ?? true, updated_at: new Date().toISOString() },
      { onConflict: 'tenant_id,environment,schema_id' },
    )
    .select()
    .single();
  if (error) throw error;
  void logAudit({
    tenantId: input.tenant_id,
    environment: input.environment,
    action: 'update',
    resourceType: 'data_quality_rule',
    resourceId: input.schema_id,
    resourceName: 'Duplicate detection config',
    summary: `Keys: ${input.match_keys.join(', ')} · ${input.strategy}`,
  });
  return data as DuplicateConfig;
}

export async function runQualityCheck(opts: {
  tenantId: string;
  environment: string;
  schemaId: string;
  tableName: string;
  rules: QualityRule[];
  duplicateConfig?: DuplicateConfig | null;
  quarantineOnFail?: boolean;
}): Promise<QualityRun> {
  const { tenantId, environment, schemaId, tableName, rules, duplicateConfig, quarantineOnFail = true } = opts;

  const { data: runRow, error: runErr } = await supabase
    .from('data_quality_runs')
    .insert({
      tenant_id: tenantId,
      environment,
      schema_id: schemaId,
      status: 'running',
    })
    .select()
    .single();
  if (runErr) throw runErr;
  const run = runRow as QualityRun;

  try {
    const records = await fetchSchemaRows(tableName, tenantId, environment, 5000);
    const activeRules = rules.filter((r) => r.is_active);
    const allViolations: QualityViolation[] = [];
    const failedRecordIds = new Set<string>();

    for (const record of records) {
      const recordId = strValue(record.id) || null;
      const violations = validateRecordAgainstRules(
        record,
        activeRules.map((r) => ({ field_name: r.field_name, rule_type: r.rule_type, config: r.config })),
        recordId,
      );
      if (violations.length) {
        if (recordId) failedRecordIds.add(recordId);
        allViolations.push(...violations.map((v) => ({ ...v, run_id: run.id })));
      }
    }

    if (duplicateConfig?.is_active && duplicateConfig.match_keys.length) {
      const dupGroups = findDuplicateGroups(records, duplicateConfig.match_keys);
      for (const [, ids] of dupGroups) {
        for (const id of ids) {
          failedRecordIds.add(id);
          allViolations.push({
            run_id: run.id,
            record_id: id,
            field_name: duplicateConfig.match_keys.join(', '),
            rule_type: 'duplicate',
            message: `Duplicate record on keys: ${duplicateConfig.match_keys.join(', ')}`,
            severity: 'error',
          });
        }
      }
    }

    if (allViolations.length) {
      const { error: vErr } = await supabase.from('data_quality_violations').insert(
        allViolations.map(({ record_id, field_name, rule_type, message, severity, run_id }) => ({
          run_id,
          record_id,
          field_name,
          rule_type,
          message,
          severity,
        })),
      );
      if (vErr) throw vErr;
    }

    let quarantined = 0;
    if (quarantineOnFail && failedRecordIds.size) {
      const toQuarantine = records.filter((r) => failedRecordIds.has(strValue(r.id)));
      const quarantineRows = toQuarantine.map((record) => {
        const recordId = strValue(record.id);
        const recordViolations = allViolations.filter((v) => v.record_id === recordId);
        return {
          tenant_id: tenantId,
          environment,
          schema_id: schemaId,
          record_id: recordId,
          record_data: record,
          violations: recordViolations,
          status: 'quarantined',
          run_id: run.id,
        };
      });

      if (quarantineRows.length) {
        const { error: qErr } = await supabase.from('quarantine_records').insert(quarantineRows);
        if (qErr) throw qErr;
        quarantined = quarantineRows.length;
      }
    }

    const trackedFields = [...new Set(activeRules.map((r) => r.field_name))];
    const score = computeQualityScore(records.length, failedRecordIds.size);
    const completeness = computeCompleteness(records, trackedFields);

    const { data: completed, error: cErr } = await supabase
      .from('data_quality_runs')
      .update({
        status: 'completed',
        quality_score: score,
        records_checked: records.length,
        records_failed: failedRecordIds.size,
        records_quarantined: quarantined,
        completed_at: new Date().toISOString(),
        summary: {
          completeness,
          violation_count: allViolations.length,
          rules_applied: activeRules.length,
        },
      })
      .eq('id', run.id)
      .select()
      .single();
    if (cErr) throw cErr;
    void logAudit({
      tenantId,
      environment,
      action: 'run',
      resourceType: 'data_quality_rule',
      resourceId: schemaId,
      resourceName: tableName,
      summary: `Score ${score}% · ${failedRecordIds.size} failed · ${quarantined} quarantined`,
    });
    return completed as QualityRun;
  } catch (err) {
    await supabase
      .from('data_quality_runs')
      .update({ status: 'failed', completed_at: new Date().toISOString() })
      .eq('id', run.id);
    throw err;
  }
}
