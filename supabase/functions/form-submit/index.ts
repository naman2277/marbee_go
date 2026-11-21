// Deploy: Supabase Dashboard → Edge Functions → form-submit
// Paste this entire file. Turn OFF "Enforce JWT Verification".

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { serve } from 'https://deno.land/std@0.208.0/http/server.ts';
import {
  clientIp,
  isDisposableEmail,
  isOriginAllowed,
  issueChallenge,
  leadingZeroBits,
  payloadFingerprint,
  sanitizeSubmission,
  verifyChallengeToken,
  verifyHostedCaptcha,
  type FormSecurityConfig,
} from '../_shared/form-security.ts';
import { loadVariablePlaintext } from '../_shared/global-vars.ts';
import { encryptFieldsWithKey } from '../_shared/field-crypto.ts';
import { tenantIsActive } from '../_shared/tenant-guard.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function jsonResponse(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

function errorResponse(message: string, status = 400) {
  return jsonResponse({ error: message }, status);
}

function getServiceClient() {
  return createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
  );
}

const PROTECTED_CUSTOMER_COLUMNS = new Set([
  'id',
  'tenant_id',
  'environment',
  'created_at',
  'updated_at',
  'deleted_at',
]);

type FormFieldMapping = {
  form_field: string;
  schema_field: string;
  transform?: string;
  type_cast?: string;
};

type FormSchemaMapping = {
  storage_target?: 'customer' | 'schema';
  target_schema_slug?: string;
  field_mappings?: FormFieldMapping[];
  upsert_customer?: boolean;
  customer_match_key?: 'email' | 'mobile' | 'email_or_mobile';
  customer_email_field?: string;
  customer_mobile_field?: string;
};

type FormField = {
  name: string;
  label: string;
  field_type: string;
  required?: boolean;
};

function getStorageTarget(mapping: FormSchemaMapping): 'customer' | 'schema' {
  if (mapping.storage_target) return mapping.storage_target;
  if (mapping.target_schema_slug) return 'schema';
  if (mapping.upsert_customer) return 'customer';
  return 'customer';
}

const IDENTITY_COLUMNS = new Set(['email', 'mobile']);

function suggestIdentityField(fields: FormField[], kind: 'email' | 'mobile'): string | undefined {
  if (kind === 'email') {
    const typed = fields.find((f) => f.field_type === 'email');
    if (typed) return typed.name;
    return fields.find((f) => f.name.toLowerCase().includes('email'))?.name;
  }
  const typed = fields.find((f) => f.field_type === 'phone');
  if (typed) return typed.name;
  return fields.find((f) => {
    if (f.field_type === 'email') return false;
    const n = f.name.toLowerCase();
    const label = f.label.toLowerCase();
    return n.includes('mobile') || n.includes('phone') || label.includes('mobile') || label.includes('phone');
  })?.name;
}

function resolveIdentityValues(
  data: Record<string, unknown>,
  fields: FormField[],
  mapping: FormSchemaMapping,
): { email?: string; mobile?: string } {
  const emailField = mapping.customer_email_field ?? suggestIdentityField(fields, 'email');
  const mobileField = mapping.customer_mobile_field ?? suggestIdentityField(fields, 'mobile');

  const readField = (name: string | undefined): string | undefined => {
    if (!name) return undefined;
    if (!fields.some((f) => f.name === name)) return undefined;
    const raw = data[name];
    if (raw === undefined || raw === null || raw === '') return undefined;
    return String(raw).trim() || undefined;
  };

  const email = readField(emailField);
  const mobile = readField(mobileField);
  return {
    email: email ? email.toLowerCase() : undefined,
    mobile,
  };
}

function buildCustomerPayloadFromForm(
  data: Record<string, unknown>,
  fields: FormField[],
  mapping: FormSchemaMapping,
  storageTarget: 'customer' | 'schema',
): Record<string, unknown> {
  const payload: Record<string, unknown> = {};

  if (storageTarget === 'customer') {
    for (const m of mapping.field_mappings ?? []) {
      if (PROTECTED_CUSTOMER_COLUMNS.has(m.schema_field)) continue;
      if (IDENTITY_COLUMNS.has(m.schema_field)) continue;
      const raw = data[m.form_field];
      if (raw !== undefined && raw !== null && raw !== '') {
        payload[m.schema_field] = applyFieldMappingValue(raw, m);
      }
    }
    if (!payload.first_name) {
      const legacyName =
        (data.first_name as string | undefined) ??
        (data.name as string | undefined) ??
        (data.full_name as string | undefined);
      if (legacyName) payload.first_name = legacyName;
    }
  }

  const { email, mobile } = resolveIdentityValues(data, fields, mapping);
  if (email) payload.email = email;
  if (mobile) payload.mobile = mobile;

  return payload;
}

function applyFieldMappingValue(raw: unknown, mapping: FormFieldMapping): unknown {
  let value = raw;
  switch (mapping.transform) {
    case 'trim':
      if (typeof value === 'string') value = value.trim();
      break;
    case 'lowercase':
      if (typeof value === 'string') value = value.toLowerCase();
      break;
    case 'uppercase':
      if (typeof value === 'string') value = value.toUpperCase();
      break;
    default:
      break;
  }
  const cast = mapping.type_cast ?? 'none';
  if (cast === 'none' || value === null || value === undefined || value === '') return value;
  if (cast === 'string') return String(value);
  if (cast === 'number') {
    const n = Number(value);
    return Number.isNaN(n) ? value : n;
  }
  if (cast === 'boolean') {
    if (typeof value === 'boolean') return value;
    if (value === 'true' || value === '1' || value === 'on') return true;
    if (value === 'false' || value === '0' || value === 'off') return false;
    return Boolean(value);
  }
  if (cast === 'date') {
    const d = new Date(String(value));
    return Number.isNaN(d.getTime()) ? value : d.toISOString().slice(0, 10);
  }
  return value;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabase = getServiceClient();
    const body = await req.json();
    const formId = body.form_id as string;
    const tenantId = body.tenant_id as string;
    const environment = (body.environment as string) ?? 'production';

    if (!formId || !tenantId) {
      return errorResponse('form_id and tenant_id are required', 400);
    }

    const { data: form, error: formErr } = await supabase
      .from('forms')
      .select('id, name, tenant_id, environment, status, fields, schema_mapping, settings')
      .eq('id', formId)
      .eq('tenant_id', tenantId)
      .eq('environment', environment)
      .eq('status', 'published')
      .maybeSingle();

    if (formErr) return errorResponse(formErr.message, 500);
    if (!form) return errorResponse('Form not found or not published', 404);
    if (!(await tenantIsActive(supabase, tenantId))) return errorResponse('This form is not available', 403);

    const fields = (form.fields ?? []) as FormField[];
    const settings = (form.settings ?? {}) as Record<string, unknown>;
    const security = (settings.security ?? {}) as FormSecurityConfig;
    const captcha = security.captcha ?? {};
    const bot = security.bot ?? {};
    const hardening = security.input ?? {};

    // --- Challenge issuance -------------------------------------------------
    // The page asks for a challenge before rendering. Signed here so the
    // expected answer can round-trip through an untrusted client.
    if (body.action === 'challenge') {
      const provider = captcha.provider;
      if (provider !== 'smart_math' && provider !== 'proof_of_work') {
        return jsonResponse({ provider: provider ?? 'none' });
      }
      const issued = await issueChallenge(
        provider,
        form.id,
        captcha.difficulty ?? 'medium',
        captcha.ttl_seconds ?? 600,
      );
      return jsonResponse({ provider, ...issued });
    }

    const data = body.data as Record<string, unknown>;
    if (!data || typeof data !== 'object') {
      return errorResponse('data is required', 400);
    }

    const ip = clientIp(req);

    // --- Availability -------------------------------------------------------
    if (settings.accepting_responses === false) {
      return errorResponse(
        (settings.closed_message as string) ?? 'This form is no longer accepting responses.',
        403,
      );
    }
    const nowMs = Date.now();
    if (settings.opens_at && nowMs < Date.parse(settings.opens_at as string)) {
      return errorResponse('This form is not open yet.', 403);
    }
    if (settings.closes_at && nowMs > Date.parse(settings.closes_at as string)) {
      return errorResponse(
        (settings.closed_message as string) ?? 'This form is no longer accepting responses.',
        403,
      );
    }

    // --- Origin allowlist ---------------------------------------------------
    const allowedDomains = (settings.allowed_domains as string[]) ?? [];
    if (bot.enforce_origin && allowedDomains.length > 0) {
      const origin = req.headers.get('origin') ?? req.headers.get('referer');
      if (!isOriginAllowed(origin, allowedDomains)) {
        return errorResponse('Submissions are not accepted from this origin.', 403);
      }
    }

    // --- IP blocklist -------------------------------------------------------
    if ((bot.blocked_ips ?? []).includes(ip)) {
      return errorResponse('Submission rejected.', 403);
    }

    // --- Honeypot -----------------------------------------------------------
    // Accept and discard, so the bot sees success and does not retune.
    const honeypotField = bot.honeypot_field ?? 'mb_contact_pref';
    if (bot.honeypot_enabled && String(data[honeypotField] ?? '').trim() !== '') {
      return jsonResponse({ submissionId: crypto.randomUUID(), customerId: null, customerAction: null });
    }
    delete data[honeypotField];

    // --- Timing trap --------------------------------------------------------
    const renderedAt = Number(body.rendered_at ?? 0);
    if (renderedAt > 0) {
      const elapsed = (nowMs - renderedAt) / 1000;
      if (bot.min_fill_seconds && elapsed < bot.min_fill_seconds) {
        return errorResponse('That was too quick — please try again.', 429);
      }
      if (bot.max_fill_seconds && elapsed > bot.max_fill_seconds) {
        return errorResponse('This form session expired. Please reload and try again.', 419);
      }
    }

    // --- CAPTCHA (server-verified) -----------------------------------------
    const provider = captcha.provider ?? 'none';
    if (provider !== 'none') {
      const captchaToken = String(body.captcha_token ?? '');
      if (!captchaToken) return errorResponse('CAPTCHA verification is required.', 400);

      if (provider === 'smart_math' || provider === 'proof_of_work') {
        const { payload, error: tokenErr } = await verifyChallengeToken(captchaToken, form.id);
        if (tokenErr || !payload) return errorResponse(tokenErr ?? 'Challenge failed', 400);

        // Burn the nonce so a captured token cannot be replayed.
        const { error: burnErr } = await supabase
          .from('form_challenge_nonces')
          .insert({ nonce: payload.n, form_id: form.id, expires_at: new Date(payload.e * 1000).toISOString() });
        if (burnErr) return errorResponse('This challenge was already used. Please retry.', 409);

        if (provider === 'smart_math') {
          if (String(body.captcha_answer ?? '').trim() !== payload.a) {
            return errorResponse('Incorrect answer — please try again.', 400);
          }
        } else {
          const nonce = String(body.captcha_answer ?? '');
          const digest = new Uint8Array(
            await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`${payload.a}${nonce}`)),
          );
          if (leadingZeroBits(digest) < (payload.b ?? 16)) {
            return errorResponse('Proof of work is invalid.', 400);
          }
        }
      } else {
        // Hosted provider — the secret lives in a global variable, never in settings.
        const secretVar = captcha.secret_variable;
        if (!secretVar) return errorResponse('CAPTCHA secret is not configured.', 500);

        // Secret variables are sealed with MARBEE_SECRETS_KEY (SEC-05); open them server-side.
        // (Before, the sealed envelope itself was sent to the CAPTCHA provider and always failed.)
        const varRow = await loadVariablePlaintext(supabase, tenantId, environment, secretVar, 'forms');
        const secret = varRow?.plaintext ?? Deno.env.get(secretVar);
        if (!secret) return errorResponse('CAPTCHA secret could not be resolved.', 500);

        const verified = await verifyHostedCaptcha(
          provider,
          captchaToken,
          secret,
          ip === 'unknown' ? undefined : ip,
          captcha.score_threshold ?? 0.5,
        );
        if (!verified.ok) return errorResponse(verified.error ?? 'CAPTCHA verification failed.', 400);
      }
    }

    // --- Rate limiting ------------------------------------------------------
    if (bot.rate_limit_per_hour || bot.rate_limit_per_day) {
      const windows: Array<{ limit: number; sinceMs: number; label: string }> = [];
      if (bot.rate_limit_per_hour)
        windows.push({ limit: bot.rate_limit_per_hour, sinceMs: 3600_000, label: 'hour' });
      if (bot.rate_limit_per_day)
        windows.push({ limit: bot.rate_limit_per_day, sinceMs: 86_400_000, label: 'day' });

      for (const w of windows) {
        const { count } = await supabase
          .from('form_submission_attempts')
          .select('id', { count: 'exact', head: true })
          .eq('form_id', form.id)
          .eq('ip', ip)
          .gte('created_at', new Date(nowMs - w.sinceMs).toISOString());
        if ((count ?? 0) >= w.limit) {
          return errorResponse(`Too many submissions from this address this ${w.label}.`, 429);
        }
      }
    }

    // --- Input hardening ----------------------------------------------------
    const allowedFields = fields.map((f) => f.name);
    const sanitized = sanitizeSubmission(data, allowedFields, hardening);
    if (sanitized.blocked) return errorResponse(sanitized.blocked, 400);
    const cleanData = sanitized.data;

    // --- Required fields (checked after sanitizing) -------------------------
    for (const field of fields) {
      if (!field.required) continue;
      const val = cleanData[field.name];
      if (val === undefined || val === null || val === '') {
        return errorResponse(`${field.label} is required`, 400);
      }
    }

    // --- Disposable email ---------------------------------------------------
    if (bot.block_disposable_email) {
      for (const f of fields) {
        if (f.field_type !== 'email') continue;
        const value = String(cleanData[f.name] ?? '');
        if (value && isDisposableEmail(value)) {
          return errorResponse('Please use a permanent email address.', 400);
        }
      }
    }

    // --- Duplicate suppression ---------------------------------------------
    const fingerprint = await payloadFingerprint(cleanData);
    if (bot.duplicate_window_minutes && bot.duplicate_window_minutes > 0) {
      const { data: dupe } = await supabase
        .from('form_submission_attempts')
        .select('id')
        .eq('form_id', form.id)
        .eq('fingerprint', fingerprint)
        .gte('created_at', new Date(nowMs - bot.duplicate_window_minutes * 60_000).toISOString())
        .limit(1)
        .maybeSingle();
      if (dupe) return errorResponse('This response was already submitted.', 409);
    }

    // Record the attempt for rate limiting and duplicate detection. Non-fatal:
    // losing the audit row must not cost a legitimate respondent their answer.
    await supabase.from('form_submission_attempts').insert({
      form_id: form.id,
      tenant_id: tenantId,
      environment,
      ip,
      fingerprint,
      flagged: sanitized.findings.length > 0 ? sanitized.findings : null,
    });

    const mapping = (form.schema_mapping ?? {}) as FormSchemaMapping;
    const storageTarget = getStorageTarget(mapping);
    const shouldUpsertCustomer = storageTarget === 'customer' || Boolean(mapping.upsert_customer);

    let customerId: string | null = null;
    let customerAction: 'created' | 'updated' | null = null;

    if (shouldUpsertCustomer) {
      const matchKey = mapping.customer_match_key ?? 'email_or_mobile';
      const payload = buildCustomerPayloadFromForm(cleanData, fields, mapping, storageTarget);
      const email = payload.email as string | undefined;
      const mobile = payload.mobile as string | undefined;

      const canMatch =
        (matchKey === 'email' && email) ||
        (matchKey === 'mobile' && mobile) ||
        (matchKey === 'email_or_mobile' && (email || mobile));

      if (canMatch) {
        const baseRow = {
          tenant_id: tenantId,
          environment,
          status: 'active',
          ...payload,
        };

        let existingId: string | null = null;

        if (email && (matchKey === 'email' || matchKey === 'email_or_mobile')) {
          const { data: existing, error: lookupErr } = await supabase
            .from('customers')
            .select('id')
            .eq('tenant_id', tenantId)
            .eq('environment', environment)
            .eq('email', email)
            .is('deleted_at', null)
            .order('created_at', { ascending: true })
            .limit(1)
            .maybeSingle();
          if (lookupErr) return errorResponse(lookupErr.message, 500);
          existingId = existing?.id ?? null;
        } else if (mobile && (matchKey === 'mobile' || matchKey === 'email_or_mobile')) {
          const { data: existing, error: lookupErr } = await supabase
            .from('customers')
            .select('id')
            .eq('tenant_id', tenantId)
            .eq('environment', environment)
            .eq('mobile', mobile)
            .is('deleted_at', null)
            .order('created_at', { ascending: true })
            .limit(1)
            .maybeSingle();
          if (lookupErr) return errorResponse(lookupErr.message, 500);
          existingId = existing?.id ?? null;
        }

        if (existingId) {
          const { error: updateErr } = await supabase.from('customers').update(payload).eq('id', existingId);
          if (updateErr) return errorResponse(updateErr.message, 500);
          customerId = existingId;
          customerAction = 'updated';
        } else {
          const { data: created, error: insertErr } = await supabase
            .from('customers')
            .insert(baseRow)
            .select('id')
            .single();
          if (insertErr) return errorResponse(insertErr.message, 500);
          customerId = created.id;
          customerAction = 'created';
        }
      }
    }

    if (storageTarget === 'schema' && mapping.target_schema_slug && mapping.field_mappings?.length) {
      const { data: schemaDef } = await supabase
        .from('schema_definitions')
        .select('table_name, status')
        .eq('tenant_id', tenantId)
        .eq('environment', environment)
        .eq('slug', mapping.target_schema_slug)
        .eq('status', 'published')
        .maybeSingle();

      if (schemaDef?.table_name) {
        const record: Record<string, unknown> = {};
        for (const m of mapping.field_mappings) {
          if (cleanData[m.form_field] !== undefined) {
            record[m.schema_field] = applyFieldMappingValue(cleanData[m.form_field], m);
          }
        }
        if (Object.keys(record).length) {
          const { error: schemaErr } = await supabase
            .from(schemaDef.table_name)
            .insert({ ...record, tenant_id: tenantId, environment });
          if (schemaErr) return errorResponse(schemaErr.message, 500);
        }
      }
    }

    // Field-level encryption of the stored submission (SEC-05). Before, public submissions
    // were stored in plaintext because the key lived only in an admin's browser.
    let storedData: Record<string, unknown> = cleanData;
    const encryption = (settings.encryption ?? {}) as { enabled?: boolean; key_variable?: string; encrypt_all?: boolean; fields?: string[] };
    if (encryption.enabled && encryption.key_variable) {
      const keyVar = await loadVariablePlaintext(supabase, tenantId, environment, encryption.key_variable, 'forms');
      if (!keyVar || keyVar.kind !== 'encryption_key') {
        // Refuse rather than silently storing personal data unencrypted.
        return errorResponse('This form cannot accept responses right now (encryption key unavailable).', 503);
      }
      const formFields = (Array.isArray(form.fields) ? form.fields : []) as Array<{ name?: string; field_type?: string }>;
      const targets = encryption.encrypt_all
        ? formFields.filter((f) => f.name && !['heading', 'divider'].includes(String(f.field_type))).map((f) => String(f.name))
        : (encryption.fields ?? []);
      storedData = await encryptFieldsWithKey(cleanData, targets, keyVar.plaintext);
    }

    const { data: submission, error: subErr } = await supabase
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

    if (subErr) return errorResponse(subErr.message, 500);

    // Broadcast form trigger to any running pipelines with trigger_form nodes
    try {
      const { data: jobs } = await supabase
        .from('data_jobs')
        .select('id, workflow_json')
        .eq('tenant_id', tenantId)
        .eq('status', 'active')
        .eq('pipeline_status', 'started');

      if (jobs?.length) {
        const triggerPayload = {
          event_type: 'form_submission',
          form_id: form.id,
          form_name: form.name,
          submission_id: submission.id,
          data: cleanData,
          submitted_at: new Date().toISOString(),
        };

        for (const job of jobs) {
          const wf = job.workflow_json as { nodes?: { data?: { stepType?: string } }[] } | null;
          const hasFormTrigger = wf?.nodes?.some((n: { data?: { stepType?: string } }) => n.data?.stepType === 'trigger_form');
          if (!hasFormTrigger) continue;

          const ch = supabase.channel(`workflow-trigger:${job.id}`);
          await new Promise<void>((resolve) => {
            ch.subscribe((status: string) => {
              if (status === 'SUBSCRIBED') resolve();
            });
            setTimeout(resolve, 2000);
          });
          await ch.send({ type: 'broadcast', event: 'trigger_fire', payload: triggerPayload });
          setTimeout(() => supabase.removeChannel(ch), 500);
        }
      }
    } catch { /* best-effort trigger broadcast */ }

    return jsonResponse({
      submissionId: submission.id,
      customerId,
      customerAction,
    });
  } catch (err) {
    return errorResponse(err instanceof Error ? err.message : 'Unknown error', 500);
  }
});
