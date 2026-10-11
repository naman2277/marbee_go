import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  ArrowLeft,
  Bell,
  Check,
  CheckCircle2,
  ChevronRight,
  ExternalLink,
  History,
  Loader2,
  MessageSquare,
  Monitor,
  PlugZap,
  Rocket,
  Send,
  Settings2,
  Smartphone,
  Sparkles,
  TriangleAlert,
  X,
} from 'lucide-react';
import {
  TEMPLATE_STATUS_FLOW,
  normalizeTemplateStatus,
  type ContentChannel,
  type ContentTemplateSettings,
  type MarbeeContentTemplate,
  type RcsContent,
  type SmsContent,
  type TemplateContent,
  type TemplateStatus,
  type WebPushContent,
  type WhatsAppContent,
} from '@/lib/content-templates';
import { fetchChannelProviders } from '@/lib/channel-providers';
import {
  APPROVAL_STATUS_OPTIONS,
  getProviderApprovalForChannel,
  mergeProviderApproval,
  providerApprovalTabLabel,
  type ProviderApprovalStatus,
  type RcsProviderApproval,
  type SmsDltApproval,
  type WhatsAppMetaApproval,
} from '@/lib/template-provider-approval';
import { useTenantScope } from '@/contexts/AuthContext';
import { normalizeWhatsAppContent } from '@/lib/whatsapp-template-types';
import { normalizeRcsContent } from '@/lib/rcs-template-types';
import { extractVariables, nowLabel, smsSegmentInfo, statusIndex } from './channel-studio-utils';
import { Field, StudioSection, TextInput, useToast } from './studio-ui';
import { WhatsAppComposer } from './WhatsAppComposer';
import { WhatsAppPreview } from './WhatsAppPreview';
import { RcsComposer } from './RcsComposer';
import { RcsPreview } from './RcsPreview';
import { SmsComposer } from './SmsComposer';
import { SmsPreview } from './SmsPreview';
import { WebPushComposer } from './WebPushComposer';
import { WebPushPreview } from './WebPushPreview';

type Props = {
  template: MarbeeContentTemplate;
  content: TemplateContent;
  settings: ContentTemplateSettings;
  onChangeContent: (content: TemplateContent) => void;
  onChangeSettings: (settings: ContentTemplateSettings) => void;
  onSave: (status?: string) => void;
  onBack: () => void;
  isSaving?: boolean;
  personalizationSample?: Record<string, unknown>;
};

const CHANNEL_META: Record<
  Exclude<ContentChannel, 'email'>,
  { label: string; studio: string; accent: string; icon: typeof Bell; recipientLabel: string; recipientPlaceholder: string }
> = {
  whatsapp: { label: 'WhatsApp', studio: 'WhatsApp Studio', accent: '#25d366', icon: MessageSquare, recipientLabel: 'Test phone numbers', recipientPlaceholder: '+15551234567' },
  rcs: { label: 'RCS', studio: 'RCS Studio', accent: '#1a73e8', icon: Smartphone, recipientLabel: 'Test phone numbers', recipientPlaceholder: '+15551234567' },
  sms: { label: 'SMS', studio: 'SMS Studio', accent: '#2563eb', icon: Smartphone, recipientLabel: 'Test phone numbers', recipientPlaceholder: '+15551234567' },
  web_push: { label: 'Web Push', studio: 'Web Push Studio', accent: '#f59e0b', icon: Bell, recipientLabel: 'Test subscriber IDs', recipientPlaceholder: 'sub_xxx or you@company.com' },
};

type Tab = 'content' | 'settings' | 'test';

export function ChannelStudio({
  template,
  content,
  settings,
  onChangeContent,
  onChangeSettings,
  onSave,
  onBack,
  isSaving,
  personalizationSample,
}: Props) {
  const channel = template.channel as Exclude<ContentChannel, 'email'>;
  const meta = CHANNEL_META[channel] ?? CHANNEL_META.sms;
  const ChannelIcon = meta.icon;
  const { tenantId, environment } = useTenantScope();

  const [tab, setTab] = useState<Tab>('content');
  const [status, setStatus] = useState<TemplateStatus>(normalizeTemplateStatus(template.status));
  const [pushSurface, setPushSurface] = useState<'desktop' | 'android'>('desktop');
  const { msg: toast, show: showToast } = useToast();

  // BYOP sending accounts for this channel (also used to send proofs)
  const { data: providers = [] } = useQuery({
    queryKey: ['channel-providers', tenantId, environment, channel],
    queryFn: () => fetchChannelProviders(tenantId, environment, channel as any),
    staleTime: 60_000,
  });
  const activeProviders = providers.filter((p) => p.status === 'active');
  const selectedProvider =
    activeProviders.find((p) => p.id === settings.provider_account_id) ??
    activeProviders.find((p) => p.isDefault) ??
    activeProviders[0];

  const commitStatus = (next: TemplateStatus) => {
    setStatus(next);
    onSave(next);
    showToast(`Status set to “${TEMPLATE_STATUS_FLOW.find((s) => s.id === next)?.label ?? next}”`);
  };

  // send-test state
  const [recipients, setRecipients] = useState('');
  const [recipientDraft, setRecipientDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [history, setHistory] = useState<Array<{ id: string; at: string; to: string[] }>>([]);

  const recipientList = recipients.split(/[,\s]+/).map((s) => s.trim()).filter(Boolean);
  const addRecipient = (raw: string) => {
    const v = raw.trim().replace(/[,;]+$/, '');
    if (!v) return;
    if (!recipientList.includes(v)) setRecipients([...recipientList, v].join(', '));
    setRecipientDraft('');
  };

  const patchSettings = (p: Partial<ContentTemplateSettings>) => onChangeSettings({ ...settings, ...p });

  // Provider registration / template IDs (DLT for SMS, Meta for WhatsApp, SP for RCS)
  const needsApproval = channel === 'sms' || channel === 'whatsapp' || channel === 'rcs';
  const approval = getProviderApprovalForChannel(settings.provider_approval, channel) as
    | (SmsDltApproval & WhatsAppMetaApproval & RcsProviderApproval)
    | undefined;
  const patchApproval = (p: Record<string, unknown>) => {
    const merged = { status: 'not_registered' as ProviderApprovalStatus, ...(approval ?? {}), ...p };
    patchSettings({ provider_approval: mergeProviderApproval(settings.provider_approval, channel, merged as any) });
  };
  const APPROVAL_FIELDS: Record<'sms' | 'whatsapp' | 'rcs', Array<{ key: string; label: string; placeholder: string; mono?: boolean }>> = {
    sms: [
      { key: 'dlt_template_id', label: 'DLT template ID', placeholder: '1234567890123456789', mono: true },
      { key: 'dlt_entity_id', label: 'DLT entity ID', placeholder: 'Registered entity id', mono: true },
      { key: 'principal_entity_id', label: 'Principal entity ID (PE ID)', placeholder: 'PE id from operator portal', mono: true },
      { key: 'sender_id', label: 'Registered sender / header', placeholder: 'MRBEEE', mono: true },
      { key: 'template_name', label: 'DLT template name', placeholder: 'As registered on the portal' },
      { key: 'operator', label: 'Operator / aggregator', placeholder: 'Jio, Airtel, Vi, aggregator…' },
    ],
    whatsapp: [
      { key: 'meta_template_id', label: 'Meta template ID', placeholder: 'From WhatsApp Manager', mono: true },
      { key: 'template_name', label: 'Meta template name', placeholder: 'order_update_v2' },
      { key: 'waba_id', label: 'WABA ID', placeholder: 'WhatsApp Business Account id', mono: true },
      { key: 'namespace', label: 'Namespace', placeholder: 'message template namespace', mono: true },
    ],
    rcs: [
      { key: 'template_id', label: 'Provider template ID', placeholder: 'From RBM / carrier console', mono: true },
      { key: 'agent_id', label: 'Agent ID', placeholder: 'RCS agent id', mono: true },
      { key: 'route_id', label: 'Route ID', placeholder: 'Delivery route id', mono: true },
      { key: 'provider_name', label: 'Provider', placeholder: 'Google RBM, Jio, …' },
    ],
  };

  /* ---- preflight checks (per channel, computed from real content) ---- */
  const checks = useMemo(() => {
    const out: Array<{ ok: boolean; label: string }> = [];
    if (channel === 'whatsapp') {
      const c = normalizeWhatsAppContent(content as WhatsAppContent);
      out.push({ ok: c.body.trim().length > 0, label: 'Body text present' });
      out.push({ ok: c.body.length <= 1024, label: 'Body within 1024 characters' });
      out.push({ ok: (c.footer ?? '').length <= 60, label: 'Footer within 60 characters' });
      out.push({ ok: !!c.category, label: 'Category selected for Meta review' });
      if (c.template_format === 'carousel')
        out.push({ ok: (c.carousel_cards?.length ?? 0) >= 2, label: 'At least 2 carousel cards' });
    } else if (channel === 'rcs') {
      const c = normalizeRcsContent(content as RcsContent);
      out.push({ ok: (c.title || c.description).trim().length > 0, label: 'Card has title or text' });
      out.push({ ok: (c.suggestions?.length ?? 0) <= 4, label: 'Max 4 suggestions per card' });
      out.push({ ok: !!c.fallback?.text?.trim(), label: 'SMS fallback text set' });
    } else if (channel === 'sms') {
      const c = content as SmsContent;
      const seg = smsSegmentInfo(c.message || '');
      out.push({ ok: (c.message || '').trim().length > 0, label: 'Message not empty' });
      out.push({ ok: seg.segments <= 1, label: `Single segment (${seg.segments} now)` });
      out.push({ ok: /\bstop\b/i.test(c.message || ''), label: 'Opt-out language present' });
    } else {
      const c = content as WebPushContent;
      out.push({ ok: (c.title || '').trim().length > 0, label: 'Title present' });
      out.push({ ok: (c.body || '').trim().length > 0, label: 'Body present' });
      out.push({ ok: !!c.action_url?.trim(), label: 'Landing URL set' });
      out.push({ ok: !!c.icon_url?.trim(), label: 'Icon image set' });
    }
    return out;
  }, [channel, content]);

  const failing = checks.filter((c) => !c.ok).length;

  const variables = useMemo(() => {
    if (channel === 'whatsapp') {
      const c = content as WhatsAppContent;
      return extractVariables(c.body, c.header?.text, c.footer, ...(c.carousel_cards ?? []).map((x) => x.body));
    }
    if (channel === 'rcs') {
      const c = content as RcsContent;
      return extractVariables(c.title, c.description, ...(c.carousel_cards ?? []).flatMap((x) => [x.title, x.description]));
    }
    if (channel === 'sms') return extractVariables((content as SmsContent).message);
    const c = content as WebPushContent;
    return extractVariables(c.title, c.body);
  }, [channel, content]);

  const runSend = () => {
    if (!recipientList.length || !selectedProvider) return;
    setSending(true);
    setTimeout(() => {
      setSending(false);
      setHistory((h) => [{ id: `${Date.now()}`, at: nowLabel(), to: [...recipientList] }, ...h].slice(0, 8));
      if (status === 'draft') commitStatus('in_review');
      showToast(`Test sent via ${selectedProvider.name || selectedProvider.providerType} to ${recipientList.length} recipient${recipientList.length === 1 ? '' : 's'}`);
    }, 900);
  };

  const composer =
    channel === 'whatsapp' ? (
      <WhatsAppComposer content={content as WhatsAppContent} onChange={(n) => onChangeContent(n)} />
    ) : channel === 'rcs' ? (
      <RcsComposer content={content as RcsContent} onChange={(n) => onChangeContent(n)} />
    ) : channel === 'sms' ? (
      <SmsComposer content={content as SmsContent} onChange={(n) => onChangeContent(n)} />
    ) : (
      <WebPushComposer content={content as WebPushContent} onChange={(n) => onChangeContent(n)} />
    );

  const preview =
    channel === 'whatsapp' ? (
      <WhatsAppPreview content={content as WhatsAppContent} sample={personalizationSample} businessName={settings.from_name || 'Marbee Business'} />
    ) : channel === 'rcs' ? (
      <RcsPreview content={content as RcsContent} sample={personalizationSample} agentName={settings.from_name || 'Marbee'} />
    ) : channel === 'sms' ? (
      <SmsPreview content={content as SmsContent} sample={personalizationSample} senderId={settings.sender_id || 'MARBEE'} />
    ) : (
      <WebPushPreview
        content={content as WebPushContent}
        sample={personalizationSample}
        surface={pushSurface}
        siteName={(() => {
          try {
            return new URL((content as WebPushContent).action_url || '').host || 'yoursite.com';
          } catch {
            return 'yoursite.com';
          }
        })()}
      />
    );

  return (
    <div className="flex h-full w-full flex-col overflow-hidden bg-slate-50">
      {/* ---------- top bar ---------- */}
      <header className="flex h-14 shrink-0 items-center justify-between border-b border-slate-200 bg-white px-4 shadow-2xs">
        <div className="flex min-w-0 items-center gap-3">
          <button
            type="button"
            onClick={onBack}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-500 transition hover:bg-slate-100"
          >
            <ArrowLeft className="h-4 w-4" />
          </button>
          <span className="flex h-7 w-7 items-center justify-center rounded-lg text-white" style={{ background: meta.accent }}>
            <ChannelIcon className="h-4 w-4" />
          </span>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-sm font-bold text-slate-900">{meta.studio}</span>
              <span className="truncate text-xs font-medium text-slate-400">· {template.name}</span>
            </div>
            <div className="text-[10px] font-medium text-slate-400">/{template.slug}</div>
          </div>
        </div>

        {/* status pipeline */}
        <div className="hidden items-center gap-1 lg:flex">
          {TEMPLATE_STATUS_FLOW.map((s, i) => {
            const reached = i <= statusIndex(status);
            return (
              <div key={s.id} className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => commitStatus(s.id)}
                  title={s.hint}
                  className={`flex items-center gap-1 rounded-full px-2 py-1 text-[10px] font-bold transition ${
                    reached ? 'bg-violet-600 text-white' : 'bg-slate-100 text-slate-400 hover:bg-slate-200'
                  }`}
                >
                  {reached ? <Check className="h-3 w-3" /> : <span className="h-1.5 w-1.5 rounded-full bg-current" />}
                  {s.label}
                </button>
                {i < TEMPLATE_STATUS_FLOW.length - 1 && <ChevronRight className="h-3 w-3 text-slate-300" />}
              </div>
            );
          })}
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setTab('test')}
            className="flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-bold text-slate-700 transition hover:border-violet-300 hover:text-violet-700"
          >
            <Send className="h-3.5 w-3.5" /> Test
          </button>
          <button
            type="button"
            disabled={isSaving}
            onClick={() => commitStatus('published')}
            className="flex items-center gap-1.5 rounded-xl bg-gradient-to-r from-violet-600 to-indigo-600 px-4 py-1.5 text-xs font-bold text-white shadow-md shadow-violet-500/25 transition hover:from-violet-700 hover:to-indigo-700 disabled:opacity-50"
          >
            {isSaving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Rocket className="h-3.5 w-3.5" />}
            {isSaving ? 'Saving…' : 'Save & publish'}
          </button>
        </div>
      </header>

      {/* ---------- tabs ---------- */}
      <div className="flex shrink-0 items-center gap-1 border-b border-slate-200 bg-white px-4">
        {([
          { id: 'content', label: 'Content', icon: Sparkles },
          { id: 'settings', label: 'Settings', icon: Settings2 },
          { id: 'test', label: 'Test & publish', icon: Send },
        ] as const).map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            type="button"
            onClick={() => setTab(id)}
            className={`-mb-px flex items-center gap-1.5 border-b-2 px-3 py-2.5 text-xs font-bold transition ${
              tab === id ? 'border-violet-600 text-violet-700' : 'border-transparent text-slate-400 hover:text-slate-700'
            }`}
          >
            <Icon className="h-3.5 w-3.5" />
            {label}
          </button>
        ))}
      </div>

      {/* ---------- body: composer + preview ---------- */}
      <div className="flex min-h-0 flex-1 flex-col-reverse lg:flex-row">
        <div className="min-w-0 flex-1 overflow-y-auto p-5 [scrollbar-width:thin]">
          <div className="mx-auto max-w-2xl">
            {tab === 'content' && composer}

            {tab === 'settings' && (
              <div className="space-y-4">
                <StudioSection title="Sender identity" description="How this message appears in the recipient's app.">
                  <Field label={channel === 'sms' ? 'Sender ID' : 'From / business name'}>
                    <TextInput
                      value={channel === 'sms' ? settings.sender_id ?? '' : settings.from_name ?? ''}
                      onChange={(e) =>
                        channel === 'sms'
                          ? patchSettings({ sender_id: e.target.value })
                          : patchSettings({ from_name: e.target.value })
                      }
                      placeholder={channel === 'sms' ? 'MARBEE (≤11 chars alphanumeric)' : 'Marbee Business'}
                    />
                  </Field>
                  <Field label="Internal description" hint="not shown to recipients">
                    <TextInput
                      value={settings.description ?? ''}
                      onChange={(e) => patchSettings({ description: e.target.value })}
                      placeholder="What this template is for"
                    />
                  </Field>
                  <Field label="Tag">
                    <TextInput value={settings.tag ?? ''} onChange={(e) => patchSettings({ tag: e.target.value })} placeholder="e.g. transactional" />
                  </Field>
                </StudioSection>

                <StudioSection
                  title="Sending account (BYOP)"
                  description="The connected provider this template sends from — proofs use it too."
                  right={
                    <a
                      href="/settings/channels"
                      className="flex items-center gap-1 text-[10px] font-bold text-violet-600 hover:underline"
                    >
                      Manage <ExternalLink className="h-3 w-3" />
                    </a>
                  }
                >
                  {activeProviders.length === 0 ? (
                    <div className="flex items-start gap-2 rounded-xl border border-slate-200 bg-slate-50 p-3 text-[11px] text-slate-500">
                      <PlugZap className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />
                      <span>
                        No active {meta.label} account connected.{' '}
                        <a href="/settings/channels" className="font-bold text-violet-600 hover:underline">
                          Connect one
                        </a>{' '}
                        in Settings → Channels to send and test.
                      </span>
                    </div>
                  ) : (
                    <div className="space-y-1.5">
                      {activeProviders.map((p) => {
                        const active = (selectedProvider?.id ?? '') === p.id;
                        return (
                          <button
                            key={p.id}
                            type="button"
                            onClick={() => patchSettings({ provider_account_id: p.id })}
                            className={`flex w-full items-center justify-between gap-2 rounded-xl border px-3 py-2 text-left transition ${
                              active ? 'border-violet-400 bg-violet-50/60 ring-2 ring-violet-100' : 'border-slate-200 bg-white hover:border-slate-300'
                            }`}
                          >
                            <span className="min-w-0">
                              <span className="flex items-center gap-1.5 text-[11px] font-bold text-slate-800">
                                {p.name || p.providerType}
                                {p.isDefault && (
                                  <span className="rounded bg-slate-100 px-1 py-0.5 text-[8px] font-bold uppercase text-slate-500">Default</span>
                                )}
                              </span>
                              <span className="block truncate text-[10px] text-slate-400">{p.providerType}</span>
                            </span>
                            {active && <Check className="h-3.5 w-3.5 shrink-0 text-violet-600" />}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </StudioSection>

                <StudioSection title="Detected variables" description="Merge tags this template will require at send time.">
                  {variables.length === 0 ? (
                    <p className="text-[11px] text-slate-400">No <code className="rounded bg-slate-100 px-1">{'{{variables}}'}</code> used yet.</p>
                  ) : (
                    <div className="flex flex-wrap gap-1.5">
                      {variables.map((v) => (
                        <span key={v} className="rounded-lg bg-violet-50 px-2 py-1 font-mono text-[10px] font-bold text-violet-700">
                          {`{{${v}}}`}
                        </span>
                      ))}
                    </div>
                  )}
                </StudioSection>

                {needsApproval ? (
                  <StudioSection
                    title={providerApprovalTabLabel(channel)}
                    description={
                      channel === 'sms'
                        ? 'Record the DLT-registered IDs so journeys reference them at send time.'
                        : channel === 'whatsapp'
                          ? 'Record the Meta-approved template name and ID after approval.'
                          : 'Link the approved RCS template / agent IDs for delivery routing.'
                    }
                  >
                    <Field label="Registration status">
                      <div className="grid grid-cols-2 gap-1.5">
                        {APPROVAL_STATUS_OPTIONS.map((o) => {
                          const active = (approval?.status ?? 'not_registered') === o.id;
                          return (
                            <button
                              key={o.id}
                              type="button"
                              onClick={() => patchApproval({ status: o.id })}
                              title={o.description}
                              className={`rounded-lg border px-2 py-1.5 text-left text-[11px] font-bold transition ${
                                active ? 'border-violet-400 bg-violet-50 text-violet-800 ring-2 ring-violet-100' : 'border-slate-200 bg-white text-slate-500 hover:border-slate-300'
                              }`}
                            >
                              {o.label}
                            </button>
                          );
                        })}
                      </div>
                    </Field>
                    {APPROVAL_FIELDS[channel as 'sms' | 'whatsapp' | 'rcs'].map((f) => (
                      <Field key={f.key} label={f.label}>
                        <TextInput
                          value={String((approval as any)?.[f.key] ?? '')}
                          onChange={(e) => patchApproval({ [f.key]: e.target.value })}
                          placeholder={f.placeholder}
                          className={f.mono ? 'font-mono' : undefined}
                        />
                      </Field>
                    ))}
                    {channel === 'sms' && (
                      <Field label="Message type">
                        <div className="grid grid-cols-2 gap-1.5">
                          {(['promotional', 'transactional', 'service_implicit', 'service_explicit'] as const).map((m) => {
                            const active = (approval?.message_type ?? 'promotional') === m;
                            return (
                              <button
                                key={m}
                                type="button"
                                onClick={() => patchApproval({ message_type: m })}
                                className={`rounded-lg border px-2 py-1.5 text-[11px] font-bold capitalize transition ${
                                  active ? 'border-violet-400 bg-violet-50 text-violet-800' : 'border-slate-200 bg-white text-slate-500 hover:border-slate-300'
                                }`}
                              >
                                {m.replace('_', ' ')}
                              </button>
                            );
                          })}
                        </div>
                      </Field>
                    )}
                    <p className="text-[10px] text-slate-400">
                      Marbee doesn't submit templates — enter IDs from your{' '}
                      {channel === 'sms' ? 'operator / DLT portal' : channel === 'whatsapp' ? 'WhatsApp Manager' : 'RCS provider console'} after approval.
                    </p>
                  </StudioSection>
                ) : (
                  <StudioSection title="Provider approval" description="External registration required before live sends.">
                    <div className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50/60 p-3 text-[11px] text-amber-800">
                      <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" />
                      <span>No provider approval — publishing enables this for opted-in subscribers.</span>
                    </div>
                  </StudioSection>
                )}
              </div>
            )}

            {tab === 'test' && (
              <div className="space-y-4">
                <StudioSection title={meta.recipientLabel} description="Comma, space or Enter to add. Personalized with a sample profile.">
                  <div className="flex flex-wrap items-center gap-1.5 rounded-xl border border-slate-200 bg-white p-2 focus-within:ring-2 focus-within:ring-violet-100">
                    {recipientList.map((r) => (
                      <span key={r} className="inline-flex items-center gap-1 rounded-lg bg-violet-100 px-2 py-1 text-[11px] font-semibold text-violet-800">
                        {r}
                        <button type="button" onClick={() => setRecipients(recipientList.filter((x) => x !== r).join(', '))}>
                          <X className="h-2.5 w-2.5" />
                        </button>
                      </span>
                    ))}
                    <input
                      value={recipientDraft}
                      onChange={(e) => setRecipientDraft(e.target.value)}
                      onKeyDown={(e) => {
                        if (['Enter', ',', ' '].includes(e.key)) {
                          e.preventDefault();
                          addRecipient(recipientDraft);
                        } else if (e.key === 'Backspace' && !recipientDraft && recipientList.length) {
                          setRecipients(recipientList.slice(0, -1).join(', '));
                        }
                      }}
                      onBlur={() => recipientDraft && addRecipient(recipientDraft)}
                      placeholder={recipientList.length ? 'Add another…' : meta.recipientPlaceholder}
                      className="min-w-[140px] flex-1 bg-transparent px-1 py-1 text-[11px] outline-hidden"
                    />
                  </div>
                </StudioSection>

                <StudioSection title="Send from" description="Proofs are dispatched through this connected account.">
                  {selectedProvider ? (
                    <div className="flex items-center justify-between gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2">
                      <span className="flex items-center gap-2 text-[11px] font-bold text-slate-800">
                        <PlugZap className="h-4 w-4 text-emerald-500" />
                        {selectedProvider.name || selectedProvider.providerType}
                        <span className="font-mono text-[10px] font-normal text-slate-400">{selectedProvider.providerType}</span>
                      </span>
                      <button type="button" onClick={() => setTab('settings')} className="text-[10px] font-bold text-violet-600 hover:underline">
                        Change
                      </button>
                    </div>
                  ) : (
                    <div className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50/60 p-3 text-[11px] text-amber-800">
                      <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" />
                      <span>
                        No sending account selected.{' '}
                        <button type="button" onClick={() => setTab('settings')} className="font-bold underline">
                          Choose one in Settings
                        </button>
                        .
                      </span>
                    </div>
                  )}
                </StudioSection>

                <StudioSection title={`Preflight ${failing === 0 ? '· all clear' : `· ${failing} to review`}`}>
                  <div className="space-y-1.5">
                    {checks.map((c, i) => (
                      <div key={i} className="flex items-center gap-1.5 text-[11px]">
                        {c.ok ? (
                          <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-emerald-500" />
                        ) : (
                          <TriangleAlert className="h-3.5 w-3.5 shrink-0 text-amber-500" />
                        )}
                        <span className={c.ok ? 'text-slate-600' : 'font-semibold text-amber-700'}>{c.label}</span>
                      </div>
                    ))}
                  </div>
                </StudioSection>

                <button
                  type="button"
                  disabled={sending || recipientList.length === 0 || !selectedProvider}
                  onClick={runSend}
                  className="flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-violet-600 to-indigo-600 py-2.5 text-xs font-bold text-white shadow-md shadow-violet-500/25 transition hover:from-violet-700 hover:to-indigo-700 disabled:opacity-50"
                >
                  {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                  {sending ? 'Sending…' : `Send test${recipientList.length ? ` (${recipientList.length})` : ''}`}
                </button>

                {history.length > 0 && (
                  <StudioSection title="Sent this session">
                    <div className="space-y-1">
                      {history.map((h) => (
                        <div key={h.id} className="flex items-center justify-between text-[10.5px] text-slate-500">
                          <span className="flex items-center gap-1.5">
                            <History className="h-3 w-3" /> {h.to.join(', ')}
                          </span>
                          <span>{h.at}</span>
                        </div>
                      ))}
                    </div>
                  </StudioSection>
                )}
              </div>
            )}
          </div>
        </div>

        {/* preview column */}
        <aside className="flex max-h-[46vh] w-full shrink-0 flex-col border-b border-slate-200 bg-[radial-gradient(circle_at_1px_1px,rgba(15,23,42,0.06)_1px,transparent_0)] [background-size:16px_16px] lg:max-h-none lg:w-[420px] lg:border-b-0 lg:border-l">
          <div className="flex items-center justify-between border-b border-slate-200 bg-white/70 px-4 py-2 backdrop-blur">
            <span className="flex items-center gap-1.5 text-[11px] font-bold text-slate-500">
              <Smartphone className="h-3.5 w-3.5" /> Live preview
            </span>
            {channel === 'web_push' && (
              <div className="flex rounded-lg border border-slate-200 bg-white p-0.5">
                {(['desktop', 'android'] as const).map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => setPushSurface(s)}
                    className={`flex items-center gap-1 rounded-md px-2 py-1 text-[10px] font-bold capitalize transition ${
                      pushSurface === s ? 'bg-violet-600 text-white' : 'text-slate-400'
                    }`}
                  >
                    {s === 'desktop' ? <Monitor className="h-3 w-3" /> : <Smartphone className="h-3 w-3" />}
                    {s}
                  </button>
                ))}
              </div>
            )}
          </div>
          <div className="flex flex-1 items-start justify-center overflow-y-auto p-6 [scrollbar-width:thin]">
            <div className="origin-top scale-95">{preview}</div>
          </div>
          <div className="border-t border-slate-200 bg-white/70 px-4 py-2 text-center text-[10px] text-slate-400 backdrop-blur">
            Rendered with sample data · {variables.length} variable{variables.length === 1 ? '' : 's'}
          </div>
        </aside>
      </div>

      {toast && (
        <div className="fixed bottom-6 right-6 z-[100] flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-2.5 text-xs font-bold text-white shadow-2xl animate-in slide-in-from-bottom-5">
          <Sparkles className="h-4 w-4 text-violet-400" />
          {toast}
        </div>
      )}
    </div>
  );
}
