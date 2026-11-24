import { useMemo, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { AlertCircle, AlertTriangle, Check, ChevronLeft, ChevronRight, Loader2, Send, Shield, X, Zap } from 'lucide-react';
import { Button, Badge } from '@/components/ui';
import { useAuth } from '@/contexts/AuthContext';
import { PayloadSchemaBuilder } from './PayloadSchemaBuilder';
import { RtmTemplateEditor } from './RtmTemplateEditor';
import { RtmMessageTrace } from './RtmMessageTrace';
import {
  CHANNELS, buildSnippet, dispatchRealTimeEvent, inferSchema, sendTest, upsertDefinition,
  type Channel, type DefinitionDetail, type DefinitionStatus, type Guardrails,
  type RtmMessage, type RtmTemplate, type SchemaField, type SnippetLang,
} from '@/lib/rtm';

type TemplateFolder = { id: string; name: string; parentId: string | null; locked?: boolean };

type Props = {
  initial?: DefinitionDetail | null;
  folders?: TemplateFolder[];
  existingEventNames?: string[];
  onClose: () => void;
};

const STEPS = ['Basics', 'Payload', 'Channel', 'Template', 'Review & test'] as const;

function slugify(s: string) {
  return s.toLowerCase().trim().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
}

const EMPTY_TEMPLATE: RtmTemplate = {
  channel: 'web_push', locale: 'default', missing_var_policy: 'fallback',
  content: { title: '', body: '', icon_url: '', image_url: '', click_url: '', buttons: [] },
};

export function RtmWizard({ initial, folders = [], existingEventNames = [], onClose }: Props) {
  const { tenantId, environment } = useAuth();
  const queryClient = useQueryClient();
  const editing = Boolean(initial);

  const [step, setStep] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const [name, setName] = useState(initial?.name ?? '');
  const [slug, setSlug] = useState(initial?.slug ?? '');
  const [description, setDescription] = useState(initial?.description ?? '');
  const [eventType, setEventType] = useState(initial?.event_type ?? '');
  const [targetFolder, setTargetFolder] = useState<string>('transactional-rt');
  const [latencyClass, setLatencyClass] = useState(initial?.latency_class ?? 'standard');
  const [isTransactional, setIsTransactional] = useState(initial?.is_transactional ?? true);
  const [defaultChannel, setDefaultChannel] = useState<Channel>(initial?.default_channel ?? 'web_push');
  const [payloadSchema, setPayloadSchema] = useState<SchemaField[]>(initial?.payload_schema ?? []);

  // Sample JSON payload state
  const [sampleJson, setSampleJson] = useState(() => {
    return JSON.stringify({
      order_id: 'ORD-9921',
      amount: 1499.00,
      currency: 'INR',
      customer_name: 'John Doe',
      customer_email: 'john@example.com',
    }, null, 2);
  });
  const [jsonError, setJsonError] = useState<string | null>(null);

  const g = initial?.guardrails ?? {};
  const [dedupeKeys, setDedupeKeys] = useState((g.dedupe?.keys ?? []).join(', '));
  const [dedupeWindow, setDedupeWindow] = useState(g.dedupe?.window_seconds ?? 600);
  const [rateMax, setRateMax] = useState(g.rate_per_recipient?.max ?? 5);
  const [rateWindow, setRateWindow] = useState(g.rate_per_recipient?.window_seconds ?? 3600);
  const [spendCap, setSpendCap] = useState(g.spend_cap_credits_per_day ?? 0);
  const [requireConsent, setRequireConsent] = useState(g.require_consent ?? false);

  const [template, setTemplate] = useState<RtmTemplate>(
    initial?.templates.find((t) => t.channel === (initial?.default_channel ?? 'web_push') && t.locale === 'default')
    ?? EMPTY_TEMPLATE,
  );

  const [snippetLang, setSnippetLang] = useState<SnippetLang>('curl');
  const [testTo, setTestTo] = useState('');
  const [testTrace, setTestTrace] = useState<RtmMessage | null>(null);

  // Sending accounts – mocked connected transactional accounts per channel (filter configured/verified only)
  const SENDING_ACCOUNTS: Record<string, { id: string; name: string; address: string; provider: string; verified: boolean }[]> = {
    email: [
      { id: 'sa-1', name: 'Transactional Email', address: 'noreply@marbee.io', provider: 'Amazon SES', verified: true },
      { id: 'sa-2', name: 'Alerts & OTP', address: 'alerts@marbee.io', provider: 'SendGrid', verified: true },
      { id: 'sa-3', name: 'Marketing', address: 'hello@marbee.io', provider: 'Mailgun', verified: false },
    ],
    sms: [
      { id: 'sa-4', name: 'Transactional SMS', address: 'MARBEE', provider: 'Twilio', verified: true },
      { id: 'sa-5', name: 'OTP Sender', address: 'VM-MARBEE', provider: 'MSG91', verified: true },
    ],
    whatsapp: [
      { id: 'sa-6', name: 'WhatsApp Business', address: '+91 98765 43210', provider: 'Meta Cloud API', verified: true },
    ],
    web_push: [
      { id: 'sa-7', name: 'Web Push (VAPID)', address: 'FCM/VAPID', provider: 'Firebase', verified: true },
    ],
    mobile_push: [
      { id: 'sa-8', name: 'iOS Push', address: 'APNs', provider: 'Apple APNs', verified: true },
      { id: 'sa-9', name: 'Android Push', address: 'FCM', provider: 'Firebase', verified: true },
    ],
  };
  
  // Show ONLY configured/verified accounts
  const channelAccounts = useMemo(() => {
    return (SENDING_ACCOUNTS[defaultChannel] ?? []).filter((acc) => acc.verified);
  }, [defaultChannel]);

  const [sendingAccountId, setSendingAccountId] = useState(channelAccounts[0]?.id ?? '');

  const effectiveSlug = slug || slugify(eventType || name);

  // Check unique eventName
  const isEventNameDuplicate = useMemo(() => {
    const trimmed = eventType.trim().toLowerCase();
    if (!trimmed) return false;
    if (editing && initial?.event_type.toLowerCase() === trimmed) return false;
    return existingEventNames.map((e) => e.toLowerCase()).includes(trimmed);
  }, [eventType, existingEventNames, editing, initial]);

  const guardrails: Guardrails = useMemo(() => ({
    dedupe: dedupeKeys.trim()
      ? { keys: dedupeKeys.split(',').map((k) => k.trim()).filter(Boolean), window_seconds: Number(dedupeWindow) || 0 }
      : undefined,
    rate_per_recipient: Number(rateMax) > 0
      ? { max: Number(rateMax), window_seconds: Number(rateWindow) || 3600 }
      : undefined,
    spend_cap_credits_per_day: Number(spendCap) || 0,
    require_consent: requireConsent,
  }), [dedupeKeys, dedupeWindow, rateMax, rateWindow, spendCap, requireConsent]);

  function buildInput(status: DefinitionStatus) {
    return {
      id: initial?.id,
      name: name.trim(),
      slug: effectiveSlug,
      description: description ?? '',
      event_type: (eventType || slugify(name)).trim(),
      latency_class: latencyClass,
      is_transactional: isTransactional,
      default_channel: defaultChannel,
      fallback_channels: initial?.fallback_channels ?? [],
      filters: initial?.filters ?? [],
      payload_schema: payloadSchema,
      guardrails,
      templates: [{ ...template, channel: defaultChannel, locale: 'default' }],
      status,
    };
  }

  const save = useMutation({
    mutationFn: (status: DefinitionStatus) => upsertDefinition(tenantId, environment, buildInput(status)),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['rtm-definitions', tenantId, environment] });
      onClose();
    },
    onError: (e: Error) => setError(e.message),
  });

  const test = useMutation({
    mutationFn: async () => {
      let to: Record<string, unknown>;
      try {
        to = testTo.trim().startsWith('{') ? JSON.parse(testTo) : { customer_id: testTo.trim() };
      } catch { throw new Error('Recipient must be a customer_id or a JSON object like {"email":"..."}'); }
      const data: Record<string, unknown> = {};
      for (const f of payloadSchema) {
        data[f.key] = f.type === 'number' ? Number(f.example) || 0
          : f.type === 'boolean' ? f.example === 'true' : (f.example ?? '');
      }

      // Also trigger real-time event so it appears in Real-Time Events tab immediately
      dispatchRealTimeEvent({
        eventName: (eventType || slugify(name)).trim(),
        isTestMode: true,
        tenantId,
        templateName: name.trim(),
        channel: defaultChannel,
        payload: data,
      });

      return sendTest(tenantId, environment, {
        event: (eventType || slugify(name)).trim(), to, data, channel: defaultChannel,
      });
    },
    onSuccess: (r) => { setTestTrace(r.trace); setError(null); },
    onError: (e: Error) => setError(e.message),
  });

  const inferSchemaFromJson = () => {
    try {
      const parsed = JSON.parse(sampleJson);
      const inferred = inferSchema(parsed);
      setPayloadSchema(inferred);
      setJsonError(null);
    } catch {
      setJsonError('Invalid JSON formatting. Please check syntax.');
    }
  };

  const templateHasContent = (() => {
    const c = template.content as Record<string, any>;
    if (defaultChannel === 'email') return (c.subject as string)?.trim() !== '' && (c.body as string)?.trim() !== '';
    if (defaultChannel === 'sms' || defaultChannel === 'voice') return (c.body as string)?.trim() !== '';
    return (c.title as string)?.trim() !== '' && (c.body as string)?.trim() !== '';
  })();

  const templatePending: string[] = (() => {
    const c = template.content as Record<string, any>;
    const items: string[] = [];
    if (defaultChannel === 'email') {
      if (!(c.subject as string)?.trim()) items.push('Subject line');
      if (!(c.body as string)?.trim()) items.push('Email body');
    } else if (defaultChannel === 'sms' || defaultChannel === 'voice') {
      if (!(c.body as string)?.trim()) items.push('Message body');
    } else {
      if (!(c.title as string)?.trim()) items.push('Title');
      if (!(c.body as string)?.trim()) items.push('Body');
    }
    return items;
  })();

  const canNext = [
    name.trim() !== '' && eventType.trim() !== '' && !isEventNameDuplicate,
    true,
    true,
    templateHasContent,
    true,
  ][step];

  // Hierarchy folder list
  const parentFolders = useMemo(() => {
    const parents = folders.filter((f) => f.parentId === null);
    if (!parents.some((p) => p.id === 'transactional-rt')) {
      parents.unshift({ id: 'transactional-rt', name: 'Transactional ( RT )', parentId: null, locked: true });
    }
    if (!parents.some((p) => p.id === 'triggers')) {
      parents.unshift({ id: 'triggers', name: 'Triggers', parentId: null, locked: true });
    }
    return parents;
  }, [folders]);

  return (
    <div className="fixed inset-0 z-50 flex items-stretch justify-center bg-slate-900/50 p-0 backdrop-blur-sm sm:p-6">
      <div className="flex w-full max-w-4xl flex-col overflow-hidden rounded-none bg-white shadow-2xl sm:rounded-2xl">
        {/* header */}
        <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4">
          <div>
            <h2 className="text-lg font-bold text-slate-900">
              {editing ? `Edit ${initial?.name}` : 'New real-time message template'}
            </h2>
            <p className="text-xs text-slate-500">Step {step + 1} of {STEPS.length} · {STEPS[step]}</p>
          </div>
          <button type="button" onClick={onClose} className="text-slate-400 hover:text-slate-600">
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* stepper */}
        <div className="flex gap-1 border-b border-slate-100 px-6 py-3">
          {STEPS.map((s, i) => (
            <button key={s} type="button" onClick={() => i < step && setStep(i)}
              className={`flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium transition ${
                i === step ? 'bg-brand-600 text-white'
                : i < step ? 'bg-brand-50 text-brand-700' : 'bg-slate-100 text-slate-400'
              }`}>
              {i < step ? <Check className="h-3 w-3" /> : <span>{i + 1}</span>}
              {s}
            </button>
          ))}
        </div>

        {/* body */}
        <div className="flex-1 overflow-y-auto px-6 py-5">
          {error && (
            <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>
          )}

          {step === 0 && (
            <div className="max-w-xl space-y-4">
              <Row label="Parent Folder" hint="Templates must be assigned under Transactional ( RT ), Triggers, or custom subfolders.">
                <select value={targetFolder} onChange={(e) => setTargetFolder(e.target.value)}
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-700 focus:border-brand-500 focus:outline-none">
                  {parentFolders.map((p) => {
                    const children = folders.filter((c) => c.parentId === p.id);
                    return (
                      <optgroup key={p.id} label={p.name}>
                        <option value={p.id}>{p.name} (Root)</option>
                        {children.map((c) => (
                          <option key={c.id} value={c.id}>— {c.name}</option>
                        ))}
                      </optgroup>
                    );
                  })}
                </select>
              </Row>

              <Row label="Template Name" hint="What your team calls this message.">
                <input value={name}
                  onChange={(e) => { setName(e.target.value); if (!editing) { setSlug(''); if (!eventType) setEventType(slugify(e.target.value)); } }}
                  placeholder="Order shipped"
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none" />
              </Row>

              <Row label="eventName (unique)" hint="Unique event identifier. Your backend will trigger this template using this event key.">
                <div className="space-y-1.5">
                  <input value={eventType} onChange={(e) => setEventType(slugify(e.target.value))}
                    placeholder="order_shipped"
                    className={`w-full rounded-lg border px-3 py-2 font-mono text-sm focus:outline-none ${
                      isEventNameDuplicate ? 'border-red-400 bg-red-50 text-red-900 focus:border-red-500' : 'border-slate-200 focus:border-brand-500'
                    }`} />
                  
                  {/* Event guidance callout */}
                  <div className="flex items-center gap-2 rounded-lg bg-blue-50/70 border border-blue-200 px-3 py-2 text-xs font-medium text-blue-800">
                    <Zap className="h-4 w-4 text-blue-600 shrink-0" />
                    <span>This template will get triggered when this event occurs.</span>
                  </div>

                  {isEventNameDuplicate && (
                    <div className="flex items-center gap-2 text-xs font-medium text-red-600">
                      <AlertTriangle className="h-4 w-4 shrink-0" />
                      <span>An event with the name '{eventType}' already exists. Event names must be unique.</span>
                    </div>
                  )}
                </div>
              </Row>

              <Row label="Description" hint="Optional. Shows in the list and API documentation.">
                <textarea value={description ?? ''} onChange={(e) => setDescription(e.target.value)} rows={2}
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none" />
              </Row>

              <Row label="Speed lane" hint="Hot = OTP / login codes: dedicated warm workers, sub-2s. Standard = everything else.">
                <div className="flex gap-2">
                  {(['standard', 'hot'] as const).map((v) => (
                    <button key={v} type="button" onClick={() => setLatencyClass(v)}
                      className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium ${
                        latencyClass === v ? 'border-brand-500 bg-brand-50 text-brand-700' : 'border-slate-200 text-slate-600'
                      }`}>
                      {v === 'hot' && <Zap className="h-3.5 w-3.5" />}{v}
                    </button>
                  ))}
                </div>
              </Row>
            </div>
          )}

          {step === 1 && (
            <div className="space-y-6">
              <div className="rounded-xl border border-slate-200 bg-slate-50/50 p-4">
                <div className="mb-2 flex items-center justify-between">
                  <label className="text-sm font-semibold text-slate-800">Sample JSON Payload</label>
                  <Button size="sm" variant="secondary" onClick={inferSchemaFromJson}>
                    Auto-Infer Schema from JSON
                  </Button>
                </div>
                <p className="mb-3 text-xs text-slate-500">Paste or edit a sample JSON payload that your application will send when triggering this event.</p>
                <textarea
                  value={sampleJson}
                  onChange={(e) => setSampleJson(e.target.value)}
                  rows={6}
                  className="w-full rounded-lg border border-slate-200 bg-slate-900 p-3 font-mono text-xs text-emerald-300 focus:border-brand-500 focus:outline-none"
                />
                {jsonError && <p className="mt-1 text-xs text-red-600 font-medium">{jsonError}</p>}
              </div>

              <PayloadSchemaBuilder value={payloadSchema} onChange={setPayloadSchema} />
            </div>
          )}

          {step === 2 && (
            <div className="max-w-xl space-y-5">
              <Row label="Channel" hint="Select default channel for this message template.">
                <div className="flex flex-wrap gap-2">
                  {CHANNELS.map((c) => (
                    <button key={c.value} type="button" disabled={!c.ready}
                      onClick={() => { setDefaultChannel(c.value); setTemplate((t) => ({ ...t, channel: c.value })); }}
                      className={`rounded-lg border px-3 py-1.5 text-xs font-medium transition ${
                        defaultChannel === c.value ? 'border-brand-500 bg-brand-50 text-brand-700'
                        : c.ready ? 'border-slate-200 text-slate-600 hover:bg-slate-50'
                        : 'cursor-not-allowed border-slate-100 text-slate-300'
                      }`}>
                      {c.label}{!c.ready && ' · P2'}
                    </button>
                  ))}
                </div>
              </Row>

              {/* Sending account selector (Connected Transactional Accounts) */}
              {channelAccounts.length > 0 && (
                <div className="rounded-xl border border-slate-200 bg-gradient-to-r from-slate-50 to-white p-4 shadow-sm">
                  <h4 className="mb-2 flex items-center gap-2 text-sm font-semibold text-slate-900">
                    <Shield className="h-4 w-4 text-brand-500" />
                    Sending Account
                    {isTransactional && <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-700">TRANSACTIONAL</span>}
                  </h4>
                  <div className="space-y-2">
                    {channelAccounts.map((acc) => (
                      <label key={acc.id}
                        className={`flex cursor-pointer items-center gap-3 rounded-lg border p-3 transition ${
                          sendingAccountId === acc.id
                            ? 'border-brand-400 bg-brand-50/50 ring-1 ring-brand-200'
                            : 'border-slate-200 hover:bg-slate-50'
                        } ${!acc.verified ? 'opacity-50 cursor-not-allowed' : ''}`}>
                        <input type="radio" name="sending-account" value={acc.id}
                          checked={sendingAccountId === acc.id}
                          onChange={() => acc.verified && setSendingAccountId(acc.id)}
                          disabled={!acc.verified}
                          className="h-4 w-4 border-slate-300 text-brand-600 focus:ring-brand-500" />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <p className="text-sm font-medium text-slate-800">{acc.name}</p>
                            {acc.verified
                              ? <span className="flex items-center gap-0.5 rounded-full bg-emerald-100 px-1.5 py-0.5 text-[9px] font-bold text-emerald-700"><Check className="h-2.5 w-2.5" /> Verified</span>
                              : <span className="rounded-full bg-amber-100 px-1.5 py-0.5 text-[9px] font-bold text-amber-700">Unverified</span>}
                          </div>
                          <p className="mt-0.5 truncate text-xs text-slate-500">{acc.address} · via {acc.provider}</p>
                        </div>
                      </label>
                    ))}
                  </div>
                </div>
              )}

              <label className="flex items-start gap-2 rounded-lg border border-slate-200 p-3">
                <input type="checkbox" checked={isTransactional} onChange={(e) => setIsTransactional(e.target.checked)}
                  className="mt-0.5 rounded border-slate-300 text-brand-600 focus:ring-brand-500" />
                <span className="text-sm">
                  <span className="font-medium text-slate-800">Transactional</span>
                  <span className="block text-xs text-slate-500">
                    Bypasses marketing frequency caps and quiet hours. Hard legal opt-outs are still honoured.
                    Turn this off for price-drop / back-in-stock style messages.
                  </span>
                </span>
              </label>

              <div className="rounded-lg border border-slate-200 p-4">
                <h4 className="mb-3 text-sm font-semibold text-slate-900">Guardrails</h4>
                <div className="space-y-3 text-sm">
                  <div className="grid grid-cols-[1fr_auto] items-center gap-2">
                    <span className="text-slate-600">Dedupe on fields (comma-sep)</span>
                    <input value={dedupeKeys} onChange={(e) => setDedupeKeys(e.target.value)} placeholder="order_id"
                      className="w-40 rounded border border-slate-200 px-2 py-1 font-mono text-xs focus:border-brand-500 focus:outline-none" />
                  </div>
                  <div className="grid grid-cols-[1fr_auto] items-center gap-2">
                    <span className="text-slate-600">…within (seconds)</span>
                    <input type="number" value={dedupeWindow} onChange={(e) => setDedupeWindow(+e.target.value)}
                      className="w-40 rounded border border-slate-200 px-2 py-1 text-xs focus:border-brand-500 focus:outline-none" />
                  </div>
                  <div className="grid grid-cols-[1fr_auto] items-center gap-2">
                    <span className="text-slate-600">Max per recipient</span>
                    <input type="number" value={rateMax} onChange={(e) => setRateMax(+e.target.value)}
                      className="w-40 rounded border border-slate-200 px-2 py-1 text-xs focus:border-brand-500 focus:outline-none" />
                  </div>
                  <div className="grid grid-cols-[1fr_auto] items-center gap-2">
                    <span className="text-slate-600">…per window (seconds)</span>
                    <input type="number" value={rateWindow} onChange={(e) => setRateWindow(+e.target.value)}
                      className="w-40 rounded border border-slate-200 px-2 py-1 text-xs focus:border-brand-500 focus:outline-none" />
                  </div>
                  <div className="grid grid-cols-[1fr_auto] items-center gap-2">
                    <span className="text-slate-600">Daily spend cap (credits, 0 = off)</span>
                    <input type="number" value={spendCap} onChange={(e) => setSpendCap(+e.target.value)}
                      className="w-40 rounded border border-slate-200 px-2 py-1 text-xs focus:border-brand-500 focus:outline-none" />
                  </div>
                  <label className="flex items-center gap-2 text-slate-600">
                    <input type="checkbox" checked={requireConsent} onChange={(e) => setRequireConsent(e.target.checked)}
                      className="rounded border-slate-300 text-brand-600 focus:ring-brand-500" />
                    Require channel consent (ignored for transactional)
                  </label>
                </div>
              </div>
            </div>
          )}

          {step === 3 && (
            <div className="space-y-4">
              <RtmTemplateEditor channel={defaultChannel} template={template} schema={payloadSchema} onChange={setTemplate} />

              {/* Pending validation hints */}
              {templatePending.length > 0 && (
                <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3">
                  <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
                  <div>
                    <p className="text-sm font-medium text-amber-800">Required to continue</p>
                    <ul className="mt-1 space-y-0.5 text-xs text-amber-700">
                      {templatePending.map((item) => <li key={item}>• Fill in <span className="font-semibold">{item}</span></li>)}
                    </ul>
                  </div>
                </div>
              )}
            </div>
          )}

          {step === 4 && (
            <div className="space-y-5">
              {/* API URL and security preview */}
              <div className="rounded-xl border border-blue-200 bg-blue-50/40 p-4">
                <h4 className="mb-2 text-sm font-semibold text-slate-900">API Endpoint Configuration</h4>
                <div className="space-y-2.5 text-xs">
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-semibold text-blue-800">Test API URL (Local Dev / In-App Simulation):</span>
                      <span className="rounded bg-blue-100 text-blue-700 text-[10px] font-bold px-1.5 py-0.5">LOCAL DEV</span>
                    </div>
                    <code className="block rounded bg-white px-2.5 py-1.5 text-blue-700 border border-blue-200 font-mono break-all">
                      {typeof window !== 'undefined' ? window.location.origin : 'http://localhost:5173'}/api/v1/rtm/{tenantId}/test/events/{(eventType || slugify(name)).trim()}
                    </code>
                  </div>
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-semibold text-emerald-800">Prod Live API URL (When Cloud Hosted):</span>
                      <span className="rounded bg-emerald-100 text-emerald-700 text-[10px] font-bold px-1.5 py-0.5">PROD CLOUD</span>
                    </div>
                    <code className="block rounded bg-white px-2.5 py-1.5 text-emerald-700 border border-emerald-200 font-mono break-all">
                      https://api.marbee.io/v1/rtm/{tenantId}/events/{(eventType || slugify(name)).trim()}
                    </code>
                  </div>
                </div>
              </div>

              <div>
                <h4 className="mb-2 text-sm font-semibold text-slate-900">Integration snippet</h4>
                <div className="mb-2 flex gap-1">
                  {(['curl', 'node', 'python', 'php'] as SnippetLang[]).map((l) => (
                    <button key={l} type="button" onClick={() => setSnippetLang(l)}
                      className={`rounded px-2.5 py-1 text-xs font-medium ${snippetLang === l ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-500'}`}>
                      {l}
                    </button>
                  ))}
                </div>
                <pre className="max-h-56 overflow-auto rounded-lg bg-slate-900 p-3 font-mono text-[11px] leading-relaxed text-slate-100">
{buildSnippet(snippetLang, { event: (eventType || slugify(name)).trim(), schema: payloadSchema, channel: defaultChannel })}
                </pre>
              </div>

              <div className="rounded-lg border border-slate-200 p-4">
                <h4 className="mb-2 text-sm font-semibold text-slate-900">Send a test API call</h4>
                <div className="flex gap-2">
                  <input value={testTo} onChange={(e) => setTestTo(e.target.value)}
                    placeholder='customer_id, or {"email":"you@example.com"}'
                    className="flex-1 rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none" />
                  <Button onClick={() => test.mutate()} disabled={test.isPending || !testTo.trim()}>
                    {test.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                    <span className="ml-1.5">Send test</span>
                  </Button>
                </div>
                <p className="mt-1.5 text-xs text-slate-500">
                  Sends a test payload to the API and dispatches real-time events straight to the Real-Time Events tab stream.
                </p>
                {testTrace && (
                  <div className="mt-3">
                    <div className="mb-2 flex items-center gap-2">
                      <Badge variant={testTrace.status === 'delivered' ? 'success' : testTrace.status === 'failed' ? 'error' : 'warning'}>
                        {testTrace.status}
                      </Badge>
                      {testTrace.reason_code && <span className="text-xs text-slate-500">{testTrace.reason_code}</span>}
                    </div>
                    <RtmMessageTrace message={testTrace} compact />
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* footer */}
        <div className="flex items-center justify-between border-t border-slate-100 px-6 py-4">
          <Button variant="ghost" onClick={() => (step === 0 ? onClose() : setStep(step - 1))}>
            <ChevronLeft className="mr-1 h-4 w-4" /> {step === 0 ? 'Cancel' : 'Back'}
          </Button>
          <div className="flex items-center gap-3">
            {step === 3 && !canNext && templatePending.length > 0 && (
              <span className="flex items-center gap-1.5 text-xs text-amber-600">
                <AlertCircle className="h-3.5 w-3.5" />
                {templatePending.join(' & ')} required
              </span>
            )}
            {step === STEPS.length - 1 ? (
              <>
                <Button variant="secondary" onClick={() => save.mutate('draft')} disabled={save.isPending}>
                  Save as draft
                </Button>
                <Button onClick={() => save.mutate('active')} disabled={save.isPending}>
                  {save.isPending ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : null}
                  {editing && initial?.status === 'active' ? 'Save changes' : 'Save & Publish (Live)'}
                </Button>
              </>
            ) : (
              <Button onClick={() => setStep(step + 1)} disabled={!canNext}>
                Next <ChevronRight className="ml-1 h-4 w-4" />
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function Row({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="mb-1 block text-sm font-medium text-slate-700">{label}</label>
      {children}
      {hint && <p className="mt-1 text-xs text-slate-500">{hint}</p>}
    </div>
  );
}

