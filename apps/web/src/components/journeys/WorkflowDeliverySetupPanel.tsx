import { useState } from 'react';
import {
  Mail,
  Maximize2,
  MessageSquare,
  Sparkles,
} from 'lucide-react';
import { Button } from '@/components/ui';
import { ProviderLogo } from '@/components/channels/ProviderLogo';
import { DeliveryConfigModal } from '@/components/journeys/DeliveryConfigModal';
import {
  channelLabel,
  type ContentChannel,
  type MarbeeContentTemplate,
} from '@/lib/content-templates';
import type { ChannelProviderRow } from '@/lib/channel-providers';

type Props = {
  channel: ContentChannel;
  config: Record<string, unknown>;
  templates: MarbeeContentTemplate[];
  providers: ChannelProviderRow[];
  onChange: (patch: Record<string, unknown>) => void;
  variant?: 'light' | 'dark';
  populationFields?: import('@/lib/template-personalization').PopulationFieldDef[];
  populationSample?: Record<string, unknown> | null;
};

export function deliveryChannelForStep(stepType: string): ContentChannel | null {
  switch (stepType) {
    case 'send_email':
      return 'email';
    case 'send_sms':
      return 'sms';
    case 'send_whatsapp':
      return 'whatsapp';
    case 'send_web_push':
      return 'web_push';
    case 'send_rcs':
      return 'rcs';
    default:
      return null;
  }
}

export function WorkflowDeliverySetupPanel({
  channel,
  config,
  templates,
  providers,
  onChange,
  populationFields,
  populationSample,
}: Props) {
  const [modalOpen, setModalOpen] = useState(false);

  const deliveryName = String(config.delivery_name || `${channelLabel(channel)} Step`);
  const templateName = String(config.content_template_name || 'Custom Message Body');
  const subject = String(config.subject || config.title || '');
  const providerName = String(config.channel_provider_name || 'Default Account');
  const providerType = String(config.channel_provider_type || (channel === 'email' ? 'resend' : 'system'));

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-extrabold uppercase tracking-wider text-slate-500 flex items-center gap-1.5">
          {channel === 'email' ? (
            <Mail className="h-3.5 w-3.5 text-brand-600" />
          ) : (
            <MessageSquare className="h-3.5 w-3.5 text-brand-600" />
          )}
          {channelLabel(channel)} Delivery Setup
        </span>
        <span className="rounded-full bg-brand-50 px-2 py-0.5 text-[10px] font-bold text-brand-700">
          Configured
        </span>
      </div>

      {/* Clean Uncluttered Delivery Summary Card */}
      <div className="rounded-2xl border border-slate-200/90 bg-slate-50/60 p-4 space-y-3 shadow-2xs">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs font-bold text-slate-900">{deliveryName}</p>
            <p className="text-[11px] text-slate-500 mt-0.5 flex items-center gap-1">
              <Sparkles className="h-3 w-3 text-brand-500" />
              <span>{templateName}</span>
            </p>
          </div>
          <ProviderLogo providerId={providerType} label={providerName} size="sm" />
        </div>

        {subject && (
          <div className="rounded-xl bg-white p-2.5 border border-slate-200/80">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wide block">
              Subject Line:
            </span>
            <p className="text-xs font-semibold text-slate-800 truncate mt-0.5">{subject}</p>
          </div>
        )}

        {/* Action Button: Opens Full Modal Studio */}
        <Button
          onClick={() => setModalOpen(true)}
          className="w-full bg-brand-600 hover:bg-brand-700 text-white font-bold text-xs py-2.5 rounded-xl shadow-xs flex items-center justify-center gap-2"
        >
          <Maximize2 className="h-3.5 w-3.5" />
          Open Message & Delivery Studio (Modal)
        </Button>
      </div>

      {/* Spacious Full Screen Modal */}
      {modalOpen && (
        <DeliveryConfigModal
          open={modalOpen}
          channel={channel}
          config={config}
          templates={templates}
          providers={providers}
          onClose={() => setModalOpen(false)}
          onSave={onChange}
          populationFields={populationFields}
          populationSample={populationSample}
        />
      )}
    </div>
  );
}
