// Deploy: supabase functions deploy email-domains --no-verify-jwt
// Marbee Mail — customer sending-domain onboarding against Marbee's Amazon SES account.
//
// Actions (POST JSON):
//   { action: 'add',    tenant_id, domain }      → registers identity in SES, returns DNS records
//   { action: 'check',  tenant_id, domain_id }   → DNS lookup + SES status, updates row
//   { action: 'retry',  tenant_id, domain_id }   → re-creates a failed identity (new DKIM tokens)
//   { action: 'delete', tenant_id, domain_id }   → removes identity from SES + row
//   { action: 'cron_recheck' }                   → service-role only; called by pg_cron (sql/81)
//
// Secrets: SES_AWS_ACCESS_KEY_ID, SES_AWS_SECRET_ACCESS_KEY, SES_REGION,
//          optional SES_CONFIGURATION_SET, SES_MAIL_FROM_SUBDOMAIN (default "bounce"),
//          optional EMAIL_DMARC_RUA (e.g. "dmarc@marbee.io").
// Single-file on purpose so it can be pasted into the Supabase dashboard (see web-deploy/).

import { createClient, type SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

function err(message: string, status = 400) {
  return json({ error: message }, status);
}

const env = (k: string) => Deno.env.get(k)?.trim() ?? '';

const SES_REGION = () => env('SES_REGION') || 'us-east-1';
const MAIL_FROM_SUB = () => env('SES_MAIL_FROM_SUBDOMAIN') || 'bounce';
const PENDING_TIMEOUT_MS = 72 * 3600 * 1000;

const FREEMAIL = new Set([
  'gmail.com', 'googlemail.com', 'yahoo.com', 'yahoo.co.in', 'ymail.com', 'outlook.com', 'hotmail.com',
  'live.com', 'msn.com', 'icloud.com', 'me.com', 'mac.com', 'aol.com', 'proton.me', 'protonmail.com',
  'zoho.com', 'zohomail.com', 'gmx.com', 'gmx.de', 'mail.com', 'yandex.com', 'yandex.ru', 'rediffmail.com',
  'amazonses.com', 'marbee.io',
]);

const DOMAIN_RE = /^(?=.{4,253}$)(?!-)([a-z0-9-]{1,63}(?<!-)\.)+[a-z]{2,63}$/;

// -----------------------------------------------------------------------------
// AWS SigV4 (SESv2 REST) — WebCrypto only, no SDK
// -----------------------------------------------------------------------------
const enc = new TextEncoder();

async function sha256Hex(data: string) {
  const buf = await crypto.subtle.digest('SHA-256', enc.encode(data));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

async function hmac(key: ArrayBuffer | Uint8Array, data: string) {
  const k = await crypto.subtle.importKey('raw', key, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return crypto.subtle.sign('HMAC', k, enc.encode(data));
}

function toHex(buf: ArrayBuffer) {
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

class SesError extends Error {
  constructor(public code: string, message: string, public status: number) {
    super(message);
  }
}

async function ses<T = Record<string, unknown>>(method: string, path: string, body?: unknown): Promise<T> {
  const accessKey = env('SES_AWS_ACCESS_KEY_ID');
  const secretKey = env('SES_AWS_SECRET_ACCESS_KEY');
  if (!accessKey || !secretKey) {
    throw new SesError('Config', 'SES credentials are not configured (SES_AWS_ACCESS_KEY_ID / SES_AWS_SECRET_ACCESS_KEY)', 500);
  }
  const region = SES_REGION();
  const host = `email.${region}.amazonaws.com`;
  const payload = body === undefined ? '' : JSON.stringify(body);
  const amzDate = new Date().toISOString().replace(/[:-]|\.\d{3}/g, '');
  const dateStamp = amzDate.slice(0, 8);
  const canonicalUri = path.split('/').map((s) => encodeURIComponent(s)).join('/');
  const contentType = 'application/json';

  const canonicalHeaders = `content-type:${contentType}\nhost:${host}\nx-amz-date:${amzDate}\n`;
  const signedHeaders = 'content-type;host;x-amz-date';
  const canonicalRequest = [method, canonicalUri, '', canonicalHeaders, signedHeaders, await sha256Hex(payload)].join('\n');
  const scope = `${dateStamp}/${region}/ses/aws4_request`;
  const stringToSign = ['AWS4-HMAC-SHA256', amzDate, scope, await sha256Hex(canonicalRequest)].join('\n');

  let key = await hmac(enc.encode(`AWS4${secretKey}`), dateStamp);
  key = await hmac(key, region);
  key = await hmac(key, 'ses');
  key = await hmac(key, 'aws4_request');
  const signature = toHex(await hmac(key, stringToSign));

  const res = await fetch(`https://${host}${canonicalUri}`, {
    method,
    headers: {
      'Content-Type': contentType,
      'X-Amz-Date': amzDate,
      Authorization: `AWS4-HMAC-SHA256 Credential=${accessKey}/${scope}, SignedHeaders=${signedHeaders}, Signature=${signature}`,
    },
    body: payload || undefined,
  });

  const text = await res.text();
  const data = text ? JSON.parse(text) : {};
  if (!res.ok) {
    const code = (res.headers.get('x-amzn-ErrorType') ?? data.__type ?? 'SesError').split(':')[0].split('#').pop();
    throw new SesError(code, data.message ?? data.Message ?? `SES ${res.status}`, res.status);
  }
  return data as T;
}

type SesIdentity = {
  DkimAttributes?: { Status?: string; Tokens?: string[]; SigningEnabled?: boolean };
  MailFromAttributes?: { MailFromDomain?: string; MailFromDomainStatus?: string };
  VerifiedForSendingStatus?: boolean;
  Tags?: { Key: string; Value: string }[];
};

const idPath = (domain: string) => `/v2/email/identities/${domain}`;

async function createIdentity(domain: string, tenantId: string) {
  const body: Record<string, unknown> = {
    EmailIdentity: domain,
    DkimSigningAttributes: { NextSigningKeyLength: 'RSA_2048_BIT' },
    Tags: [{ Key: 'marbee_tenant_id', Value: tenantId }],
  };
  const configSet = env('SES_CONFIGURATION_SET');
  if (configSet) body.ConfigurationSetName = configSet;

  let tokens: string[] = [];
  try {
    const out = await ses<{ DkimAttributes?: { Tokens?: string[] } }>('POST', '/v2/email/identities', body);
    tokens = out.DkimAttributes?.Tokens ?? [];
  } catch (e) {
    if (!(e instanceof SesError) || e.code !== 'AlreadyExistsException') throw e;
    // Identity left over from an earlier half-finished add — reuse only if it's ours.
    const existing = await ses<SesIdentity>('GET', idPath(domain));
    const owner = existing.Tags?.find((t) => t.Key === 'marbee_tenant_id')?.Value;
    if (owner !== tenantId) {
      throw new SesError('Conflict', 'This domain is already registered on the Marbee sending platform. Contact support.', 409);
    }
    tokens = existing.DkimAttributes?.Tokens ?? [];
  }

  await ses('PUT', `${idPath(domain)}/mail-from`, {
    MailFromDomain: `${MAIL_FROM_SUB()}.${domain}`,
    BehaviorOnMxFailure: 'USE_DEFAULT_VALUE',
  });

  return tokens;
}

async function deleteIdentity(domain: string) {
  try {
    await ses('DELETE', idPath(domain));
  } catch (e) {
    if (!(e instanceof SesError) || e.code !== 'NotFoundException') throw e;
  }
}

// -----------------------------------------------------------------------------
// DNS over HTTPS (Cloudflare, Google fallback)
// -----------------------------------------------------------------------------
const DNS_TYPES: Record<string, number> = { A: 1, NS: 2, CNAME: 5, SOA: 6, MX: 15, TXT: 16, AAAA: 28 };

async function dns(name: string, type: keyof typeof DNS_TYPES): Promise<string[]> {
  const endpoints = [
    `https://cloudflare-dns.com/dns-query?name=${encodeURIComponent(name)}&type=${type}`,
    `https://dns.google/resolve?name=${encodeURIComponent(name)}&type=${type}`,
  ];
  for (const url of endpoints) {
    try {
      const res = await fetch(url, { headers: { Accept: 'application/dns-json' } });
      if (!res.ok) continue;
      const data = await res.json() as { Status: number; Answer?: { type: number; data: string }[] };
      if (data.Status === 3) return []; // NXDOMAIN
      return (data.Answer ?? [])
        .filter((a) => a.type === DNS_TYPES[type])
        .map((a) => a.data.replace(/^"|"$/g, '').replace(/"\s*"/g, '').replace(/\.$/, '').toLowerCase());
    } catch {
      // try next resolver
    }
  }
  return [];
}

function parentDomain(domain: string) {
  const parts = domain.split('.');
  return parts.length > 2 ? parts.slice(1).join('.') : null;
}

async function findNameservers(domain: string): Promise<string[]> {
  let d: string | null = domain;
  while (d) {
    const ns = await dns(d, 'NS');
    if (ns.length) return ns;
    d = parentDomain(d);
  }
  return [];
}

function detectDnsProvider(ns: string[]): string | null {
  const all = ns.join(' ');
  const map: [RegExp, string][] = [
    [/cloudflare\.com/, 'cloudflare'],
    [/awsdns/, 'route53'],
    [/domaincontrol\.com/, 'godaddy'],
    [/registrar-servers\.com/, 'namecheap'],
    [/googledomains\.com|ns-cloud-.*\.googledomains|google\.com/, 'google'],
    [/azure-dns/, 'azure'],
    [/digitalocean\.com/, 'digitalocean'],
    [/hostinger|dns-parking\.com/, 'hostinger'],
    [/zoho/, 'zoho'],
    [/bigrock|resellerclub|mydomain/, 'bigrock'],
    [/wixdns/, 'wix'],
    [/squarespacedns|squarespace/, 'squarespace'],
  ];
  return map.find(([re]) => re.test(all))?.[1] ?? (ns.length ? 'other' : null);
}

type RecordCheck = {
  key: string;
  purpose: string;
  type: 'CNAME' | 'MX' | 'TXT';
  host: string;
  value: string;
  required: boolean;
  ok: boolean;
  found: string[];
  hint?: string;
};

function expectedRecords(domain: string, tokens: string[], region: string) {
  const mailFrom = `${MAIL_FROM_SUB()}.${domain}`;
  const rua = env('EMAIL_DMARC_RUA');
  const records: Omit<RecordCheck, 'ok' | 'found'>[] = tokens.map((t, i) => ({
    key: `dkim_${i + 1}`,
    purpose: `DKIM signature ${i + 1} of ${tokens.length}`,
    type: 'CNAME',
    host: `${t}._domainkey.${domain}`,
    value: `${t}.dkim.amazonses.com`,
    required: true,
  }));
  records.push(
    {
      key: 'mail_from_mx',
      purpose: 'Bounce handling (custom MAIL FROM)',
      type: 'MX',
      host: mailFrom,
      value: `10 feedback-smtp.${region}.amazonses.com`,
      required: true,
    },
    {
      key: 'mail_from_spf',
      purpose: 'SPF for the bounce domain',
      type: 'TXT',
      host: mailFrom,
      value: 'v=spf1 include:amazonses.com ~all',
      required: true,
    },
    {
      key: 'dmarc',
      purpose: 'DMARC policy (required by Gmail/Yahoo/Outlook for bulk mail)',
      type: 'TXT',
      host: `_dmarc.${domain}`,
      value: `v=DMARC1; p=none;${rua ? ` rua=mailto:${rua};` : ''} adkim=r; aspf=r`,
      required: true,
    },
  );
  return records;
}

async function checkRecord(rec: Omit<RecordCheck, 'ok' | 'found'>, domain: string): Promise<RecordCheck> {
  if (rec.type === 'CNAME') {
    const found = await dns(rec.host, 'CNAME');
    const ok = found.includes(rec.value.toLowerCase());
    let hint: string | undefined;
    if (!ok) {
      if (found.length) {
        hint = `Points to ${found[0]} — it must point to ${rec.value}.`;
      } else {
        // DNS hosts that auto-append the zone produce "host.domain.com.domain.com".
        const parent = parentDomain(domain);
        for (const suffix of [domain, parent].filter(Boolean) as string[]) {
          const doubled = await dns(`${rec.host}.${suffix}`, 'CNAME');
          if (doubled.length) {
            hint = `Found at ${rec.host}.${suffix} — your DNS provider adds the domain automatically. Enter only "${rec.host.slice(0, -(suffix.length + 1))}" as the host.`;
            break;
          }
        }
        if (!hint && (await dns(rec.host, 'A')).length) {
          hint = 'This name returns an IP address instead of a CNAME. If you use Cloudflare, switch the record to "DNS only" (grey cloud).';
        }
      }
    }
    return { ...rec, ok, found, hint };
  }

  if (rec.type === 'MX') {
    const found = await dns(rec.host, 'MX');
    const target = rec.value.split(' ')[1].toLowerCase();
    const ok = found.some((v) => v.split(/\s+/).pop() === target);
    return {
      ...rec,
      ok,
      found,
      hint: ok ? undefined : found.length ? `MX points to ${found[0]} — it must point to ${target}.` : undefined,
    };
  }

  // TXT
  if (rec.key === 'dmarc') {
    let dmarc = (await dns(rec.host, 'TXT')).filter((v) => v.startsWith('v=dmarc1'));
    // DMARC is inherited from the organisational domain when the subdomain has none.
    const parent = parentDomain(domain);
    let inherited = false;
    if (!dmarc.length && parent) {
      dmarc = (await dns(`_dmarc.${parent}`, 'TXT')).filter((v) => v.startsWith('v=dmarc1'));
      inherited = dmarc.length > 0;
    }
    return {
      ...rec,
      ok: dmarc.length > 0,
      found: dmarc,
      hint: inherited ? `Covered by the existing DMARC policy on ${parent} — no change needed.` : undefined,
    };
  }

  const found = await dns(rec.host, 'TXT');
  const spf = found.filter((v) => v.startsWith('v=spf1'));
  const ok = spf.some((v) => v.includes('include:amazonses.com'));
  return {
    ...rec,
    ok,
    found: spf,
    hint: ok
      ? spf.length > 1 ? 'More than one SPF record found — merge them into one.' : undefined
      : spf.length ? 'An SPF record exists but does not include amazonses.com.' : undefined,
  };
}

// -----------------------------------------------------------------------------
// Verification state machine
// -----------------------------------------------------------------------------
type DomainRow = {
  id: string;
  tenant_id: string;
  domain: string;
  status: string;
  ses_region: string;
  dkim_tokens: string[];
  created_at: string;
  verified_at: string | null;
  warmup_started_at: string | null;
};

async function runCheck(service: SupabaseClient, row: DomainRow) {
  const now = new Date().toISOString();
  let identity: SesIdentity | null = null;
  let sesError: string | null = null;
  try {
    identity = await ses<SesIdentity>('GET', idPath(row.domain));
  } catch (e) {
    sesError = e instanceof SesError && e.code === 'NotFoundException'
      ? 'Identity no longer exists in SES — use Retry to re-register it.'
      : (e as Error).message;
  }

  const tokens = identity?.DkimAttributes?.Tokens?.length ? identity.DkimAttributes.Tokens : row.dkim_tokens;
  const records = await Promise.all(expectedRecords(row.domain, tokens, row.ses_region).map((r) => checkRecord(r, row.domain)));

  const dkimStatus = identity?.DkimAttributes?.Status ?? (sesError ? 'NOT_FOUND' : 'PENDING');
  const mailFromStatus = identity?.MailFromAttributes?.MailFromDomainStatus ?? 'PENDING';
  const dmarcFound = records.find((r) => r.key === 'dmarc')?.ok ?? false;
  const dkimOk = dkimStatus === 'SUCCESS';
  const wasSendable = row.status === 'verified' || row.status === 'partially_verified' || row.status === 'degraded';

  let status = row.status;
  let failure: string | null = null;
  if (row.status !== 'suspended') {
    if (dkimOk && mailFromStatus === 'SUCCESS' && dmarcFound) status = 'verified';
    else if (dkimOk) status = 'partially_verified';
    else if (wasSendable) {
      status = 'degraded';
      failure = sesError ?? 'DKIM records are no longer found — sending is paused until they are restored.';
    } else if (dkimStatus === 'FAILED' || Date.now() - new Date(row.created_at).getTime() > PENDING_TIMEOUT_MS) {
      status = 'failed';
      failure = sesError ?? 'DNS records were not found within 72 hours. Fix the records, then press Retry.';
    } else {
      status = 'pending';
      failure = sesError;
    }
  }

  const sendable = status === 'verified' || status === 'partially_verified';
  const patch = {
    status,
    dkim_tokens: tokens,
    dkim_status: dkimStatus,
    mail_from_status: mailFromStatus,
    dmarc_found: dmarcFound,
    records,
    last_checked_at: now,
    failure_reason: failure,
    verified_at: sendable ? row.verified_at ?? now : row.verified_at,
    warmup_started_at: sendable ? row.warmup_started_at ?? now : row.warmup_started_at,
  };

  const { data, error } = await service
    .from('email_sending_domains')
    .update(patch)
    .eq('id', row.id)
    .select('*')
    .single();
  if (error) throw new Error(error.message);
  return data;
}

// -----------------------------------------------------------------------------
// Handler
// -----------------------------------------------------------------------------
type Body = { action?: string; tenant_id?: string; domain?: string; domain_id?: string };

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return err('Method not allowed', 405);

  const supabaseUrl = env('SUPABASE_URL');
  const serviceKey = env('SUPABASE_SERVICE_ROLE_KEY');
  if (!supabaseUrl || !serviceKey) return err('Edge function missing Supabase env vars', 500);
  const service = createClient(supabaseUrl, serviceKey);

  let body: Body;
  try {
    body = await req.json();
  } catch {
    return err('Invalid JSON body');
  }

  const bearer = req.headers.get('authorization')?.replace(/^Bearer\s+/i, '') ?? '';

  try {
    // ---- cron: service-role only ----
    if (body.action === 'cron_recheck') {
      if (bearer !== serviceKey) return err('Forbidden', 403);
      const pendingCutoff = new Date(Date.now() - 10 * 60 * 1000).toISOString();
      const dailyCutoff = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
      const { data: rows, error } = await service
        .from('email_sending_domains')
        .select('*')
        .or(
          `and(status.in.(pending,partially_verified),or(last_checked_at.is.null,last_checked_at.lt.${pendingCutoff})),` +
          `and(status.in.(verified,degraded),or(last_checked_at.is.null,last_checked_at.lt.${dailyCutoff}))`,
        )
        .order('last_checked_at', { ascending: true, nullsFirst: true })
        .limit(40);
      if (error) return err(error.message, 500);
      let checked = 0;
      for (const row of rows ?? []) {
        try {
          await runCheck(service, row as DomainRow);
          checked++;
        } catch (e) {
          console.error('recheck failed', row.domain, (e as Error).message);
        }
      }
      return json({ checked });
    }

    // ---- user actions ----
    if (!bearer) return err('Missing authorization', 401);
    const { data: userData, error: userError } = await service.auth.getUser(bearer);
    if (userError || !userData.user) return err('Invalid session', 401);

    const tenantId = body.tenant_id?.trim();
    if (!tenantId) return err('tenant_id is required');

    const perms = await Promise.all(
      ['settings.channels.manage', 'settings.manage'].map((p) =>
        service.rpc('user_has_permission_as', { p_user_id: userData.user.id, p_tenant_id: tenantId, p_permission: p }),
      ),
    );
    const permErr = perms.find((p) => p.error);
    if (permErr?.error) return err(permErr.error.message, 500);
    if (!perms.some((p) => p.data === true)) {
      return err('Permission denied — your role needs "Manage channels"', 403);
    }

    const loadRow = async () => {
      if (!body.domain_id) throw new SesError('BadRequest', 'domain_id is required', 400);
      const { data, error } = await service
        .from('email_sending_domains')
        .select('*')
        .eq('id', body.domain_id)
        .eq('tenant_id', tenantId)
        .maybeSingle();
      if (error) throw new Error(error.message);
      if (!data) throw new SesError('NotFound', 'Domain not found', 404);
      return data as DomainRow;
    };

    switch (body.action) {
      case 'add': {
        const domain = (body.domain ?? '')
          .trim()
          .toLowerCase()
          .replace(/^https?:\/\//, '')
          .replace(/\/.*$/, '')
          .replace(/^.*@/, '')
          .replace(/\.$/, '');
        if (!DOMAIN_RE.test(domain)) return err('Enter a valid domain, e.g. mail.yourcompany.com');
        if (FREEMAIL.has(domain) || FREEMAIL.has(parentDomain(domain) ?? '')) {
          return err('Free mailbox domains (Gmail, Outlook, Yahoo…) cannot be used. Use a domain your company owns.');
        }

        const { data: existing } = await service
          .from('email_sending_domains')
          .select('id, tenant_id')
          .ilike('domain', domain)
          .maybeSingle();
        if (existing) {
          return err(
            existing.tenant_id === tenantId
              ? 'This domain is already added to your workspace.'
              : 'This domain is already registered by another Marbee workspace. Contact support if you own it.',
            409,
          );
        }

        const ns = await findNameservers(domain);
        if (!ns.length) return err(`We couldn't find "${domain}" in public DNS. Check the spelling, or register the domain first.`);

        const tokens = await createIdentity(domain, tenantId);
        const region = SES_REGION();
        const records = expectedRecords(domain, tokens, region).map((r) => ({ ...r, ok: false, found: [] }));

        const { data: row, error } = await service
          .from('email_sending_domains')
          .insert({
            tenant_id: tenantId,
            domain,
            ses_region: region,
            dkim_tokens: tokens,
            mail_from_domain: `${MAIL_FROM_SUB()}.${domain}`,
            dns_provider: detectDnsProvider(ns),
            records,
            created_by: userData.user.id,
          })
          .select('*')
          .single();
        if (error) {
          await deleteIdentity(domain).catch(() => undefined);
          return err(error.message, 500);
        }
        return json({ domain: row });
      }

      case 'check': {
        const row = await loadRow();
        return json({ domain: await runCheck(service, row) });
      }

      case 'retry': {
        const row = await loadRow();
        if (row.status === 'suspended') return err('This domain is suspended. Contact support.', 403);
        await deleteIdentity(row.domain);
        const tokens = await createIdentity(row.domain, tenantId);
        const { data: fresh, error } = await service
          .from('email_sending_domains')
          .update({
            status: 'pending',
            dkim_tokens: tokens,
            dkim_status: 'PENDING',
            mail_from_status: 'PENDING',
            failure_reason: null,
            verified_at: null,
            warmup_started_at: null,
            created_at: new Date().toISOString(),
            records: expectedRecords(row.domain, tokens, row.ses_region).map((r) => ({ ...r, ok: false, found: [] })),
          })
          .eq('id', row.id)
          .select('*')
          .single();
        if (error) return err(error.message, 500);
        return json({ domain: fresh });
      }

      case 'delete': {
        const row = await loadRow();
        await deleteIdentity(row.domain);
        const { error } = await service.from('email_sending_domains').delete().eq('id', row.id);
        if (error) return err(error.message, 500);
        return json({ deleted: true });
      }

      default:
        return err('Unknown action');
    }
  } catch (e) {
    if (e instanceof SesError) {
      const status = e.status >= 400 && e.status < 600 ? e.status : 500;
      const msg = e.code === 'LimitExceededException'
        ? 'The sending platform has reached its domain limit. Contact support.'
        : e.message;
      // AWS auth failures (403) are a platform misconfiguration, not the user's permission.
      return err(msg, status === 403 ? 502 : status);
    }
    console.error('email-domains error', e);
    return err((e as Error).message ?? 'Unexpected error', 500);
  }
});
