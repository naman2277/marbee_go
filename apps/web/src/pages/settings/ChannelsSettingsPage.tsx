import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Check,
  ChevronRight,
  ExternalLink,
  Mail,
  MessageCircle,
  MessageSquare,
  Plus,
  Radio,
  Save,
  Send,
  Share2,
  Trash2,
  Webhook,
  Globe,
} from 'lucide-react';
import { PageHeader, Card, Button, Badge, EmptyState } from '@/components/ui';
import { RequirePermission } from '@/components/auth/RequirePermission';
import { useTenantScope } from '@/contexts/AuthContext';
import { PERMISSIONS } from '@/lib/permissions';
import {
  CHANNEL_DEFINITIONS,
  getChannelDefinition,
  getProviderDefinition,
  validateProviderValues,
  type ChannelType,
} from '@/lib/channel-registry';
import {
  channelConfigured,
  deleteChannelProvider,
  fetchChannelProviders,
  getProviderMessageTraffic,
  providerToFormValues,
  saveChannelProvider,
  setDefaultChannelProvider,
  type ChannelProviderRow,
} from '@/lib/channel-providers';
import { ChannelProviderForm } from '@/components/channels/ChannelProviderForm';
import { WebPushBehaviorPanel } from '@/components/channels/WebPushBehaviorPanel';
import { ProviderLogo } from '@/components/channels/ProviderLogo';
import { ProviderSetupAgent, ProviderSetupAgentTrigger } from '@/components/channels/ProviderSetupAgent';
import { MessageTrafficPanel } from '@/components/channels/MessageTrafficPanel';
import { TestChannelModal } from '@/components/channels/TestChannelModal';
import { SocialConnectionsManager } from '@/components/social/SocialConnectionsManager';
import { DEFAULT_WEB_PUSH_BEHAVIOR, parseWebPushBehavior, type WebPushBehaviorConfig } from '@/lib/web-push-config';
import {
  channelSupportsMessageTraffic,
  DEFAULT_MESSAGE_TRAFFIC,
  messageTrafficSummary,
  validateMessageTrafficConfig,
  type MessageTrafficConfig,
} from '@/lib/message-traffic';

const CHANNEL_ICONS: Record<ChannelType, typeof Mail> = {
  email: Mail,
  sms: MessageSquare,
  whatsapp: MessageCircle,
  web_push: Radio,
  rcs: MessageCircle,
  api: Webhook,
  social: Share2,
};

type EditorMode = { kind: 'new'; providerType: string } | { kind: 'edit'; provider: ChannelProviderRow };

export function ChannelsSettingsPage() {
  const { tenantId, environment } = useTenantScope();
  const [searchParams, setSearchParams] = useSearchParams();
  const queryClient = useQueryClient();

  const initialTab = (searchParams.get('tab') || searchParams.get('channel')) as ChannelType | null;
  const [selectedChannel, setSelectedChannel] = useState<ChannelType>(
    initialTab && ['email', 'sms', 'whatsapp', 'web_push', 'rcs', 'api', 'social'].includes(initialTab)
      ? initialTab
      : 'email',
  );
  const [editor, setEditor] = useState<EditorMode | null>(null);
  const [formName, setFormName] = useState('');
  const [formValues, setFormValues] = useState<Record<string, string>>({});
  const [webPushBehavior, setWebPushBehavior] = useState<WebPushBehaviorConfig>(DEFAULT_WEB_PUSH_BEHAVIOR);
  const [messageTraffic, setMessageTraffic] = useState<MessageTrafficConfig>(DEFAULT_MESSAGE_TRAFFIC);
  const [formError, setFormError] = useState<string | null>(null);
  const [savedFlash, setSavedFlash] = useState(false);
  const [agentOpen, setAgentOpen] = useState(false);
  const [focusFieldKey, setFocusFieldKey] = useState<string | null>(null);
  const [testModal, setTestModal] = useState<{
    open: boolean;
    channel: string;
    providerType: string;
    providerName: string;
    values: Record<string, string>;
    id?: string;
  } | null>(null);

  const lastLoadedIdRef = useRef<string | null>(null);

  const providersQuery = useQuery({
    queryKey: ['channel-providers', tenantId, environment],
    queryFn: () => fetchChannelProviders(tenantId, environment),
    enabled: Boolean(tenantId),
    refetchOnWindowFocus: false,
  });

  const channelDef = getChannelDefinition(selectedChannel);
  const channelProviders = useMemo(
    () => (providersQuery.data ?? []).filter((p) => p.channel === selectedChannel),
    [providersQuery.data, selectedChannel],
  );

  const editorProviderType =
    editor?.kind === 'edit' ? editor.provider.providerType : editor?.kind === 'new' ? editor.providerType : null;
  const editorDef = editorProviderType ? getProviderDefinition(selectedChannel, editorProviderType) : null;

  useEffect(() => {
    if (!editor) {
      lastLoadedIdRef.current = null;
      return;
    }
    const currentKey =
      editor.kind === 'edit'
        ? `edit:${editor.provider.id}`
        : `new:${selectedChannel}:${editor.providerType}`;

    if (lastLoadedIdRef.current === currentKey) {
      return;
    }
    lastLoadedIdRef.current = currentKey;

    if (editor.kind === 'edit') {
      setFormName(editor.provider.name);
      setFormValues(providerToFormValues(editor.provider));
      if (editor.provider.channel === 'web_push' && editor.provider.providerType === 'firebase') {
        setWebPushBehavior(parseWebPushBehavior(editor.provider.config));
      } else {
        setWebPushBehavior(DEFAULT_WEB_PUSH_BEHAVIOR);
      }
      setMessageTraffic(getProviderMessageTraffic(editor.provider));
    } else {
      const def = getProviderDefinition(selectedChannel, editor.providerType);
      setFormName(def?.label ?? editor.providerType);
      setFormValues({});
      setWebPushBehavior(DEFAULT_WEB_PUSH_BEHAVIOR);
      setMessageTraffic(DEFAULT_MESSAGE_TRAFFIC);
    }
    setFormError(null);
    setAgentOpen(true);
  }, [editor, selectedChannel]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!editor || !editorProviderType) throw new Error('Nothing to save');

      const usesTraffic = channelSupportsMessageTraffic(selectedChannel);

      if (!usesTraffic) {
        const errors = validateProviderValues(selectedChannel, editorProviderType, formValues);
        if (errors.length) throw new Error(errors[0]);
      }

      if (usesTraffic) {
        const trafficErrors = validateMessageTrafficConfig(selectedChannel, editorProviderType, messageTraffic);
        if (trafficErrors.length) throw new Error(trafficErrors[0]);
      }

      const extraConfig: Record<string, unknown> = {};
      if (selectedChannel === 'web_push' && editorProviderType === 'firebase') {
        extraConfig.web_push = webPushBehavior;
        if (formValues.project_id?.trim() && !formValues.auth_domain?.trim()) {
          formValues.auth_domain = `${formValues.project_id.trim()}.firebaseapp.com`;
        }
      }

      return saveChannelProvider({
        id: editor.kind === 'edit' ? editor.provider.id : undefined,
        tenantId,
        environment,
        channel: selectedChannel,
        providerType: editorProviderType,
        name: formName,
        values: usesTraffic ? {} : formValues,
        messageTraffic: usesTraffic ? messageTraffic : undefined,
        isDefault: editor.kind === 'edit' ? editor.provider.isDefault : channelProviders.length === 0,
        extraConfig,
      });
    },
    onSuccess: (savedRow) => {
      void queryClient.invalidateQueries({ queryKey: ['channel-providers'] });
      void queryClient.invalidateQueries({ queryKey: ['channel-provider'] });
      void queryClient.invalidateQueries({ queryKey: ['web-push-subscriber-stats'] });
      if (savedRow) {
        lastLoadedIdRef.current = `edit:${savedRow.id}`;
        setEditor({ kind: 'edit', provider: savedRow });
        setFormValues(providerToFormValues(savedRow));
      }
      setSavedFlash(true);
      setTimeout(() => setSavedFlash(false), 2500);
      setFormError(null);
    },
    onError: (err: Error) => setFormError(err.message),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteChannelProvider(id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['channel-providers'] });
      setEditor(null);
    },
  });

  const defaultMutation = useMutation({
    mutationFn: (provider: ChannelProviderRow) =>
      setDefaultChannelProvider(provider.id, tenantId, environment, provider.channel),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['channel-providers'] }),
  });

  const configuredCount = useMemo(() => {
    const all = providersQuery.data ?? [];
    return CHANNEL_DEFINITIONS.filter((c) => channelConfigured(all, c.id)).length;
  }, [providersQuery.data]);

  return (
    <RequirePermission permission={PERMISSIONS.SETTINGS_CHANNELS_MANAGE}>
      <div>
        <PageHeader
          title="Channels"
          description="Bring your own providers — configure email, SMS, WhatsApp, push, RCS, and custom APIs per environment."
        />

        <div className="mb-6 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">
          <strong className="font-medium text-slate-900">BYOP model.</strong> Connect your own SendGrid, Twilio,
          Firebase, or any provider. Hover the <strong>(i)</strong> icon on each field for guidance, or open the{' '}
          <strong>Setup agent</strong> while configuring a provider.
          <span className="ml-2 text-slate-500">
            {configuredCount}/{CHANNEL_DEFINITIONS.length} channels active in {environment}.
          </span>
        </div>

        <div className="grid gap-6 lg:grid-cols-[240px_1fr]">
          <Card className="h-fit overflow-hidden p-2">
            <nav className="space-y-0.5">
              {CHANNEL_DEFINITIONS.map((channel) => {
                const Icon = CHANNEL_ICONS[channel.id];
                const active = selectedChannel === channel.id;
                const configured = channelConfigured(providersQuery.data ?? [], channel.id);
                return (
                  <button
                    key={channel.id}
                    type="button"
                    onClick={() => {
                      setSelectedChannel(channel.id);
                      setSearchParams({ tab: channel.id }, { replace: true });
                      setEditor(null);
                      setAgentOpen(false);
                    }}
                    className={`flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm transition-colors ${
                      active ? 'bg-brand-50 text-brand-800' : 'text-slate-700 hover:bg-slate-50'
                    }`}
                  >
                    <Icon className={`h-4 w-4 shrink-0 ${active ? 'text-brand-600' : 'text-slate-400'}`} />
                    <span className="flex-1 font-medium">{channel.label}</span>
                    {configured ? (
                      <Check className="h-3.5 w-3.5 text-emerald-600" />
                    ) : (
                      <span className="h-2 w-2 rounded-full bg-slate-200" />
                    )}
                  </button>
                );
              })}
            </nav>
          </Card>

          <div className="space-y-6">
            {selectedChannel === 'social' ? (
              <SocialConnectionsManager tenantId={tenantId} environment={environment} />
            ) : (
              <>
                {selectedChannel === 'email' && !editor && (
                  <Link
                    to="/settings/email-domains"
                    className="flex items-center gap-4 rounded-xl border border-brand-200 bg-brand-50/60 px-5 py-4 transition-colors hover:bg-brand-50"
                  >
                    <Globe className="h-6 w-6 shrink-0 text-brand-600" />
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold text-slate-900">Marbee Mail · Sending domains</p>
                      <p className="text-sm text-slate-600">
                        Send through Marbee's managed email infrastructure — verify your domain and add sender addresses. No provider account needed.
                      </p>
                    </div>
                    <ChevronRight className="h-5 w-5 shrink-0 text-brand-500" />
                  </Link>
                )}
                {channelDef && (
                  <Card>
                  <div className="flex flex-wrap items-start justify-between gap-4 border-b border-slate-100 px-6 py-4">
                    <div>
                      <h2 className="text-lg font-semibold text-slate-900">{channelDef.label}</h2>
                      <p className="mt-0.5 text-sm text-slate-500">{channelDef.description}</p>
                    </div>
                    {!editor && (
                      <ProviderPicker
                        providers={channelDef.providers}
                        onSelect={(providerType) => setEditor({ kind: 'new', providerType })}
                      />
                    )}
                  </div>

                {!editor && channelProviders.length === 0 && (
                  <EmptyState
                    title="No provider configured"
                    description={`Add a ${channelDef.label.toLowerCase()} provider to enable sends in ${environment}.`}
                    action={
                      <ProviderPicker
                        providers={channelDef.providers}
                        onSelect={(providerType) => setEditor({ kind: 'new', providerType })}
                        label="Add provider"
                      />
                    }
                  />
                )}

                {!editor && channelProviders.length > 0 && (
                  <div className="divide-y divide-slate-100">
                    {channelProviders.map((provider) => {
                      const def = getProviderDefinition(provider.channel, provider.providerType);
                      return (
                        <div key={provider.id} className="flex flex-wrap items-center gap-4 px-6 py-4">
                          <ProviderLogo
                            providerId={provider.providerType}
                            label={def?.label ?? provider.providerType}
                            size="md"
                          />
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <p className="font-medium text-slate-900">{provider.name}</p>
                              <Badge variant="default">{def?.label ?? provider.providerType}</Badge>
                              {provider.isDefault && <Badge variant="success">Default</Badge>}
                              {provider.status === 'disabled' && <Badge variant="warning">Disabled</Badge>}
                              {channelSupportsMessageTraffic(provider.channel) &&
                                messageTrafficSummary(getProviderMessageTraffic(provider)).map(
                                  (label) => (
                                    <Badge key={label} variant="default">
                                      {label}
                                    </Badge>
                                  ),
                                )}
                            </div>
                            <p className="mt-0.5 text-xs text-slate-500">
                              Updated {new Date(provider.updatedAt).toLocaleString()}
                            </p>
                          </div>
                          <div className="flex flex-wrap gap-2">
                            {!provider.isDefault && (
                              <Button
                                size="sm"
                                variant="secondary"
                                onClick={() => defaultMutation.mutate(provider)}
                                disabled={defaultMutation.isPending}
                              >
                                Set default
                              </Button>
                            )}
                            <Button
                              size="sm"
                              variant="secondary"
                              className="border-brand-200 bg-brand-50/50 text-brand-700 hover:bg-brand-100 hover:text-brand-800"
                              onClick={() =>
                                setTestModal({
                                  open: true,
                                  id: provider.id,
                                  channel: provider.channel,
                                  providerType: provider.providerType,
                                  providerName: provider.name,
                                  values: providerToFormValues(provider),
                                })
                              }
                            >
                              <Send className="mr-1 h-3.5 w-3.5" />
                              Test
                            </Button>
                            <Button size="sm" variant="secondary" onClick={() => setEditor({ kind: 'edit', provider })}>
                              Edit
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              className="text-red-600 hover:bg-red-50"
                              onClick={() => {
                                if (window.confirm(`Remove "${provider.name}"?`)) deleteMutation.mutate(provider.id);
                              }}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}

                {editor && editorDef && (
                  <div className="p-6">
                    <div className="mb-6 flex flex-wrap items-center gap-2 text-sm text-slate-500">
                      <button type="button" className="hover:text-slate-800" onClick={() => { setEditor(null); setAgentOpen(false); }}>
                        {channelDef.label}
                      </button>
                      <ChevronRight className="h-4 w-4" />
                      <span className="font-medium text-slate-900">
                        {editor.kind === 'edit' ? 'Edit provider' : 'New provider'}
                      </span>
                    </div>

                    <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
                      <div className="flex items-start gap-3">
                        <ProviderLogo providerId={editorProviderType!} label={editorDef.label} size="lg" />
                        <div>
                          <h3 className="text-base font-semibold text-slate-900">{editorDef.label}</h3>
                          <p className="mt-0.5 text-sm text-slate-500">{editorDef.description}</p>
                          {editorDef.docsUrl && (
                            <a
                              href={editorDef.docsUrl}
                              target="_blank"
                              rel="noreferrer"
                              className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-brand-600 hover:text-brand-700"
                            >
                              Provider docs
                              <ExternalLink className="h-3 w-3" />
                            </a>
                          )}
                        </div>
                      </div>
                      <Button variant="secondary" size="sm" onClick={() => setAgentOpen(true)}>
                        Open setup agent
                      </Button>
                    </div>

                    <div className="mb-6 max-w-xl">
                      <label className="block text-sm font-medium text-slate-700">Display name</label>
                      <input
                        type="text"
                        value={formName}
                        onChange={(e) => setFormName(e.target.value)}
                        className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                      />
                    </div>

                    {!channelSupportsMessageTraffic(selectedChannel) && (
                      <ChannelProviderForm
                        channel={selectedChannel}
                        providerType={editorProviderType!}
                        fields={editorDef.fields}
                        values={formValues}
                        onChange={(key, value) => setFormValues((prev) => ({ ...prev, [key]: value }))}
                        disabled={saveMutation.isPending}
                        focusFieldKey={focusFieldKey}
                      />
                    )}

                    {channelSupportsMessageTraffic(selectedChannel) && (
                      <MessageTrafficPanel
                        channel={selectedChannel}
                        providerType={editorProviderType!}
                        value={messageTraffic}
                        onChange={setMessageTraffic}
                        disabled={saveMutation.isPending}
                        focusFieldKey={focusFieldKey}
                      />
                    )}

                    {selectedChannel === 'web_push' && editorProviderType === 'firebase' && (
                      <div className="mt-8">
                        <WebPushBehaviorPanel
                          tenantId={tenantId}
                          environment={environment}
                          behavior={webPushBehavior}
                          onChange={setWebPushBehavior}
                          onBeforeTest={async () => {
                            const row = await saveMutation.mutateAsync();
                            return row.id;
                          }}
                        />
                      </div>
                    )}

                    {formError && <p className="mt-4 text-sm text-red-600">{formError}</p>}
                    {savedFlash && <p className="mt-4 text-sm text-emerald-600">Provider saved.</p>}

                    <div className="mt-6 flex flex-wrap gap-3 border-t border-slate-100 pt-6">
                      <Button onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending || !formName.trim()}>
                        <Save className="mr-2 h-4 w-4" />
                        {saveMutation.isPending ? 'Saving…' : 'Save provider'}
                      </Button>
                      <Button
                        type="button"
                        variant="secondary"
                        className="border-brand-200 bg-brand-50/60 text-brand-700 hover:bg-brand-100 hover:text-brand-800 font-semibold"
                        onClick={() =>
                          setTestModal({
                            open: true,
                            id: editor.kind === 'edit' ? editor.provider.id : undefined,
                            channel: selectedChannel,
                            providerType: editorProviderType!,
                            providerName: formName || editorDef.label,
                            values: formValues,
                          })
                        }
                      >
                        <Send className="mr-1.5 h-4 w-4" />
                        Test Connection
                      </Button>
                      <Button variant="secondary" onClick={() => { setEditor(null); setAgentOpen(false); }}>
                        Cancel
                      </Button>
                    </div>
                  </div>
                )}
              </Card>
            )}

            {!editor && channelDef && channelDef.providers.length > 1 && (
              <Card className="p-6">
                <h3 className="text-sm font-semibold text-slate-900">Available adapters</h3>
                <ul className="mt-3 space-y-3">
                  {channelDef.providers.map((p) => (
                    <li
                      key={p.id}
                      className="flex items-center justify-between gap-4 rounded-xl border border-slate-100 px-4 py-3"
                    >
                      <div className="flex min-w-0 items-start gap-3">
                        <ProviderLogo providerId={p.id} label={p.label} size="md" />
                        <div>
                          <p className="font-medium text-slate-800">{p.label}</p>
                          <p className="text-sm text-slate-500">{p.description}</p>
                        </div>
                      </div>
                      <Button size="sm" variant="ghost" onClick={() => setEditor({ kind: 'new', providerType: p.id })}>
                        Configure
                      </Button>
                    </li>
                  ))}
                </ul>
              </Card>
            )}
          </>
        )}
      </div>
    </div>

        {editor && editorDef && editorProviderType && agentOpen && (
          <>
            <button
              type="button"
              className="fixed inset-0 z-[140] bg-slate-900/20 backdrop-blur-[1px]"
              aria-label="Close setup agent overlay"
              onClick={() => setAgentOpen(false)}
            />
            <ProviderSetupAgent
              channel={selectedChannel}
              providerType={editorProviderType}
              providerLabel={editorDef.label}
              formValues={formValues}
              docsUrl={editorDef.docsUrl}
              onClose={() => setAgentOpen(false)}
              onFocusField={(key) => {
                setFocusFieldKey(key);
                setAgentOpen(false);
                requestAnimationFrame(() => {
                  document.getElementById(`field-${key}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
                });
                setTimeout(() => setFocusFieldKey(null), 2500);
              }}
            />
          </>
        )}

        {editor && editorDef && !agentOpen && (
          <ProviderSetupAgentTrigger onClick={() => setAgentOpen(true)} />
        )}

        {testModal && (
          <TestChannelModal
            open={testModal.open}
            onClose={() => setTestModal(null)}
            channel={testModal.channel}
            providerType={testModal.providerType}
            providerName={testModal.providerName}
            values={testModal.values}
            onSaveCredentials={async (newValues) => {
              if (editor && editor.kind === 'edit') {
                setFormValues(newValues);
              }
              await saveChannelProvider({
                id: testModal.id,
                tenantId,
                environment,
                channel: testModal.channel as any,
                providerType: testModal.providerType,
                name: testModal.providerName,
                values: newValues,
                isDefault: true,
              });
              void queryClient.invalidateQueries({ queryKey: ['channel-providers'] });
            }}
          />
        )}
      </div>
    </RequirePermission>
  );
}

function ProviderPicker({
  providers,
  onSelect,
  label = 'Add provider',
}: {
  providers: Array<{ id: string; label: string }>;
  onSelect: (providerType: string) => void;
  label?: string;
}) {
  const [open, setOpen] = useState(false);

  return (
    <div className="relative">
      <Button onClick={() => setOpen((v) => !v)}>
        <Plus className="mr-2 h-4 w-4" />
        {label}
      </Button>
      {open && (
        <>
          <button type="button" className="fixed inset-0 z-10" aria-label="Close menu" onClick={() => setOpen(false)} />
          <div className="absolute right-0 z-20 mt-2 w-64 rounded-xl border border-slate-200 bg-white py-1 shadow-lg">
            {providers.map((p) => (
              <button
                key={p.id}
                type="button"
                className="flex w-full items-center gap-3 px-3 py-2.5 text-left text-sm text-slate-700 hover:bg-slate-50"
                onClick={() => {
                  onSelect(p.id);
                  setOpen(false);
                }}
              >
                <ProviderLogo providerId={p.id} label={p.label} size="sm" />
                {p.label}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
