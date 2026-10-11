import type { ContentChannel, TemplateContent } from '@/lib/content-templates';
import {
  DEFAULT_POPULATION_FIELDS,
  insertPopulationTag,
  type PopulationFieldDef,
} from '@/lib/template-personalization';
import { EmailTemplateStudio } from './EmailTemplateStudio';
import { SmsTemplateBuilder } from './SmsTemplateBuilder';
import { WebPushTemplateBuilder } from './WebPushTemplateBuilder';
import { WhatsAppTemplateBuilder } from './WhatsAppTemplateBuilder';
import { RcsTemplateBuilder } from './RcsTemplateBuilder';
import { TemplatePersonalizationPanel } from './TemplatePersonalizationPanel';
import { TemplatePersonalizationProvider } from './PersonalizedField';

type Props = {
  channel: ContentChannel;
  content: TemplateContent;
  onChange: (content: TemplateContent) => void;
  populationFields?: PopulationFieldDef[];
  populationSample?: Record<string, unknown> | null;
  variant?: 'light' | 'dark';
};

export function ChannelTemplateBuilder({
  channel,
  content,
  onChange,
  populationFields = DEFAULT_POPULATION_FIELDS,
  populationSample,
  variant = 'light',
}: Props) {
  const insertField = (fieldKey: string) => {
    onChange(insertPopulationTag(channel, content, fieldKey));
  };

  return (
    <TemplatePersonalizationProvider
      fields={populationFields}
      sampleRow={populationSample}
      dark={variant === 'dark'}
    >
      <div className="space-y-4">
        {channel !== 'email' && (
          <TemplatePersonalizationPanel
            channel={channel}
            content={content}
            fields={populationFields}
            sampleRow={populationSample}
            onInsertField={insertField}
            dark={variant === 'dark'}
            compact
          />
        )}

        {channel === 'email' && (
          <EmailTemplateStudio
            content={content as import('@/lib/content-templates').EmailContent}
            onChange={onChange}
            personalizationSample={populationSample ?? undefined}
          />
        )}
        {channel === 'sms' && (
          <SmsTemplateBuilder content={content as import('@/lib/content-templates').SmsContent} onChange={onChange} />
        )}
        {channel === 'whatsapp' && (
          <WhatsAppTemplateBuilder content={content as import('@/lib/content-templates').WhatsAppContent} onChange={onChange} />
        )}
        {channel === 'web_push' && (
          <WebPushTemplateBuilder content={content as import('@/lib/content-templates').WebPushContent} onChange={onChange} />
        )}
        {channel === 'rcs' && (
          <RcsTemplateBuilder content={content as import('@/lib/content-templates').RcsContent} onChange={onChange} />
        )}
      </div>
    </TemplatePersonalizationProvider>
  );
}
