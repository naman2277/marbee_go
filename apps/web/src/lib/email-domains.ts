import { supabase } from './supabase';
import { invokeFunction } from './functions';

export type EmailDomainStatus =
  | 'pending'
  | 'partially_verified'
  | 'verified'
  | 'failed'
  | 'degraded'
  | 'suspended';

export type DnsRecordCheck = {
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

export type EmailDomain = {
  id: string;
  tenantId: string;
  domain: string;
  status: EmailDomainStatus;
  sesRegion: string;
  dkimStatus: string;
  mailFromDomain: string | null;
  mailFromStatus: string;
  dmarcFound: boolean;
  dnsProvider: string | null;
  records: DnsRecordCheck[];
  lastCheckedAt: string | null;
  verifiedAt: string | null;
  warmupStartedAt: string | null;
  failureReason: string | null;
  suspendedReason: string | null;
  createdAt: string;
};

export type EmailSender = {
  id: string;
  domainId: string;
  fromEmail: string;
  fromName: string;
  replyTo: string | null;
  isDefault: boolean;
};

type DomainDbRow = {
  id: string;
  tenant_id: string;
  domain: string;
  status: EmailDomainStatus;
  ses_region: string;
  dkim_status: string;
  mail_from_domain: string | null;
  mail_from_status: string;
  dmarc_found: boolean;
  dns_provider: string | null;
  records: DnsRecordCheck[] | null;
  last_checked_at: string | null;
  verified_at: string | null;
  warmup_started_at: string | null;
  failure_reason: string | null;
  suspended_reason: string | null;
  created_at: string;
};

function mapDomain(r: DomainDbRow): EmailDomain {
  return {
    id: r.id,
    tenantId: r.tenant_id,
    domain: r.domain,
    status: r.status,
    sesRegion: r.ses_region,
    dkimStatus: r.dkim_status,
    mailFromDomain: r.mail_from_domain,
    mailFromStatus: r.mail_from_status,
    dmarcFound: r.dmarc_found,
    dnsProvider: r.dns_provider,
    records: Array.isArray(r.records) ? r.records : [],
    lastCheckedAt: r.last_checked_at,
    verifiedAt: r.verified_at,
    warmupStartedAt: r.warmup_started_at,
    failureReason: r.failure_reason,
    suspendedReason: r.suspended_reason,
    createdAt: r.created_at,
  };
}

export const SENDABLE_STATUSES: EmailDomainStatus[] = ['verified', 'partially_verified'];

export function isSendable(d: Pick<EmailDomain, 'status'>) {
  return SENDABLE_STATUSES.includes(d.status);
}

export async function fetchEmailDomains(tenantId: string): Promise<EmailDomain[]> {
  const { data, error } = await supabase
    .from('email_sending_domains')
    .select('*')
    .eq('tenant_id', tenantId)
    .order('created_at', { ascending: true });
  if (error) throw new Error(error.message);
  return (data as DomainDbRow[]).map(mapDomain);
}

async function domainAction(action: string, body: Record<string, unknown>) {
  const res = await invokeFunction<{ domain?: DomainDbRow; error?: string }>('email-domains', { action, ...body });
  if (!res.ok) throw new Error(res.error ?? `Could not ${action} domain`);
  return res.data?.domain ? mapDomain(res.data.domain) : null;
}

export const addEmailDomain = (tenantId: string, domain: string) =>
  domainAction('add', { tenant_id: tenantId, domain });
export const checkEmailDomain = (tenantId: string, domainId: string) =>
  domainAction('check', { tenant_id: tenantId, domain_id: domainId });
export const retryEmailDomain = (tenantId: string, domainId: string) =>
  domainAction('retry', { tenant_id: tenantId, domain_id: domainId });
export const deleteEmailDomain = (tenantId: string, domainId: string) =>
  domainAction('delete', { tenant_id: tenantId, domain_id: domainId });

// ---- senders (RLS-protected, written directly) ----

export async function fetchEmailSenders(tenantId: string): Promise<EmailSender[]> {
  const { data, error } = await supabase
    .from('email_senders')
    .select('id, domain_id, from_email, from_name, reply_to, is_default')
    .eq('tenant_id', tenantId)
    .order('created_at', { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []).map((r) => ({
    id: r.id,
    domainId: r.domain_id,
    fromEmail: r.from_email,
    fromName: r.from_name,
    replyTo: r.reply_to,
    isDefault: r.is_default,
  }));
}

export async function createEmailSender(input: {
  tenantId: string;
  domainId: string;
  fromEmail: string;
  fromName: string;
  replyTo?: string;
  isDefault?: boolean;
}) {
  if (input.isDefault) await clearDefaultSender(input.tenantId);
  const { error } = await supabase.from('email_senders').insert({
    tenant_id: input.tenantId,
    domain_id: input.domainId,
    from_email: input.fromEmail,
    from_name: input.fromName,
    reply_to: input.replyTo || null,
    is_default: Boolean(input.isDefault),
  });
  if (error) {
    if (error.code === '23505') throw new Error('This sender address already exists.');
    throw new Error(error.message);
  }
}

async function clearDefaultSender(tenantId: string) {
  const { error } = await supabase
    .from('email_senders')
    .update({ is_default: false })
    .eq('tenant_id', tenantId)
    .eq('is_default', true);
  if (error) throw new Error(error.message);
}

export async function setDefaultEmailSender(tenantId: string, senderId: string) {
  await clearDefaultSender(tenantId);
  const { error } = await supabase.from('email_senders').update({ is_default: true }).eq('id', senderId);
  if (error) throw new Error(error.message);
}

export async function deleteEmailSender(senderId: string) {
  const { error } = await supabase.from('email_senders').delete().eq('id', senderId);
  if (error) throw new Error(error.message);
}

// ---- DNS provider guidance ----

export const DNS_PROVIDER_GUIDES: Record<string, { label: string; url?: string; tip: string }> = {
  cloudflare: {
    label: 'Cloudflare',
    url: 'https://developers.cloudflare.com/dns/manage-dns-records/how-to/create-dns-records/',
    tip: 'DNS → Records → Add record. Set every CNAME to "DNS only" (grey cloud). Cloudflare adds the domain automatically, so enter the host without it.',
  },
  route53: {
    label: 'Amazon Route 53',
    url: 'https://docs.aws.amazon.com/Route53/latest/DeveloperGuide/resource-record-sets-creating.html',
    tip: 'Hosted zones → your domain → Create record. Enter only the part before your domain in "Record name". Wrap TXT values in quotes.',
  },
  godaddy: {
    label: 'GoDaddy',
    url: 'https://www.godaddy.com/help/add-a-cname-record-19236',
    tip: 'My Products → DNS → Add New Record. GoDaddy appends the domain, so enter only the part before it as "Name".',
  },
  namecheap: {
    label: 'Namecheap',
    url: 'https://www.namecheap.com/support/knowledgebase/article.aspx/9646/2237/how-to-create-a-cname-record-for-your-domain/',
    tip: 'Domain List → Manage → Advanced DNS → Add new record. Enter only the part before your domain as "Host". MX records go under "Mail settings → Custom MX".',
  },
  google: {
    label: 'Google Cloud DNS / Squarespace Domains',
    tip: 'Add each record in your zone. Enter the full host name ending with a dot if the form asks for a fully-qualified name.',
  },
  azure: { label: 'Azure DNS', tip: 'DNS zone → + Record set. Enter only the part before your domain as "Name".' },
  digitalocean: { label: 'DigitalOcean', tip: 'Networking → Domains → your domain. Enter only the part before your domain as "Hostname".' },
  hostinger: { label: 'Hostinger', tip: 'Domains → DNS / Nameservers → Manage DNS records. Enter only the part before your domain as "Name".' },
  bigrock: { label: 'BigRock / ResellerClub', tip: 'Manage DNS → add each record type on its tab. Enter only the part before your domain.' },
  zoho: { label: 'Zoho', tip: 'Add each record in your DNS manager. Enter only the part before your domain as the host.' },
  wix: { label: 'Wix', tip: 'Domains → Manage DNS records. Enter only the part before your domain as "Host name".' },
  squarespace: { label: 'Squarespace', tip: 'Domains → DNS settings → Add record. Enter only the part before your domain as "Host".' },
  other: { label: 'your DNS provider', tip: 'Add each record below in your DNS provider. Many providers add your domain automatically — if so, enter only the part before it.' },
};

/** Host relative to the zone — what most DNS UIs expect in the "Name/Host" field. */
const TWO_LEVEL_SUFFIXES = new Set([
  'co.in', 'net.in', 'org.in', 'firm.in', 'gen.in', 'ind.in', 'co.uk', 'org.uk', 'ac.uk', 'com.au', 'net.au',
  'co.nz', 'co.jp', 'com.sg', 'com.br', 'co.za', 'com.my', 'com.mx', 'co.id', 'com.ph', 'ae.org', 'co.ae',
]);

export function relativeHost(host: string, domain: string) {
  const parts = domain.split('.');
  const take = TWO_LEVEL_SUFFIXES.has(parts.slice(-2).join('.')) ? 3 : 2;
  const zone = parts.length > take ? parts.slice(-take).join('.') : domain;
  return host.endsWith(`.${zone}`) ? host.slice(0, -(zone.length + 1)) : host;
}

export function recordsAsText(domain: EmailDomain) {
  const lines = domain.records.map(
    (r) => `${r.type.padEnd(6)} ${r.host}\n       ${r.value}\n       (${r.purpose})`,
  );
  return `DNS records for ${domain.domain}\n\n${lines.join('\n\n')}\n`;
}

export function itTeamMailto(domain: EmailDomain) {
  const subject = `Please add DNS records for ${domain.domain} (email sending)`;
  const body =
    `Hi,\n\nTo let us send email from ${domain.domain} through our marketing platform (Marbee), ` +
    `please add these DNS records. They don't affect our existing mailboxes or website.\n\n` +
    recordsAsText(domain) +
    `\nIf a DMARC record already exists for our domain, keep it — no change needed.\n\nThanks!`;
  return `mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}

/** Warm-up cap mirrors public.email_domain_daily_cap (sql/81). null = uncapped. */
export function warmupDailyCap(d: Pick<EmailDomain, 'warmupStartedAt'>, now = Date.now()): number | null {
  if (!d.warmupStartedAt) return 0;
  const days = Math.floor((now - new Date(d.warmupStartedAt).getTime()) / 86_400_000);
  if (days >= 14) return null;
  return Math.min(2000 * 2 ** days, 2_000_000);
}
