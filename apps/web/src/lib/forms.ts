import { supabase } from './supabase';
import { toSchemaSlug } from './schema-slug';
import { createSchemaRecord } from './schema-records';
import { logAudit, diffChanges } from './audit';
import { invokeFunction } from './functions';
import { getStorageTarget } from './form-mapping';
import { upsertCustomerFromForm } from './form-customer-upsert';
import { applyFieldMappingValue } from './form-field-mapping-rules';
import { decryptFields, encryptFields } from './crypto-vault';
import { resolveVariable } from './global-variables';
import type { FormBanner, FormTheme } from './form-design';
import type { FormSecurityConfig } from './form-security';

export type FormFieldType =
  | 'text'
  | 'email'
  | 'phone'
  | 'number'
  | 'url'
  | 'textarea'
  | 'select'
  | 'radio'
  | 'multiselect'
  | 'checkbox'
  | 'consent'
  | 'rating'
  | 'date'
  | 'hidden'
  | 'heading'
  | 'divider';

/** Field types that are visual/structural only — never collect a value. */
export const NON_INPUT_FIELD_TYPES: FormFieldType[] = ['heading', 'divider'];

export type FormBuildMode = 'template' | 'builder' | 'html' | 'ai';

export type FormFieldWidth = 'full' | 'half';

export type FormConditionOperator = 'equals' | 'not_equals' | 'contains' | 'is_empty' | 'is_not_empty';

export type FormFieldCondition = {
  /** name of the controlling field */
  field: string;
  operator: FormConditionOperator;
  value?: string;
};

export type FormField = {
  id: string;
  name: string;
  label: string;
  field_type: FormFieldType;
  required?: boolean;
  placeholder?: string;
  help_text?: string;
  options?: string[];
  sort_order: number;
  width?: FormFieldWidth;
  section?: string;
  /** Body copy for layout-only types (heading subtext). */
  content?: string;
  /** Prefilled/default value (also used as the fixed value for hidden fields). */
  default_value?: string;
  // --- Validation ---
  min_length?: number;
  max_length?: number;
  min_value?: number;
  max_value?: number;
  /** Regex source (no slashes/flags) checked against the submitted value. */
  pattern?: string;
  pattern_error?: string;
  // --- Conditional visibility ---
  condition?: FormFieldCondition | null;
};

export type CustomerMatchKey = 'email' | 'mobile' | 'email_or_mobile';

export type FormFieldTransform = 'none' | 'trim' | 'lowercase' | 'uppercase';
export type FormFieldTypeCast = 'none' | 'string' | 'number' | 'boolean' | 'date';

export type FormFieldMapping = {
  form_field: string;
  schema_field: string;
  transform?: FormFieldTransform;
  type_cast?: FormFieldTypeCast;
};

export type FormSchemaMapping = {
  /** Where mapped fields are written: Customer 360 or a custom schema table */
  storage_target?: 'customer' | 'schema';
  target_schema_slug?: string;
  field_mappings?: FormFieldMapping[];
  /** Customer 360 direct storage, or link when using a custom schema */
  upsert_customer?: boolean;
  customer_match_key?: CustomerMatchKey;
  customer_email_field?: string;
  customer_mobile_field?: string;
};

export type FormSubmitAction = 'thank_you' | 'redirect';

export type FormSettings = {
  submit_label?: string;
  success_message?: string;
  redirect_url?: string;
  /** What happens after a successful submit */
  submit_action?: FormSubmitAction;
  /** Message shown when submit fails validation or server error */
  error_message?: string;
  description?: string;
  build_mode?: FormBuildMode;
  template_id?: string;
  html_content?: string;
  published_at?: string;
  live_version?: number;
  theme?: FormTheme;
  banner?: FormBanner;
  ai_generated?: boolean;
  ai_prompt?: string;
  ai_provider?: string;
  captcha_enabled?: boolean;
  captcha_type?: 'smart_math' | 'turnstile';
  captcha_align?: 'left' | 'center' | 'right' | 'full';
  captcha_label?: string;

  // --- Availability & submission limits ---
  /** Stop accepting responses without unpublishing the form. */
  accepting_responses?: boolean;
  /** ISO timestamps bounding when the form accepts responses. */
  opens_at?: string;
  closes_at?: string;
  /** Message shown once the form is closed or a limit is reached. */
  closed_message?: string;
  /** Hard cap on total submissions; unset means unlimited. */
  max_submissions?: number;
  /** Allow the same respondent to submit more than once. */
  allow_multiple_submissions?: boolean;

  // --- Respondent experience ---
  /** Show a progress bar for multi-section forms. */
  show_progress_bar?: boolean;
  /** Persist partial answers in the browser so a respondent can resume. */
  save_and_resume?: boolean;
  /** Warn before navigating away with unsaved answers. */
  confirm_before_leaving?: boolean;

  // --- Notifications ---
  notify_emails?: string[];
  notify_on_submission?: boolean;
  /** Send a confirmation email back to the respondent. */
  autoresponder_enabled?: boolean;
  autoresponder_subject?: string;
  autoresponder_body?: string;
  /** Field key holding the respondent's email address. */
  autoresponder_to_field?: string;

  // --- Security ---
  /**
   * CAPTCHA, bot protection and input hardening. Enforced server-side in the
   * `form-submit` edge function — see `lib/form-security.ts` for the threat model.
   */
  security?: FormSecurityConfig;
  /** Only accept embedded submissions from these origins. */
  allowed_domains?: string[];
  /** Require an authenticated session to submit. */
  require_auth?: boolean;

  // --- Encryption at rest (AES-256-GCM) ---
  encryption?: FormEncryptionSettings;

  // --- Data retention ---
  /** Delete submissions older than this many days; unset means keep forever. */
  retention_days?: number;
  /** Strip IP address and user agent from stored submissions. */
  anonymize_metadata?: boolean;
};

export type FormEncryptionSettings = {
  enabled?: boolean;
  /** Name of the `encryption_key` global variable used to seal values. */
  key_variable?: string;
  /** Field keys to encrypt. Empty with `encrypt_all` set means every input field. */
  fields?: string[];
  encrypt_all?: boolean;
};

export type MarbeeForm = {
  id: string;
  tenant_id: string;
  environment: string;
  name: string;
  slug: string;
  fields: FormField[];
  schema_mapping: FormSchemaMapping;
  settings: FormSettings;
  status: 'draft' | 'published' | string;
  created_at: string;
  updated_at: string;
};

export type FormSubmission = {
  id: string;
  form_id: string;
  tenant_id: string;
  environment: string;
  customer_id: string | null;
  data: Record<string, unknown>;
  created_at: string;
};

export const FORM_FIELD_TYPES: Array<{ value: FormFieldType; label: string }> = [
  { value: 'text', label: 'Text' },
  { value: 'email', label: 'Email' },
  { value: 'phone', label: 'Phone' },
  { value: 'url', label: 'URL / Link' },
  { value: 'number', label: 'Number' },
  { value: 'textarea', label: 'Long text' },
  { value: 'select', label: 'Dropdown' },
  { value: 'radio', label: 'Multiple choice' },
  { value: 'multiselect', label: 'Checkbox group' },
  { value: 'checkbox', label: 'Checkbox' },
  { value: 'consent', label: 'Consent / Terms' },
  { value: 'rating', label: 'Star rating' },
  { value: 'date', label: 'Date' },
  { value: 'hidden', label: 'Hidden field' },
  { value: 'heading', label: 'Section heading' },
  { value: 'divider', label: 'Divider' },
];

export function normalizeFieldName(label: string): string {
  return label
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '');
}

export function createFormField(label: string, sortOrder: number, type: FormFieldType = 'text'): FormField {
  const name = normalizeFieldName(label) || `field_${sortOrder + 1}`;
  const base: FormField = {
    id: crypto.randomUUID(),
    name,
    label: label.trim() || 'New field',
    field_type: type,
    required: false,
    sort_order: sortOrder,
  };
  switch (type) {
    case 'radio':
    case 'multiselect':
    case 'select':
      return { ...base, options: ['Option 1', 'Option 2', 'Option 3'] };
    case 'consent':
      return {
        ...base,
        label: label.trim() || 'I agree to the Terms of Service',
        placeholder: 'I agree to the Terms of Service and Privacy Policy',
        required: true,
      };
    case 'rating':
      return { ...base, label: label.trim() || 'How would you rate this?' };
    case 'heading':
      return {
        ...base,
        label: label.trim() || 'Section title',
        content: 'Add a short description for this section (optional).',
      };
    case 'hidden':
      return { ...base, label: label.trim() || 'hidden_field', placeholder: '' };
    default:
      return base;
  }
}

export function parseFormFields(raw: unknown): FormField[] {
  if (!Array.isArray(raw)) return [];
  return raw as FormField[];
}

export function parseSchemaMapping(raw: unknown): FormSchemaMapping {
  if (!raw || typeof raw !== 'object') return {};
  return raw as FormSchemaMapping;
}

export function parseFormSettings(raw: unknown): FormSettings {
  if (!raw || typeof raw !== 'object') return {};
  return raw as FormSettings;
}

export async function fetchForms(tenantId: string, environment: string): Promise<MarbeeForm[]> {
  const { data, error } = await supabase
    .from('forms')
    .select('*')
    .eq('tenant_id', tenantId)
    .eq('environment', environment)
    .order('updated_at', { ascending: false });

  if (error) throw error;

  return (data ?? []).map(normalizeFormRow);
}

export async function fetchFormById(id: string): Promise<MarbeeForm | null> {
  const { data, error } = await supabase.from('forms').select('*').eq('id', id).maybeSingle();
  if (error) throw error;
  return data ? normalizeFormRow(data) : null;
}

function normalizeFormRow(row: Record<string, unknown>): MarbeeForm {
  return {
    ...(row as unknown as MarbeeForm),
    fields: parseFormFields(row.fields),
    schema_mapping: parseSchemaMapping(row.schema_mapping),
    settings: parseFormSettings(row.settings),
  };
}

export async function createForm(
  tenantId: string,
  environment: string,
  name: string,
  options?: {
    fields?: FormField[];
    settings?: Partial<FormSettings>;
    schema_mapping?: FormSchemaMapping;
  },
): Promise<{ form?: MarbeeForm; error?: string }> {
  const slug = toSchemaSlug(name);
  if (!slug) return { error: 'Enter a valid form name' };

  const { data: existing } = await supabase
    .from('forms')
    .select('id')
    .eq('tenant_id', tenantId)
    .eq('environment', environment)
    .eq('slug', slug)
    .maybeSingle();

  if (existing) return { error: `Form slug "${slug}" already exists` };

  const baseSettings: FormSettings = {
    submit_label: 'Submit',
    success_message: 'Thank you — your response was recorded.',
    build_mode: 'builder',
    live_version: 0,
    ...options?.settings,
  };

  const { data, error } = await supabase
    .from('forms')
    .insert({
      tenant_id: tenantId,
      environment,
      name: name.trim(),
      slug,
      fields: options?.fields ?? [],
      schema_mapping: options?.schema_mapping ?? {},
      settings: baseSettings,
      status: 'draft',
    })
    .select('*')
    .single();

  if (error) return { error: error.message };
  const form = normalizeFormRow(data);
  void logAudit({
    tenantId,
    environment,
    action: 'create',
    resourceType: 'form',
    resourceId: form.id,
    resourceName: form.name,
  });
  return { form };
}

export async function publishForm(
  id: string,
  publish: boolean,
): Promise<{ error?: string }> {
  const form = await fetchFormById(id);
  if (!form) return { error: 'Form not found' };

  const settings: FormSettings = { ...form.settings };
  if (publish) {
    settings.published_at = new Date().toISOString();
    settings.live_version = (settings.live_version ?? 0) + 1;
  }

  return updateForm(id, {
    status: publish ? 'published' : 'draft',
    settings,
  });
}

export async function fetchFormSubmissionCounts(
  formIds: string[],
): Promise<Map<string, number>> {
  const counts = new Map<string, number>();
  if (!formIds.length) return counts;

  const { data, error } = await supabase
    .from('form_submissions')
    .select('form_id')
    .in('form_id', formIds);

  if (error) throw error;

  for (const row of data ?? []) {
    counts.set(row.form_id, (counts.get(row.form_id) ?? 0) + 1);
  }
  return counts;
}

export function getFormPublicUrl(
  slug: string,
  tenantId: string,
  environment: string,
  origin = typeof window !== 'undefined' ? window.location.origin : '',
): string {
  const params = new URLSearchParams({ tenant: tenantId, environment });
  return `${origin}/forms/${slug}?${params.toString()}`;
}

export function getFormEmbedCode(publicUrl: string, height = 640): string {
  return `<iframe
  src="${publicUrl}"
  width="100%"
  height="${height}"
  frameborder="0"
  style="border:0;max-width:640px;"
  title="Marbee form"
></iframe>`;
}

export async function updateForm(
  id: string,
  patch: Partial<Pick<MarbeeForm, 'name' | 'fields' | 'schema_mapping' | 'settings' | 'status'>>,
): Promise<{ error?: string }> {
  const prev = await fetchFormById(id);
  const { error } = await supabase
    .from('forms')
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq('id', id);

  if (error) return { error: error.message };
  if (prev) {
    const action = patch.status === 'published' ? 'publish' : patch.status === 'draft' ? 'unpublish' : 'update';
    void logAudit({
      tenantId: prev.tenant_id,
      environment: prev.environment,
      action,
      resourceType: 'form',
      resourceId: id,
      resourceName: patch.name ?? prev.name,
      summary: Object.keys(patch).join(', '),
      changes: diffChanges(prev as unknown as Record<string, unknown>, patch as Record<string, unknown>),
    });
  }
  return {};
}

export async function deleteForm(id: string): Promise<{ error?: string }> {
  const prev = await fetchFormById(id);
  const { error } = await supabase.from('forms').delete().eq('id', id);
  if (error) return { error: error.message };
  if (prev) {
    void logAudit({
      tenantId: prev.tenant_id,
      environment: prev.environment,
      action: 'delete',
      resourceType: 'form',
      resourceId: id,
      resourceName: prev.name,
    });
  }
  return {};
}

export async function fetchFormSubmissions(formId: string, limit = 100): Promise<FormSubmission[]> {
  const { data, error } = await supabase
    .from('form_submissions')
    .select('*')
    .eq('form_id', formId)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) throw error;
  return (data ?? []) as FormSubmission[];
}

async function resolveTargetSchema(
  tenantId: string,
  environment: string,
  slug: string,
): Promise<{ table_name: string | null; schema_fields: Array<{ name: string }> } | null> {
  const { data } = await supabase
    .from('schema_definitions')
    .select('table_name, schema_fields(name)')
    .eq('tenant_id', tenantId)
    .eq('environment', environment)
    .eq('slug', slug)
    .maybeSingle();

  if (!data) return null;
  const fields = (data.schema_fields ?? []) as Array<{ name: string }>;
  return { table_name: data.table_name, schema_fields: fields };
}

async function broadcastFormTrigger(
  tenantId: string,
  form: { id: string; name: string },
  submissionId: string,
  data: Record<string, unknown>,
) {
  try {
    const { data: jobs } = await supabase
      .from('data_jobs')
      .select('id, workflow_json')
      .eq('tenant_id', tenantId)
      .eq('status', 'active')
      .eq('pipeline_status', 'started');
    if (!jobs?.length) return;

    const triggerPayload = {
      event_type: 'form_submission',
      form_id: form.id,
      form_name: form.name,
      submission_id: submissionId,
      data,
      submitted_at: new Date().toISOString(),
    };

    for (const job of jobs) {
      const wf = job.workflow_json as { nodes?: { data?: { stepType?: string } }[] } | null;
      const hasFormTrigger = wf?.nodes?.some((n) => n.data?.stepType === 'trigger_form');
      if (!hasFormTrigger) continue;

      const ch = supabase.channel(`workflow-trigger:${job.id}`);
      await new Promise<void>((resolve) => {
        ch.subscribe((status) => {
          if (status === 'SUBSCRIBED') resolve();
        });
        setTimeout(resolve, 2000);
      });
      await ch.send({ type: 'broadcast', event: 'trigger_fire', payload: triggerPayload });
      setTimeout(() => supabase.removeChannel(ch), 500);
    }
  } catch { /* best-effort */ }
}

export async function submitFormResponse(input: {
  form: MarbeeForm;
  tenantId: string;
  environment: string;
  data: Record<string, unknown>;
  allowDraft?: boolean;
}): Promise<{ submissionId?: string; error?: string }> {
  const { form, tenantId, environment, data, allowDraft } = input;

  if (form.status !== 'published' && !allowDraft) {
    return { error: 'Form is not published' };
  }

  if (form.status === 'published' && !allowDraft) {
    const remote = await invokeFunction<{ submissionId?: string; error?: string }>('form-submit', {
      form_id: form.id,
      tenant_id: tenantId,
      environment,
      data,
    });
    if (!remote.ok) {
      return { error: remote.error ?? 'Form submission failed' };
    }
    await broadcastFormTrigger(tenantId, form, remote.data?.submissionId ?? '', data);
    return { submissionId: remote.data?.submissionId };
  }

  for (const field of form.fields) {
    if (!field.required) continue;
    const val = data[field.name];
    if (val === undefined || val === null || val === '') {
      return { error: `${field.label} is required` };
    }
  }

  let customerId: string | null = null;
  const mapping = form.schema_mapping;
  const storageTarget = getStorageTarget(mapping);
  const shouldUpsertCustomer =
    storageTarget === 'customer' || Boolean(mapping.upsert_customer);

  if (shouldUpsertCustomer) {
    try {
      const result = await upsertCustomerFromForm({
        supabase,
        tenantId,
        environment,
        data,
        fields: form.fields,
        mapping,
      });
      customerId = result.customerId;
    } catch (e) {
      return { error: e instanceof Error ? e.message : 'Customer upsert failed' };
    }
  }

  if (storageTarget === 'schema' && mapping.target_schema_slug && mapping.field_mappings?.length) {
    const target = await resolveTargetSchema(tenantId, environment, mapping.target_schema_slug);
    if (target?.table_name) {
      const record: Record<string, unknown> = {};
      for (const m of mapping.field_mappings) {
        if (data[m.form_field] !== undefined) {
          record[m.schema_field] = applyFieldMappingValue(data[m.form_field], m);
        }
      }
      if (Object.keys(record).length) {
        await createSchemaRecord(target.table_name, tenantId, environment, record);
      }
    }
  }

  // Seal configured answers before they leave the browser. Mapped schema records
  // and customer upserts above intentionally receive plaintext — encryption
  // applies to the stored submission payload.
  let storedData = data;
  const encryption = form.settings.encryption;
  if (encryption?.enabled && encryption.key_variable) {
    const key = await resolveVariable(tenantId, environment, encryption.key_variable, 'forms');
    if (!key) {
      return { error: `Encryption key ${encryption.key_variable} could not be resolved` };
    }
    const targets = encryption.encrypt_all
      ? form.fields.filter((f) => !NON_INPUT_FIELD_TYPES.includes(f.field_type)).map((f) => f.name)
      : encryption.fields ?? [];
    try {
      storedData = await encryptFields(data, targets, key);
    } catch {
      return { error: 'Failed to encrypt submission' };
    }
  }

  const { data: submission, error } = await supabase
    .from('form_submissions')
    .insert({
      form_id: form.id,
      tenant_id: tenantId,
      environment,
      customer_id: customerId,
      data: storedData,
    })
    .select('id')
    .single();

  if (error) return { error: error.message };

  await broadcastFormTrigger(tenantId, form, submission.id, data);

  return { submissionId: submission.id };
}

/**
 * Decrypt a stored submission payload back to plaintext, given the form's
 * encryption settings. Returns the payload unchanged when encryption is off
 * or the key cannot be resolved.
 */
export async function decryptSubmissionData(
  form: MarbeeForm,
  tenantId: string,
  environment: string,
  data: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const encryption = form.settings.encryption;
  if (!encryption?.enabled || !encryption.key_variable) return data;

  const key = await resolveVariable(tenantId, environment, encryption.key_variable, 'forms');
  if (!key) return data;

  const targets = encryption.encrypt_all
    ? Object.keys(data)
    : encryption.fields ?? [];
  try {
    return await decryptFields(data, targets, key);
  } catch {
    return data;
  }
}

/** Does `field` currently apply given the other submitted values (conditional visibility)? */
export function isFieldVisible(field: FormField, values: Record<string, unknown>): boolean {
  const cond = field.condition;
  if (!cond || !cond.field) return true;
  const raw = values[cond.field];
  const current = Array.isArray(raw) ? raw.join(', ') : String(raw ?? '').trim();
  switch (cond.operator) {
    case 'is_empty':
      return current === '';
    case 'is_not_empty':
      return current !== '';
    case 'not_equals':
      return current.toLowerCase() !== (cond.value ?? '').trim().toLowerCase();
    case 'contains':
      return current.toLowerCase().includes((cond.value ?? '').trim().toLowerCase());
    case 'equals':
    default:
      return current.toLowerCase() === (cond.value ?? '').trim().toLowerCase();
  }
}

/** Client-side validation for one field's value. Returns an error message, or null if valid. */
export function validateFieldValue(field: FormField, value: unknown): string | null {
  if (NON_INPUT_FIELD_TYPES.includes(field.field_type)) return null;

  const isEmpty =
    value === undefined ||
    value === null ||
    value === '' ||
    (Array.isArray(value) && value.length === 0) ||
    (field.field_type === 'checkbox' && value === false) ||
    (field.field_type === 'consent' && value === false);

  if (field.required && isEmpty) {
    return `${field.label || 'This field'} is required`;
  }
  if (isEmpty) return null;

  const str = Array.isArray(value) ? value.join(', ') : String(value);

  if (field.field_type === 'text' || field.field_type === 'textarea' || field.field_type === 'url') {
    if (typeof field.min_length === 'number' && str.length < field.min_length) {
      return `${field.label} must be at least ${field.min_length} characters`;
    }
    if (typeof field.max_length === 'number' && str.length > field.max_length) {
      return `${field.label} must be at most ${field.max_length} characters`;
    }
  }

  if (field.field_type === 'number' || field.field_type === 'rating') {
    const num = Number(value);
    if (Number.isNaN(num)) return `${field.label} must be a number`;
    if (typeof field.min_value === 'number' && num < field.min_value) {
      return `${field.label} must be at least ${field.min_value}`;
    }
    if (typeof field.max_value === 'number' && num > field.max_value) {
      return `${field.label} must be at most ${field.max_value}`;
    }
  }

  if (field.field_type === 'url' && str) {
    try {
      new URL(str.match(/^https?:\/\//) ? str : `https://${str}`);
    } catch {
      return `${field.label} must be a valid URL`;
    }
  }

  if (field.field_type === 'email' && str) {
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(str)) {
      return `${field.label} must be a valid email address`;
    }
  }

  if (field.pattern) {
    try {
      const re = new RegExp(field.pattern);
      if (!re.test(str)) {
        return field.pattern_error || `${field.label} is not in the expected format`;
      }
    } catch {
      // Malformed pattern authored in the builder — don't block real users on it.
    }
  }

  return null;
}

/** Validate an entire submission, honoring conditional visibility. First error wins. */
export function validateFormSubmission(
  fields: FormField[],
  values: Record<string, unknown>,
): { field: string; message: string } | null {
  for (const field of fields) {
    if (NON_INPUT_FIELD_TYPES.includes(field.field_type)) continue;
    if (!isFieldVisible(field, values)) continue;
    const message = validateFieldValue(field, values[field.name]);
    if (message) return { field: field.name, message };
  }
  return null;
}

export function getFormPublicPath(slug: string): string {
  return `/forms/${slug}`;
}

export async function fetchPublicForm(
  slug: string,
  tenantId: string,
  environment: string,
  allowDraft = false,
): Promise<MarbeeForm | null> {
  let query = supabase
    .from('forms')
    .select('*')
    .eq('slug', slug)
    .eq('tenant_id', tenantId)
    .eq('environment', environment);

  if (!allowDraft) {
    query = query.eq('status', 'published');
  }

  const { data, error } = await query.maybeSingle();
  if (error) throw error;
  return data ? normalizeFormRow(data) : null;
}
