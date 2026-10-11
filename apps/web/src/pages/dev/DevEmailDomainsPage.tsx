/**
 * DEV-ONLY harness for Marbee Mail sending domains. Mounted at /dev/email-domains
 * only when import.meta.env.DEV is true (see App.tsx). Renders DomainPanel with
 * mock rows in every status — actions will fail without a deployed edge function.
 */
import { DomainPanel } from '@/pages/settings/EmailDomainsPage';
import type { DnsRecordCheck, EmailDomain } from '@/lib/email-domains';

const REGION = 'ap-south-1';

function records(domain: string, ok: boolean[], hints: Record<number, string> = {}): DnsRecordCheck[] {
  const t = ['k3fq2x7cz5', 'p9m1d4hw8e', 'r6v0s2ny3b'];
  const base: Omit<DnsRecordCheck, 'ok' | 'found'>[] = [
    ...t.map((tok, i) => ({
      key: `dkim_${i + 1}`,
      purpose: `DKIM signature ${i + 1} of 3`,
      type: 'CNAME' as const,
      host: `${tok}._domainkey.${domain}`,
      value: `${tok}.dkim.amazonses.com`,
      required: true,
    })),
    { key: 'mail_from_mx', purpose: 'Bounce handling (custom MAIL FROM)', type: 'MX', host: `bounce.${domain}`, value: `10 feedback-smtp.${REGION}.amazonses.com`, required: true },
    { key: 'mail_from_spf', purpose: 'SPF for the bounce domain', type: 'TXT', host: `bounce.${domain}`, value: 'v=spf1 include:amazonses.com ~all', required: true },
    { key: 'dmarc', purpose: 'DMARC policy (required by Gmail/Yahoo/Outlook for bulk mail)', type: 'TXT', host: `_dmarc.${domain}`, value: 'v=DMARC1; p=none; adkim=r; aspf=r', required: true },
  ];
  return base.map((r, i) => ({ ...r, ok: ok[i] ?? false, found: ok[i] ? [r.value] : [], hint: hints[i] }));
}

const now = Date.now();
const iso = (msAgo: number) => new Date(now - msAgo).toISOString();

function mock(domain: string, status: EmailDomain['status'], ok: boolean[], extra: Partial<EmailDomain> = {}, hints?: Record<number, string>): EmailDomain {
  return {
    id: domain,
    tenantId: 'dev',
    domain,
    status,
    sesRegion: REGION,
    dkimStatus: 'PENDING',
    mailFromDomain: `bounce.${domain}`,
    mailFromStatus: 'PENDING',
    dmarcFound: ok[5] ?? false,
    dnsProvider: 'cloudflare',
    records: records(domain, ok, hints),
    lastCheckedAt: iso(4 * 60_000),
    verifiedAt: null,
    warmupStartedAt: null,
    failureReason: null,
    suspendedReason: null,
    createdAt: iso(3600_000),
    ...extra,
  };
}

const DOMAINS: EmailDomain[] = [
  mock('mail.acme.co.in', 'pending', [true, false, false, false, false, true], { dnsProvider: 'godaddy' }, {
    1: 'Found at p9m1d4hw8e._domainkey.mail.acme.co.in.acme.co.in — your DNS provider adds the domain automatically. Enter only "p9m1d4hw8e._domainkey.mail" as the host.',
    2: 'This name returns an IP address instead of a CNAME. If you use Cloudflare, switch the record to "DNS only" (grey cloud).',
  }),
  mock('news.globex.com', 'partially_verified', [true, true, true, false, false, true], { warmupStartedAt: iso(2 * 86_400_000), verifiedAt: iso(2 * 86_400_000) }),
  mock('mail.initech.io', 'verified', [true, true, true, true, true, true], { warmupStartedAt: iso(20 * 86_400_000), verifiedAt: iso(20 * 86_400_000) }),
  mock('promo.umbrella.com', 'failed', [false, false, false, false, false, false], {
    failureReason: 'DNS records were not found within 72 hours. Fix the records, then press Retry.',
    lastCheckedAt: null,
  }),
];

export function DevEmailDomainsPage() {
  return (
    <div className="mx-auto max-w-5xl space-y-4 bg-slate-50 p-6">
      <h1 className="text-xl font-semibold text-slate-900">Sending domains — dev harness</h1>
      {DOMAINS.map((d) => (
        <DomainPanel key={d.id} domain={d} tenantId="dev" />
      ))}
    </div>
  );
}
