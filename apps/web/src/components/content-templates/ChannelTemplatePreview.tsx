import { useMemo, useState } from 'react';
import type { ContentChannel, TemplateContent } from '@/lib/content-templates';
import {
  DEFAULT_POPULATION_FIELDS,
  contextFromPopulationSample,
  personalizeContent,
  type PopulationFieldDef,
} from '@/lib/template-personalization';
import { EmailTemplatePreview } from './EmailTemplatePreview';
import { SmsTemplatePreview } from './SmsTemplateBuilder';
import { WebPushTemplatePreview } from './WebPushTemplateBuilder';
import { WhatsAppTemplatePreview } from './WhatsAppTemplatePreview';
import { RcsTemplatePreview } from './RcsTemplateBuilder';

type Props = {
  channel: ContentChannel;
  content: TemplateContent;
  compact?: boolean;
  populationFields?: PopulationFieldDef[];
  populationSample?: Record<string, unknown> | null;
  personalizePreview?: boolean;
};

export function ChannelTemplatePreview({
  channel,
  content,
  compact,
  populationFields = DEFAULT_POPULATION_FIELDS,
  populationSample,
  personalizePreview = true,
}: Props) {
  const [enabled, setEnabled] = useState(personalizePreview);

  const displayContent = useMemo(() => {
    if (!enabled) return content;
    const ctx = contextFromPopulationSample(populationSample ?? undefined, populationFields);
    return personalizeContent(channel, content, ctx);
  }, [channel, content, enabled, populationFields, populationSample]);

  const preview = (() => {
    switch (channel) {
      case 'email':
        return <EmailTemplatePreview content={displayContent as import('@/lib/content-templates').EmailContent} />;
      case 'sms':
        return <SmsTemplatePreview content={displayContent as import('@/lib/content-templates').SmsContent} />;
      case 'whatsapp':
        return (
          <WhatsAppTemplatePreview
            content={displayContent as import('@/lib/content-templates').WhatsAppContent}
            compact={compact}
          />
        );
      case 'web_push':
        return <WebPushTemplatePreview content={displayContent as import('@/lib/content-templates').WebPushContent} />;
      case 'rcs':
        return <RcsTemplatePreview content={displayContent as import('@/lib/content-templates').RcsContent} />;
      default:
        return null;
    }
  })();

  return (
    <div>
      <label className="mb-3 flex items-center justify-end gap-2 text-[11px] text-slate-500">
        <input
          type="checkbox"
          checked={enabled}
          onChange={(e) => setEnabled(e.target.checked)}
          className="rounded border-slate-300"
        />
        Show personalised preview
      </label>
      {preview}
    </div>
  );
}
