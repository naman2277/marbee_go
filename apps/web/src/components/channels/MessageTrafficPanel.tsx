import { useState } from 'react';
import { Info } from 'lucide-react';
import { Card } from '@/components/ui';
import { ChannelProviderForm } from '@/components/channels/ChannelProviderForm';
import type { ChannelType } from '@/lib/channel-registry';
import { getProviderDefinition } from '@/lib/channel-registry';
import {
  getMessageTrafficLabel,
  getTrafficRoutingFields,
  type MessageTrafficConfig,
  type MessageTrafficType,
} from '@/lib/message-traffic';

type MessageTrafficPanelProps = {
  channel: ChannelType;
  providerType: string;
  value: MessageTrafficConfig;
  onChange: (value: MessageTrafficConfig) => void;
  focusFieldKey?: string | null;
  disabled?: boolean;
};

export function MessageTrafficPanel({
  channel,
  providerType,
  value,
  onChange,
  focusFieldKey,
  disabled,
}: MessageTrafficPanelProps) {
  const [activeTab, setActiveTab] = useState<MessageTrafficType>('transactional');
  const providerDef = getProviderDefinition(channel, providerType);
  const routingFields = getTrafficRoutingFields(channel);
  const profile = value[activeTab];
  const meta = getMessageTrafficLabel(activeTab);

  const patchValues = (type: MessageTrafficType, key: string, fieldValue: string) => {
    onChange({
      ...value,
      [type]: {
        ...value[type],
        values: { ...value[type].values, [key]: fieldValue },
      },
    });
  };

  const patchRouting = (type: MessageTrafficType, key: string, fieldValue: string) => {
    onChange({
      ...value,
      [type]: {
        ...value[type],
        routing: { ...value[type].routing, [key]: fieldValue },
      },
    });
  };

  const setEnabled = (type: MessageTrafficType, enabled: boolean) => {
    onChange({
      ...value,
      [type]: { ...value[type], enabled },
    });
  };

  if (!providerDef) return null;

  return (
    <Card className="mt-6 overflow-hidden">
      <div className="border-b border-slate-100 px-5 py-4">
        <h4 className="text-sm font-semibold text-slate-900">Transactional & promotional accounts</h4>
        <p className="mt-0.5 text-xs text-slate-500">
          Each tab is a full provider setup (API keys, senders, credentials) plus delivery routing. Accounts can be
          completely different between transactional and promotional.
        </p>
      </div>

      <div className="flex border-b border-slate-100">
        {(['transactional', 'promotional'] as const).map((type) => {
          const label = getMessageTrafficLabel(type);
          const enabled = value[type].enabled;
          return (
            <button
              key={type}
              type="button"
              onClick={() => setActiveTab(type)}
              className={`flex-1 px-4 py-3 text-left text-sm transition-colors ${
                activeTab === type
                  ? 'border-b-2 border-brand-600 bg-brand-50/50 text-brand-800'
                  : 'text-slate-600 hover:bg-slate-50'
              }`}
            >
              <span className="font-medium">{label.title}</span>
              <span
                className={`ml-2 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase ${
                  enabled ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'
                }`}
              >
                {enabled ? 'On' : 'Off'}
              </span>
            </button>
          );
        })}
      </div>

      <div className="space-y-6 p-5">
        <div className="flex items-start gap-3 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
          <Info className="mt-0.5 h-4 w-4 shrink-0 text-brand-600" />
          <div className="text-sm text-slate-600">
            <p className="font-medium text-slate-800">{meta.title} account</p>
            <p className="mt-0.5">{meta.description}</p>
          </div>
        </div>

        <label className="flex cursor-pointer items-center justify-between gap-4 rounded-lg border border-slate-200 px-4 py-3">
          <span className="text-sm font-medium text-slate-800">Enable {meta.title.toLowerCase()} account</span>
          <input
            type="checkbox"
            checked={profile.enabled}
            onChange={(e) => setEnabled(activeTab, e.target.checked)}
            className="h-4 w-4"
          />
        </label>

        {profile.enabled && (
          <>
            <div>
              <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-400">Provider account</p>
              <ChannelProviderForm
                channel={channel}
                providerType={providerType}
                fields={providerDef.fields}
                values={profile.values}
                onChange={(key, fieldValue) => patchValues(activeTab, key, fieldValue)}
                disabled={disabled}
                focusFieldKey={focusFieldKey}
              />
            </div>

            {routingFields.length > 0 && (
              <div>
                <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-400">
                  Delivery & compliance routing
                </p>
                <div className="grid gap-4 sm:grid-cols-2">
                  {routingFields.map((field) => (
                    <div key={field.key} className={field.key === 'notes' ? 'sm:col-span-2' : ''}>
                      <label className="block text-sm font-medium text-slate-700">{field.label}</label>
                      {field.help && <p className="mt-0.5 text-xs text-slate-500">{field.help}</p>}
                      <input
                        type="text"
                        value={profile.routing[field.key] ?? ''}
                        onChange={(e) => patchRouting(activeTab, field.key, e.target.value)}
                        placeholder={field.placeholder}
                        disabled={disabled}
                        className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm disabled:bg-slate-50"
                      />
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </Card>
  );
}
