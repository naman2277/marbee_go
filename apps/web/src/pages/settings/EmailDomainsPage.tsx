import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Clock,
  Copy,
  ExternalLink,
  Globe,
  Loader2,
  Mail,
  Plus,
  RefreshCw,
  ShieldCheck,
  Star,
  Trash2,
  XCircle,
} from 'lucide-react';
import { PageHeader, Card, Button, Badge, EmptyState } from '@/components/ui';
import { RequirePermission } from '@/components/auth/RequirePermission';
import { useTenantScope } from '@/contexts/AuthContext';
import { PERMISSIONS } from '@/lib/permissions';
import {
  addEmailDomain,
  checkEmailDomain,
  createEmailSender,
  deleteEmailDomain,
  deleteEmailSender,
  DNS_PROVIDER_GUIDES,
  fetchEmailDomains,
  fetchEmailSenders,
  isSendable,
  itTeamMailto,
  recordsAsText,
  relativeHost,
  retryEmailDomain,
  setDefaultEmailSender,
  warmupDailyCap,
  type DnsRecordCheck,
  type EmailDomain,
  type EmailDomainStatus,
} from '@/lib/email-domains';

const STATUS_META: Record<EmailDomainStatus, { label: string; variant: 'default' | 'success' | 'warning' | 'error'; help: string }> = {
  pending: { label: 'Waiting for DNS', variant: 'default', help: 'Add the records below. We re-check every 10 minutes for 72 hours.' },
  partially_verified: {
    label: 'Ready · needs attention',
    variant: 'warning',
    help: 'DKIM is verified, so you can send. Add the remaining records for the best inbox placement.',
  },
  verified: { label: 'Verified', variant: 'success', help: 'All records verified. This domain is ready to send.' },
  failed: { label: 'Failed', variant: 'error', help: 'Records were not found in time. Fix the records, then press Retry.' },
  degraded: { label: 'Records missing', variant: 'error', help: 'Records that were verified are no longer found. Sending is paused.' },
  suspended: { label: 'Suspended', variant: 'error', help: 'Sending from this domain was paused by Marbee. Contact support.' },
};

function useCopy() {
  const [copied, setCopied] = useState<string | null>(null);
  const copy = (key: string, text: string) => {
    void navigator.clipboard.writeText(text).then(() => {
      setCopied(key);
      setTimeout(() => setCopied((c) => (c === key ? null : c)), 1500);
    });
  };
  return { copied, copy };
}

function CopyField({ id, text, display, copied, onCopy }: {
  id: string;
  text: string;
  display?: string;
  copied: string | null;
  onCopy: (key: string, text: string) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onCopy(id, text)}
      title="Copy"
      className="group flex w-full min-w-0 items-center gap-2 rounded-md border border-slate-200 bg-slate-50 px-2 py-1.5 text-left font-mono text-xs text-slate-800 hover:border-brand-300 hover:bg-white"
    >
      <span className="min-w-0 flex-1 break-all">{display ?? text}</span>
      {copied === id ? (
        <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-emerald-600" />
      ) : (
        <Copy className="h-3.5 w-3.5 shrink-0 text-slate-400 group-hover:text-brand-600" />
      )}
    </button>
  );
}

function RecordRow({ record, domain, checked, copied, onCopy }: {
  record: DnsRecordCheck;
  domain: string;
  checked: boolean;
  copied: string | null;
  onCopy: (key: string, text: string) => void;
}) {
  const host = relativeHost(record.host, domain);
  return (
    <div className="grid gap-3 border-t border-slate-100 px-4 py-3 md:grid-cols-[110px_64px_minmax(0,1fr)_minmax(0,1.3fr)]">
      <div className="flex items-start gap-2 text-sm">
        {!checked ? (
          <Clock className="mt-0.5 h-4 w-4 shrink-0 text-slate-300" />
        ) : record.ok ? (
          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
        ) : (
          <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-500" />
        )}
        <span className={checked ? (record.ok ? 'text-emerald-700' : 'text-red-600') : 'text-slate-500'}>
          {!checked ? 'Not checked' : record.ok ? 'Found' : 'Missing'}
        </span>
      </div>
      <div>
        <span className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-xs font-semibold text-slate-700">{record.type}</span>
      </div>
      <div className="min-w-0 space-y-1">
        <div className="text-[11px] font-medium uppercase tracking-wide text-slate-400 md:hidden">Host / Name</div>
        <CopyField id={`${record.key}-host`} text={host} copied={copied} onCopy={onCopy} />
        {host !== record.host && <p className="break-all text-[11px] text-slate-400">Full name: {record.host}</p>}
      </div>
      <div className="min-w-0 space-y-1">
        <div className="text-[11px] font-medium uppercase tracking-wide text-slate-400 md:hidden">Value</div>
        <CopyField
          id={`${record.key}-value`}
          text={record.type === 'MX' ? record.value.split(' ')[1] : record.value}
          display={record.value}
          copied={copied}
          onCopy={onCopy}
        />
        <p className="text-[11px] text-slate-500">
          {record.purpose}
          {record.type === 'MX' && ' · priority 10'}
        </p>
        {record.hint && (
          <p className="flex items-start gap-1 text-xs text-amber-700">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            {record.hint}
          </p>
        )}
      </div>
    </div>
  );
}

export function DomainPanel({ domain, tenantId }: { domain: EmailDomain; tenantId: string }) {
  const queryClient = useQueryClient();
  const { copied, copy } = useCopy();
  const [open, setOpen] = useState(!isSendable(domain) || domain.status !== 'verified');
  const meta = STATUS_META[domain.status];
  const guide = DNS_PROVIDER_GUIDES[domain.dnsProvider ?? 'other'] ?? DNS_PROVIDER_GUIDES.other;
  const checked = Boolean(domain.lastCheckedAt);
  const okCount = domain.records.filter((r) => r.ok).length;
  const cap = warmupDailyCap(domain);

  const invalidate = () => void queryClient.invalidateQueries({ queryKey: ['email-domains', tenantId] });
  const checkMutation = useMutation({ mutationFn: () => checkEmailDomain(tenantId, domain.id), onSuccess: invalidate });
  const retryMutation = useMutation({ mutationFn: () => retryEmailDomain(tenantId, domain.id), onSuccess: invalidate });
  const deleteMutation = useMutation({
    mutationFn: () => deleteEmailDomain(tenantId, domain.id),
    onSuccess: () => {
      invalidate();
      void queryClient.invalidateQueries({ queryKey: ['email-senders', tenantId] });
    },
  });
  const actionError = (checkMutation.error ?? retryMutation.error ?? deleteMutation.error) as Error | null;

  return (
    <Card className="overflow-hidden">
      <div className="flex flex-wrap items-center gap-3 px-5 py-4">
        <button type="button" onClick={() => setOpen((o) => !o)} className="flex min-w-0 flex-1 items-center gap-3 text-left">
          {open ? <ChevronDown className="h-4 w-4 shrink-0 text-slate-400" /> : <ChevronRight className="h-4 w-4 shrink-0 text-slate-400" />}
          <Globe className="h-5 w-5 shrink-0 text-brand-600" />
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="truncate font-semibold text-slate-900">{domain.domain}</span>
              <Badge variant={meta.variant}>{meta.label}</Badge>
            </div>
            <p className="mt-0.5 text-xs text-slate-500">
              {checked
                ? `${okCount} of ${domain.records.length} records found · checked ${new Date(domain.lastCheckedAt!).toLocaleString()}`
                : `Added ${new Date(domain.createdAt).toLocaleString()} · not checked yet`}
            </p>
          </div>
        </button>
        <div className="flex flex-wrap gap-2">
          {domain.status === 'failed' ? (
            <Button size="sm" variant="secondary" onClick={() => retryMutation.mutate()} disabled={retryMutation.isPending}>
              {retryMutation.isPending ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="mr-1 h-3.5 w-3.5" />}
              Retry
            </Button>
          ) : (
            domain.status !== 'suspended' && (
              <Button size="sm" variant="secondary" onClick={() => checkMutation.mutate()} disabled={checkMutation.isPending}>
                {checkMutation.isPending ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="mr-1 h-3.5 w-3.5" />}
                Check now
              </Button>
            )
          )}
          <Button
            size="sm"
            variant="ghost"
            className="text-red-600 hover:bg-red-50"
            disabled={deleteMutation.isPending}
            onClick={() => {
              if (window.confirm(`Remove ${domain.domain}? Sender addresses on this domain will stop working.`)) deleteMutation.mutate();
            }}
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {actionError && (
        <div className="mx-5 mb-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{actionError.message}</div>
      )}

      {open && (
        <div className="border-t border-slate-100">
          <div
            className={`flex items-start gap-2 px-5 py-3 text-sm ${
              meta.variant === 'success'
                ? 'bg-emerald-50 text-emerald-800'
                : meta.variant === 'error'
                  ? 'bg-red-50 text-red-800'
                  : meta.variant === 'warning'
                    ? 'bg-amber-50 text-amber-800'
                    : 'bg-slate-50 text-slate-700'
            }`}
          >
            <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" />
            <div>
              <p>{domain.failureReason ?? domain.suspendedReason ?? meta.help}</p>
              {isSendable(domain) && (
                <p className="mt-1 text-xs opacity-80">
                  {cap === null
                    ? 'Warm-up complete — no daily sending cap.'
                    : `New-domain warm-up: up to ${cap.toLocaleString()} emails today. The cap doubles daily and is removed after 14 days.`}
                </p>
              )}
            </div>
          </div>

          {domain.status !== 'verified' && (
            <div className="flex flex-wrap items-start justify-between gap-3 px-5 py-4">
              <div className="max-w-2xl text-sm text-slate-600">
                <p className="font-medium text-slate-800">
                  Add these records at {guide.label}
                  {guide.url && (
                    <a href={guide.url} target="_blank" rel="noreferrer" className="ml-2 inline-flex items-center gap-1 text-xs font-medium text-brand-600 hover:text-brand-700">
                      How-to <ExternalLink className="h-3 w-3" />
                    </a>
                  )}
                </p>
                <p className="mt-1">{guide.tip}</p>
                <p className="mt-1 text-xs text-slate-500">
                  These records don't change your existing mailboxes or website. DNS changes usually appear within minutes but can take up to 48 hours.
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button size="sm" variant="secondary" onClick={() => copy('all', recordsAsText(domain))}>
                  {copied === 'all' ? <CheckCircle2 className="mr-1 h-3.5 w-3.5 text-emerald-600" /> : <Copy className="mr-1 h-3.5 w-3.5" />}
                  Copy all
                </Button>
                <a
                  href={itTeamMailto(domain)}
                  className="inline-flex items-center rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
                >
                  <Mail className="mr-1 h-3.5 w-3.5" />
                  Send to IT team
                </a>
              </div>
            </div>
          )}

          <div className="hidden grid-cols-[110px_64px_minmax(0,1fr)_minmax(0,1.3fr)] gap-3 bg-slate-50 px-4 py-2 text-[11px] font-semibold uppercase tracking-wide text-slate-500 md:grid">
            <span>Status</span>
            <span>Type</span>
            <span>Host / Name</span>
            <span>Value</span>
          </div>
          {domain.records.map((r) => (
            <RecordRow key={r.key} record={r} domain={domain.domain} checked={checked} copied={copied} onCopy={copy} />
          ))}
        </div>
      )}
    </Card>
  );
}

function AddDomainForm({ tenantId, onDone }: { tenantId: string; onDone: () => void }) {
  const queryClient = useQueryClient();
  const [value, setValue] = useState('');
  const mutation = useMutation({
    mutationFn: () => addEmailDomain(tenantId, value),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['email-domains', tenantId] });
      setValue('');
      onDone();
    },
  });
  const bare = value.trim().toLowerCase().split('.').length === 2;

  return (
    <Card className="p-5">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (value.trim()) mutation.mutate();
        }}
      >
        <label className="block text-sm font-medium text-slate-800">Domain you'll send from</label>
        <p className="mt-0.5 text-xs text-slate-500">
          We recommend a subdomain such as <span className="font-mono">mail.yourcompany.com</span> or{' '}
          <span className="font-mono">news.yourcompany.com</span>, so marketing email reputation stays separate from your team's everyday email.
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          <input
            autoFocus
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder="mail.yourcompany.com"
            className="min-w-[240px] flex-1 rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-brand-400 focus:outline-none"
            disabled={mutation.isPending}
          />
          <Button type="submit" disabled={!value.trim() || mutation.isPending}>
            {mutation.isPending ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Plus className="mr-1 h-4 w-4" />}
            Add domain
          </Button>
          <Button variant="ghost" onClick={onDone} disabled={mutation.isPending}>
            Cancel
          </Button>
        </div>
        {bare && !mutation.error && (
          <p className="mt-2 text-xs text-amber-700">
            Tip: using the root domain works, but a subdomain like mail.{value.trim().toLowerCase()} is safer.
          </p>
        )}
        {mutation.error && <p className="mt-2 text-sm text-red-600">{(mutation.error as Error).message}</p>}
      </form>
    </Card>
  );
}

function SendersCard({ tenantId, domains }: { tenantId: string; domains: EmailDomain[] }) {
  const queryClient = useQueryClient();
  const sendable = domains.filter(isSendable);
  const [local, setLocal] = useState('');
  const [domainId, setDomainId] = useState('');
  const [fromName, setFromName] = useState('');
  const [replyTo, setReplyTo] = useState('');

  const sendersQuery = useQuery({
    queryKey: ['email-senders', tenantId],
    queryFn: () => fetchEmailSenders(tenantId),
    enabled: Boolean(tenantId),
  });
  const senders = sendersQuery.data ?? [];
  const selectedDomain = sendable.find((d) => d.id === domainId) ?? sendable[0];
  const invalidate = () => void queryClient.invalidateQueries({ queryKey: ['email-senders', tenantId] });

  const createMutation = useMutation({
    mutationFn: () =>
      createEmailSender({
        tenantId,
        domainId: selectedDomain!.id,
        fromEmail: `${local.trim()}@${selectedDomain!.domain}`,
        fromName: fromName.trim(),
        replyTo: replyTo.trim(),
        isDefault: senders.length === 0,
      }),
    onSuccess: () => {
      invalidate();
      setLocal('');
      setFromName('');
      setReplyTo('');
    },
  });
  const defaultMutation = useMutation({ mutationFn: (id: string) => setDefaultEmailSender(tenantId, id), onSuccess: invalidate });
  const deleteMutation = useMutation({ mutationFn: deleteEmailSender, onSuccess: invalidate });
  const domainName = (id: string) => domains.find((d) => d.id === id);

  return (
    <Card>
      <div className="border-b border-slate-100 px-5 py-4">
        <h2 className="text-base font-semibold text-slate-900">Sender addresses</h2>
        <p className="mt-0.5 text-sm text-slate-500">The "From" addresses your team can pick in campaigns and journeys.</p>
      </div>

      {sendable.length === 0 ? (
        <p className="px-5 py-6 text-sm text-slate-500">Verify a domain first — then you can add addresses like offers@yourdomain.com.</p>
      ) : (
        <form
          className="grid gap-3 border-b border-slate-100 px-5 py-4 md:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_minmax(0,1fr)_auto]"
          onSubmit={(e) => {
            e.preventDefault();
            if (local.trim() && selectedDomain) createMutation.mutate();
          }}
        >
          <div>
            <label className="block text-xs font-medium text-slate-600">From address</label>
            <div className="mt-1 flex min-w-0 items-center rounded-lg border border-slate-200 focus-within:border-brand-400">
              <input
                value={local}
                onChange={(e) => setLocal(e.target.value.replace(/@.*/, ''))}
                placeholder="offers"
                className="min-w-0 flex-1 rounded-l-lg px-3 py-2 text-sm focus:outline-none"
              />
              <span className="text-sm text-slate-400">@</span>
              {sendable.length > 1 ? (
                <select
                  value={selectedDomain?.id}
                  onChange={(e) => setDomainId(e.target.value)}
                  className="max-w-[55%] rounded-r-lg bg-transparent px-2 py-2 text-sm text-slate-700 focus:outline-none"
                >
                  {sendable.map((d) => (
                    <option key={d.id} value={d.id}>{d.domain}</option>
                  ))}
                </select>
              ) : (
                <span className="truncate px-2 text-sm text-slate-700">{selectedDomain?.domain}</span>
              )}
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600">Display name</label>
            <input
              value={fromName}
              onChange={(e) => setFromName(e.target.value)}
              placeholder="Acme Offers"
              className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-brand-400 focus:outline-none"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600">Reply-to (optional)</label>
            <input
              value={replyTo}
              onChange={(e) => setReplyTo(e.target.value)}
              placeholder="support@acme.com"
              className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-brand-400 focus:outline-none"
            />
          </div>
          <div className="flex items-end">
            <Button type="submit" disabled={!local.trim() || createMutation.isPending} className="w-full md:w-auto">
              <Plus className="mr-1 h-4 w-4" /> Add
            </Button>
          </div>
          {createMutation.error && <p className="text-sm text-red-600 md:col-span-4">{(createMutation.error as Error).message}</p>}
        </form>
      )}

      {senders.length > 0 && (
        <ul>
          {senders.map((s) => {
            const d = domainName(s.domainId);
            const paused = d && !isSendable(d);
            return (
              <li key={s.id} className="flex flex-wrap items-center gap-3 border-b border-slate-100 px-5 py-3 last:border-0">
                <Mail className="h-4 w-4 shrink-0 text-slate-400" />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2 text-sm">
                    <span className="font-medium text-slate-900">{s.fromName || s.fromEmail}</span>
                    {s.fromName && <span className="text-slate-500">&lt;{s.fromEmail}&gt;</span>}
                    {s.isDefault && <Badge variant="success">Default</Badge>}
                    {paused && <Badge variant="error">Domain not verified</Badge>}
                  </div>
                  {s.replyTo && <p className="text-xs text-slate-500">Reply-to: {s.replyTo}</p>}
                </div>
                {!s.isDefault && (
                  <Button size="sm" variant="ghost" onClick={() => defaultMutation.mutate(s.id)} disabled={defaultMutation.isPending}>
                    <Star className="mr-1 h-3.5 w-3.5" /> Make default
                  </Button>
                )}
                <Button
                  size="sm"
                  variant="ghost"
                  className="text-red-600 hover:bg-red-50"
                  onClick={() => {
                    if (window.confirm(`Remove ${s.fromEmail}?`)) deleteMutation.mutate(s.id);
                  }}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}

export function EmailDomainsPage() {
  const { tenantId } = useTenantScope();
  const [adding, setAdding] = useState(false);

  const domainsQuery = useQuery({
    queryKey: ['email-domains', tenantId],
    queryFn: () => fetchEmailDomains(tenantId),
    enabled: Boolean(tenantId),
    // Background cron updates rows; poll while anything is still pending.
    refetchInterval: (q) =>
      (q.state.data ?? []).some((d) => d.status === 'pending' || d.status === 'partially_verified') ? 30_000 : false,
  });
  const domains = useMemo(() => domainsQuery.data ?? [], [domainsQuery.data]);

  return (
    <RequirePermission permission={PERMISSIONS.SETTINGS_CHANNELS_MANAGE}>
      <div className="space-y-6">
        <Link to="/settings/channels?tab=email" className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-800">
          <ArrowLeft className="h-4 w-4" /> Channels
        </Link>
        <PageHeader
          title="Sending domains"
          description="Verify your company's domain once, then send campaigns and journeys through Marbee Mail from any address on it."
          action={
            !adding && (
              <Button onClick={() => setAdding(true)}>
                <Plus className="mr-1 h-4 w-4" /> Add domain
              </Button>
            )
          }
        />

        {adding && <AddDomainForm tenantId={tenantId} onDone={() => setAdding(false)} />}

        {domainsQuery.isLoading ? (
          <div className="flex items-center gap-2 py-10 text-sm text-slate-500">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading domains…
          </div>
        ) : domainsQuery.error ? (
          <Card className="p-5 text-sm text-red-600">{(domainsQuery.error as Error).message}</Card>
        ) : domains.length === 0 && !adding ? (
          <Card>
            <EmptyState
              title="No sending domain yet"
              description="Add the domain you want your emails to come from. You'll get a few DNS records to add — it takes about 5 minutes."
              action={
                <Button onClick={() => setAdding(true)}>
                  <Plus className="mr-1 h-4 w-4" /> Add domain
                </Button>
              }
            />
          </Card>
        ) : (
          <div className="space-y-4">
            {domains.map((d) => (
              <DomainPanel key={d.id} domain={d} tenantId={tenantId} />
            ))}
          </div>
        )}

        <SendersCard tenantId={tenantId} domains={domains} />
      </div>
    </RequirePermission>
  );
}
