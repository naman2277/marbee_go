import { useEffect, useMemo, useState } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  Bell,
  Check,
  CheckCircle2,
  Code,
  ExternalLink,
  Eye,
  FileCode,
  FilePlus,
  FileText,
  Flame,
  Globe,
  Key,
  Laptop,
  Layers,
  Loader2,
  Mail,
  Maximize2,
  MessageSquare,
  Radio,
  Send,
  Settings2,
  Shield,
  ShieldAlert,
  ShieldCheck,
  Sliders,
  Smartphone,
  Sparkles,
  Tablet,
  Tag,
  Users,
  X,
  Zap,
} from 'lucide-react';
import { Button } from '@/components/ui';
import { ChannelTemplateBuilder } from '@/components/content-templates/ChannelTemplateBuilder';
import { EmailTemplatePreview } from '@/components/content-templates/EmailTemplatePreview';
import { ProviderLogo } from '@/components/channels/ProviderLogo';
import {
  channelLabel,
  getDeliveryContentFromConfig,
  populateDeliveryFromTemplate,
  syncDeliveryFlatFields,
  type ContentChannel,
  type EmailContent,
  type MarbeeContentTemplate,
  type TemplateContent,
} from '@/lib/content-templates';
import { mergeProviderValues } from '@/lib/channel-registry';
import type { ChannelProviderRow } from '@/lib/channel-providers';
import { testMailjetConnection, testResendConnection } from '@/lib/channel-test';
import { useAuth } from '@/contexts/AuthContext';

type Props = {
  open: boolean;
  channel: ContentChannel;
  config: Record<string, unknown>;
  templates: MarbeeContentTemplate[];
  providers: ChannelProviderRow[];
  onClose: () => void;
  onSave: (patch: Record<string, unknown>) => void;
  populationFields?: import('@/lib/template-personalization').PopulationFieldDef[];
  populationSample?: Record<string, unknown> | null;
};

type ModalStep = 1 | 2 | 3 | 4 | 5;

export function DeliveryConfigModal({
  open,
  channel,
  config,
  templates,
  providers,
  onClose,
  onSave,
  populationFields,
  populationSample,
}: Props) {
  const { user } = useAuth();
  const [draftConfig, setDraftConfig] = useState<Record<string, unknown>>(() => ({
    delivery_code: config.delivery_code || `DELIV_${Math.floor(1000 + Math.random() * 9000)}`,
    exclude_unsubscribed: config.exclude_unsubscribed ?? true,
    exclude_bounces: config.exclude_bounces ?? true,
    apply_frequency_cap: config.apply_frequency_cap ?? false,
    respect_quiet_hours: config.respect_quiet_hours ?? false,
    creation_mode: config.creation_mode || (config.content_template_id ? 'template' : 'scratch'),
    ...config,
  }));

  const [currentStep, setCurrentStep] = useState<ModalStep>(1);

  const activeProviders = useMemo(
    () => providers.filter((p) => p.status === 'active'),
    [providers],
  );

  // Auto-select default/first active provider if not already set
  useEffect(() => {
    if (!open) return;
    setDraftConfig((prev) => {
      const existingId = String(prev.channel_provider_id ?? '');
      if (existingId && activeProviders.some((p) => p.id === existingId)) {
        return prev;
      }
      const defaultProv = activeProviders.find((p) => p.isDefault) || activeProviders[0];
      if (defaultProv) {
        const merged = mergeProviderValues(
          defaultProv.channel,
          defaultProv.providerType,
          defaultProv.config,
          defaultProv.credentials,
        );
        return {
          ...prev,
          channel_provider_id: defaultProv.id,
          channel_provider_name: defaultProv.name,
          channel_provider_type: defaultProv.providerType,
          from_email: prev.from_email || merged.from_email || '',
          from_name: prev.from_name || merged.from_name || 'Marbee Team',
          api_key: prev.api_key || merged.api_key || '',
          secret_key: prev.secret_key || merged.secret_key || '',
        };
      }
      return prev;
    });
  }, [open, activeProviders]);

  // Test send state
  const [testRecipient, setTestRecipient] = useState(user?.email || '');
  const [overrideApiKey, setOverrideApiKey] = useState('');
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string; latencyMs?: number } | null>(
    null,
  );

  const publishedTemplates = templates.filter(
    (t) => t.channel === channel && t.status === 'published',
  );
  const deliveryContent = getDeliveryContentFromConfig(channel, draftConfig);
  const selectedProviderId = String(draftConfig.channel_provider_id ?? '');
  const selectedProvider =
    activeProviders.find((p) => p.id === selectedProviderId) || activeProviders[0];

  const patchDraft = (patch: Record<string, unknown>) => {
    setDraftConfig((prev) => ({ ...prev, ...patch }));
  };

  const handleApplyTemplate = (template: MarbeeContentTemplate) => {
    const populated = populateDeliveryFromTemplate(template, draftConfig);
    setDraftConfig({ ...populated, creation_mode: 'template' });
  };

  const handleStartFromScratch = () => {
    patchDraft({
      creation_mode: 'scratch',
      content_template_id: null,
      content_template_name: null,
      html_body: '',
      body: '',
      blocks: [],
      subject: draftConfig.subject || '',
    });
  };

  const handleUpdateContent = (content: TemplateContent) => {
    const synced = syncDeliveryFlatFields(channel, content, draftConfig);
    setDraftConfig(synced);
  };

  // Step completion validation for green checkmarks
  const isStep1Done = Boolean(
    (draftConfig.delivery_name || '').toString().trim() &&
    (draftConfig.delivery_code || '').toString().trim() &&
    (selectedProvider || activeProviders.length > 0),
  );
  const isStep2Done = Boolean(
    (channel === 'email' ? (draftConfig.subject || '').toString().trim() : true) ||
    (deliveryContent as any)?.blocks?.length > 0 ||
    (deliveryContent as any)?.html_body,
  );
  const isStep3Done = Boolean(isStep2Done);
  const isStep4Done = true;
  const isStep5Done = Boolean(testResult?.ok);

  const handleRunLiveTest = async () => {
    setTesting(true);
    setTestResult(null);

    const provider = selectedProvider || activeProviders[0];
    const providerType = provider?.providerType || String(draftConfig.channel_provider_type || 'resend');

    let mergedCreds: Record<string, string> = {};
    if (provider) {
      mergedCreds = mergeProviderValues(
        provider.channel,
        provider.providerType,
        provider.config,
        provider.credentials,
      );
    }

    let sessionDraft: Record<string, string> = {};
    try {
      const cached = sessionStorage.getItem(`marbee_test_draft_${channel}_${providerType}`);
      if (cached) sessionDraft = JSON.parse(cached);
    } catch {}

    const apiKey = String(
      overrideApiKey.trim() ||
      draftConfig.api_key ||
      mergedCreds.api_key ||
      sessionDraft.apiKey ||
      '',
    );
    const secretKey = String(
      draftConfig.secret_key ||
      mergedCreds.secret_key ||
      sessionDraft.secretKey ||
      '',
    );
    const fromEmail = String(
      draftConfig.from_email ||
      mergedCreds.from_email ||
      sessionDraft.fromEmail ||
      (providerType === 'resend' ? 'onboarding@resend.dev' : ''),
    );
    const fromName = String(
      draftConfig.from_name ||
      mergedCreds.from_name ||
      sessionDraft.fromName ||
      'Marbee Team',
    );

    try {
      if (providerType === 'mailjet') {
        const res = await testMailjetConnection({
          apiKey,
          secretKey,
          fromEmail,
          fromName,
          recipientEmail: testRecipient,
          sandboxMode: 'false',
        });
        setTestResult({ ok: res.ok, message: res.message, latencyMs: res.latencyMs });
      } else {
        const res = await testResendConnection({
          apiKey,
          fromEmail,
          fromName,
          recipientEmail: testRecipient,
          useBatchEndpoint: false,
        });
        setTestResult({ ok: res.ok, message: res.message, latencyMs: res.latencyMs });
      }
    } catch (err: any) {
      setTestResult({ ok: false, message: err?.message || 'Failed to dispatch test message' });
    } finally {
      setTesting(false);
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 backdrop-blur-xs animate-in fade-in">
      <button
        type="button"
        className="absolute inset-0 bg-slate-950/70"
        aria-label="Close"
        onClick={onClose}
      />
      <div className="relative flex h-[96vh] w-full max-w-6xl flex-col overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-100 bg-slate-50/90 px-6 py-3.5">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-brand-50 text-brand-700 shadow-2xs">
              {channel === 'email' ? (
                <Mail className="h-5 w-5" />
              ) : channel === 'sms' || channel === 'whatsapp' ? (
                <MessageSquare className="h-5 w-5" />
              ) : (
                <Bell className="h-5 w-5" />
              )}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-black text-slate-900">
                  {String(draftConfig.delivery_name || `${channelLabel(channel)} Delivery Studio`)}
                </h2>
                <span className="rounded-full bg-slate-100 font-mono border border-slate-200 px-2 py-0.5 text-[10px] font-bold text-slate-600">
                  {String(draftConfig.delivery_code || 'DELIV_001')}
                </span>
                <span className="rounded-full bg-brand-50 border border-brand-200 px-2 py-0.5 text-[10px] font-bold text-brand-700 uppercase tracking-wider">
                  {channelLabel(channel)}
                </span>
              </div>
              <p className="text-xs text-slate-500">
                Setup delivery metadata, choose design workflow, preview across devices, and test live dispatches.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl p-1.5 text-slate-400 hover:bg-slate-200/60 hover:text-slate-600 transition"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* 5-Step Progression Wizard with Green Checkmarks */}
        <div className="grid grid-cols-5 border-b border-slate-200/80 bg-slate-50/60 px-6 py-2.5 gap-2">
          {[
            { step: 1 as ModalStep, label: 'Delivery Setup & Rules', done: isStep1Done },
            { step: 2 as ModalStep, label: 'Message & Content', done: isStep2Done },
            { step: 3 as ModalStep, label: 'Multi-Device Preview', done: isStep3Done },
            { step: 4 as ModalStep, label: 'Sender & Routing', done: isStep4Done },
            { step: 5 as ModalStep, label: 'Test Send', done: isStep5Done },
          ].map((item) => {
            const active = currentStep === item.step;
            return (
              <button
                key={item.step}
                type="button"
                onClick={() => setCurrentStep(item.step)}
                className={`flex items-center justify-between rounded-xl px-2.5 py-2 text-xs font-bold transition text-left ${
                  active
                    ? 'bg-brand-600 text-white shadow-2xs'
                    : 'bg-white/80 border border-slate-200/80 text-slate-700 hover:bg-slate-100'
                }`}
              >
                <div className="flex items-center gap-1.5 truncate">
                  <span
                    className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-black ${
                      active
                        ? 'bg-white text-brand-700'
                        : item.done
                        ? 'bg-emerald-100 text-emerald-800'
                        : 'bg-slate-100 text-slate-600'
                    }`}
                  >
                    {item.step}
                  </span>
                  <span className="truncate">{item.label}</span>
                </div>
                {item.done && (
                  <CheckCircle2
                    className={`h-4 w-4 shrink-0 ${
                      active ? 'text-white' : 'text-emerald-600'
                    }`}
                  />
                )}
              </button>
            );
          })}
        </div>

        {/* Modal Body per Step */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* STEP 1: INITIAL DELIVERY SETUP & SUPPRESSIONS & CREATION CHOICE */}
          {currentStep === 1 && (
            <div className="space-y-6 max-w-4xl mx-auto animate-in fade-in">
              {/* Delivery Name & Delivery Code */}
              <div className="grid gap-4 sm:grid-cols-2 rounded-2xl border border-slate-200/90 bg-slate-50/50 p-4">
                <div>
                  <label className="mb-1 block text-xs font-bold text-slate-700">
                    Delivery Name *
                  </label>
                  <input
                    type="text"
                    value={String(draftConfig.delivery_name ?? '')}
                    onChange={(e) => patchDraft({ delivery_name: e.target.value })}
                    placeholder="e.g. 1st Nurture Outreach"
                    className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold focus:border-brand-500 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="mb-1 block text-xs font-bold text-slate-700">
                    Delivery Code / Internal Key *
                  </label>
                  <input
                    type="text"
                    value={String(draftConfig.delivery_code ?? '')}
                    onChange={(e) => patchDraft({ delivery_code: e.target.value })}
                    placeholder="e.g. DELIV_001"
                    className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-mono font-bold focus:border-brand-500 focus:outline-none"
                  />
                </div>
              </div>

              {/* Channel Provider Account to Use */}
              <div className="space-y-2">
                <label className="block text-xs font-bold text-slate-700 flex items-center justify-between">
                  <span>Account to Use (Channel Provider)</span>
                  <span className="text-[10px] text-slate-400 font-normal">
                    Configured in Settings → Channels
                  </span>
                </label>
                <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
                  {activeProviders.map((p) => {
                    const isSelected = (selectedProvider?.id === p.id) || (selectedProviderId === p.id);
                    const merged = mergeProviderValues(p.channel, p.providerType, p.config, p.credentials);
                    return (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() =>
                          patchDraft({
                            channel_provider_id: p.id,
                            channel_provider_name: p.name,
                            channel_provider_type: p.providerType,
                            from_email: merged.from_email || draftConfig.from_email,
                            from_name: merged.from_name || draftConfig.from_name,
                            api_key: merged.api_key || draftConfig.api_key,
                            secret_key: merged.secret_key || draftConfig.secret_key,
                          })
                        }
                        className={`flex items-center gap-3 rounded-2xl border p-3.5 text-left transition ${
                          isSelected
                            ? 'border-brand-500 bg-brand-50/70 shadow-xs ring-2 ring-brand-400'
                            : 'border-slate-200 bg-white hover:border-slate-300'
                        }`}
                      >
                        <ProviderLogo providerId={p.providerType} label={p.name} size="md" />
                        <div className="min-w-0 flex-1">
                          <p className="text-xs font-bold text-slate-900 truncate">{p.name}</p>
                          <p className="text-[10px] text-slate-500 uppercase font-mono">
                            {p.providerType} {p.isDefault ? '· Default' : ''}
                          </p>
                        </div>
                        {isSelected && <CheckCircle2 className="h-4 w-4 text-brand-600" />}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Suppressions & Compliance Checks */}
              <div className="rounded-2xl border border-slate-200/90 bg-white p-4 space-y-3 shadow-2xs">
                <div className="flex items-center gap-2">
                  <ShieldCheck className="h-4 w-4 text-emerald-600" />
                  <span className="text-xs font-bold text-slate-900 uppercase tracking-wider">
                    Suppressions & Exclusions
                  </span>
                </div>
                <div className="grid gap-3 sm:grid-cols-2 text-xs font-medium text-slate-700">
                  <label className="flex items-center gap-2.5 p-2 rounded-xl border border-slate-100 bg-slate-50/50 hover:bg-slate-100/60 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={Boolean(draftConfig.exclude_unsubscribed)}
                      onChange={(e) => patchDraft({ exclude_unsubscribed: e.target.checked })}
                      className="rounded border-slate-300 text-brand-600 focus:ring-brand-500"
                    />
                    <span>Exclude Unsubscribed Recipients (Recommended)</span>
                  </label>

                  <label className="flex items-center gap-2.5 p-2 rounded-xl border border-slate-100 bg-slate-50/50 hover:bg-slate-100/60 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={Boolean(draftConfig.exclude_bounces)}
                      onChange={(e) => patchDraft({ exclude_bounces: e.target.checked })}
                      className="rounded border-slate-300 text-brand-600 focus:ring-brand-500"
                    />
                    <span>Exclude Hard Bounces & Spam Complaints</span>
                  </label>

                  <label className="flex items-center gap-2.5 p-2 rounded-xl border border-slate-100 bg-slate-50/50 hover:bg-slate-100/60 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={Boolean(draftConfig.apply_frequency_cap)}
                      onChange={(e) => patchDraft({ apply_frequency_cap: e.target.checked })}
                      className="rounded border-slate-300 text-brand-600 focus:ring-brand-500"
                    />
                    <span>Apply Frequency Cap (Max 1 email per 24h)</span>
                  </label>

                  <label className="flex items-center gap-2.5 p-2 rounded-xl border border-slate-100 bg-slate-50/50 hover:bg-slate-100/60 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={Boolean(draftConfig.respect_quiet_hours)}
                      onChange={(e) => patchDraft({ respect_quiet_hours: e.target.checked })}
                      className="rounded border-slate-300 text-brand-600 focus:ring-brand-500"
                    />
                    <span>Respect Customer Quiet Hours (9 PM - 8 AM)</span>
                  </label>
                </div>
              </div>

              {/* Template Choice: Start from Scratch vs Select from Template */}
              <div className="space-y-2.5">
                <label className="block text-xs font-bold text-slate-700">
                  How would you like to build this message?
                </label>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div
                    onClick={handleStartFromScratch}
                    className={`cursor-pointer rounded-2xl border p-4 transition ${
                      draftConfig.creation_mode === 'scratch'
                        ? 'border-brand-500 bg-brand-50/60 shadow-xs ring-2 ring-brand-400'
                        : 'border-slate-200 bg-white hover:border-slate-300'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-100 text-brand-700">
                        <FilePlus className="h-5 w-5" />
                      </div>
                      <div>
                        <h4 className="text-xs font-bold text-slate-900">Start from Scratch</h4>
                        <p className="text-[11px] text-slate-500 mt-0.5">
                          Build a custom email using visual drag & drop, rich HTML, or plain text.
                        </p>
                      </div>
                    </div>
                  </div>

                  <div
                    onClick={() => patchDraft({ creation_mode: 'template' })}
                    className={`cursor-pointer rounded-2xl border p-4 transition ${
                      draftConfig.creation_mode === 'template'
                        ? 'border-brand-500 bg-brand-50/60 shadow-xs ring-2 ring-brand-400'
                        : 'border-slate-200 bg-white hover:border-slate-300'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-100 text-amber-700">
                        <Sparkles className="h-5 w-5" />
                      </div>
                      <div>
                        <h4 className="text-xs font-bold text-slate-900">Select from Published Templates</h4>
                        <p className="text-[11px] text-slate-500 mt-0.5">
                          Load a pre-designed brand template ({publishedTemplates.length} available).
                        </p>
                      </div>
                    </div>
                  </div>
                </div>

                {draftConfig.creation_mode === 'template' && (
                  <div className="pt-2">
                    <select
                      value={String(draftConfig.content_template_id ?? '')}
                      onChange={(e) => {
                        const t = publishedTemplates.find((x) => x.id === e.target.value);
                        if (t) handleApplyTemplate(t);
                      }}
                      className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-xs font-semibold focus:border-brand-500 focus:outline-none"
                    >
                      <option value="">Choose a template to load…</option>
                      {publishedTemplates.map((t) => (
                        <option key={t.id} value={t.id}>
                          {t.name}
                        </option>
                      ))}
                    </select>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* STEP 2: MESSAGE CONTENT & DESIGN (FULL STUDIO) */}
          {currentStep === 2 && (
            <div className="space-y-4 animate-in fade-in">
              <div className="rounded-2xl border border-slate-200 bg-slate-50/40 p-4">
                <ChannelTemplateBuilder
                  channel={channel}
                  content={deliveryContent}
                  onChange={handleUpdateContent}
                  populationFields={populationFields}
                  populationSample={populationSample}
                />
              </div>
            </div>
          )}

          {/* STEP 3: MULTI-DEVICE & FORMAT PREVIEW */}
          {currentStep === 3 && (
            <div className="space-y-4 animate-in fade-in">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-black text-slate-900">Multi-Device & Format Preview</h3>
                  <p className="text-xs text-slate-500">
                    Verify how your message renders on Desktop, Tablet, and Mobile across HTML, AMP, and Plain Text.
                  </p>
                </div>
                <Button
                  size="sm"
                  onClick={() => setCurrentStep(2)}
                  variant="secondary"
                  className="text-xs font-bold"
                >
                  Edit in Template Studio
                </Button>
              </div>

              {channel === 'email' ? (
                <EmailTemplatePreview
                  content={deliveryContent as EmailContent}
                  fromName={String(draftConfig.from_name || 'Marbee Team')}
                  fromEmail={String(draftConfig.from_email || 'hello@yourdomain.com')}
                />
              ) : (
                <div className="rounded-2xl border border-slate-200 bg-slate-50/60 p-6 text-center text-xs text-slate-500">
                  Preview available for email channel. Content configured for {channelLabel(channel)}.
                </div>
              )}
            </div>
          )}

          {/* STEP 4: SENDER & ROUTING */}
          {currentStep === 4 && (
            <div className="space-y-5 max-w-2xl animate-in fade-in">
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <label className="mb-1 block text-xs font-bold text-slate-700">
                    Sender From Email (Override)
                  </label>
                  <input
                    type="email"
                    value={String(draftConfig.from_email ?? '')}
                    onChange={(e) => patchDraft({ from_email: e.target.value })}
                    placeholder="e.g. hello@yourdomain.com"
                    className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs focus:border-brand-500 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="mb-1 block text-xs font-bold text-slate-700">
                    Sender Display Name
                  </label>
                  <input
                    type="text"
                    value={String(draftConfig.from_name ?? '')}
                    onChange={(e) => patchDraft({ from_name: e.target.value })}
                    placeholder="e.g. Acme Team"
                    className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs focus:border-brand-500 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="mb-1 block text-xs font-bold text-slate-700">
                    Reply-To Email Address
                  </label>
                  <input
                    type="email"
                    value={String(draftConfig.reply_to ?? '')}
                    onChange={(e) => patchDraft({ reply_to: e.target.value })}
                    placeholder="e.g. support@yourdomain.com"
                    className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs focus:border-brand-500 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="mb-1 block text-xs font-bold text-slate-700">
                    Message Traffic Type
                  </label>
                  <select
                    value={String(draftConfig.message_traffic_type ?? 'promotional')}
                    onChange={(e) => patchDraft({ message_traffic_type: e.target.value })}
                    className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-medium focus:border-brand-500 focus:outline-none"
                  >
                    <option value="promotional">Promotional (Marketing & Newsletters)</option>
                    <option value="transactional">Transactional (Alerts, Orders, OTPs)</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="mb-1 block text-xs font-bold text-slate-700">
                  Campaign / Batch Tag
                </label>
                <input
                  type="text"
                  value={String(draftConfig.custom_campaign ?? draftConfig.tags ?? '')}
                  onChange={(e) => patchDraft({ custom_campaign: e.target.value, tags: e.target.value })}
                  placeholder="e.g. summer-blast-2026"
                  className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-mono focus:border-brand-500 focus:outline-none"
                />
              </div>
            </div>
          )}

          {/* STEP 5: TEST SEND */}
          {currentStep === 5 && (
            <div className="space-y-4 max-w-xl animate-in fade-in">
              <div className="rounded-2xl border border-amber-200 bg-amber-50/70 p-4 space-y-1 text-amber-950">
                <div className="flex items-center gap-2 font-bold text-xs">
                  <Zap className="h-4 w-4 text-amber-600" />
                  <span>Real-Time Diagnostic Test Send</span>
                </div>
                <p className="text-[11px] text-amber-900 leading-relaxed">
                  Sends a real live test message to your personal test email using your account provider (
                  <strong>{selectedProvider?.name || 'Default Account'}</strong>).
                </p>
              </div>

              <div>
                <label className="mb-1 block text-xs font-bold text-slate-700">
                  Test Recipient Address
                </label>
                <input
                  type="email"
                  value={testRecipient}
                  onChange={(e) => setTestRecipient(e.target.value)}
                  placeholder="your.email@example.com"
                  className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold focus:border-brand-500 focus:outline-none"
                />
              </div>

              {/* Optional Quick API Key Override */}
              <div className="space-y-1 pt-1">
                <label className="block text-[11px] font-bold text-slate-500 flex items-center justify-between">
                  <span className="flex items-center gap-1">
                    <Key className="h-3 w-3 text-brand-600" />
                    Resend / Mailjet API Key (Optional Override)
                  </span>
                  <span className="text-[10px] text-slate-400 font-normal">
                    Auto-loaded from Settings if left blank
                  </span>
                </label>
                <input
                  type="password"
                  value={overrideApiKey}
                  onChange={(e) => setOverrideApiKey(e.target.value)}
                  placeholder="re_123456789... (optional)"
                  className="w-full rounded-xl border border-slate-200 bg-white px-3 py-1.5 font-mono text-xs focus:border-brand-500 focus:outline-none"
                />
              </div>

              <Button
                onClick={handleRunLiveTest}
                disabled={testing || !testRecipient.trim()}
                className="bg-slate-900 hover:bg-slate-800 text-white font-bold rounded-xl shadow-xs"
              >
                {testing ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Sending Live Test…
                  </>
                ) : (
                  <>
                    <Send className="mr-1.5 h-4 w-4" />
                    Send Test Message Now
                  </>
                )}
              </Button>

              {testResult && (
                <div
                  className={`rounded-2xl border p-4 text-xs font-medium space-y-1 animate-in zoom-in-95 ${
                    testResult.ok
                      ? 'border-emerald-200 bg-emerald-50 text-emerald-950'
                      : 'border-rose-200 bg-rose-50 text-rose-950'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <p className="font-bold">
                      {testResult.ok ? '✓ Test Message Dispatched Successfully!' : '✗ Test Dispatch Failed'}
                    </p>
                    {testResult.latencyMs && (
                      <span className="font-mono text-[10px] text-slate-500">
                        {testResult.latencyMs}ms
                      </span>
                    )}
                  </div>
                  <p className="text-[11px] opacity-90">{testResult.message}</p>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer Navigation */}
        <div className="flex items-center justify-between border-t border-slate-100 bg-slate-50/90 px-6 py-4">
          <div>
            {currentStep > 1 ? (
              <Button
                variant="secondary"
                onClick={() => setCurrentStep((prev) => Math.max(1, prev - 1) as ModalStep)}
                className="font-bold text-xs"
              >
                <ArrowLeft className="mr-1.5 h-3.5 w-3.5" />
                Back
              </Button>
            ) : (
              <Button variant="secondary" onClick={onClose}>
                Cancel
              </Button>
            )}
          </div>

          <div className="flex items-center gap-2.5">
            {currentStep < 5 ? (
              <Button
                onClick={() => setCurrentStep((prev) => Math.min(5, prev + 1) as ModalStep)}
                className="bg-brand-600 hover:bg-brand-700 text-white font-bold rounded-xl shadow-xs text-xs"
              >
                Continue to Next Step
                <ArrowRight className="ml-1.5 h-3.5 w-3.5" />
              </Button>
            ) : null}

            <Button
              className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl shadow-xs text-xs"
              onClick={() => {
                onSave(draftConfig);
                onClose();
              }}
            >
              <Check className="mr-1.5 h-4 w-4" />
              Apply & Save Delivery Configuration
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
