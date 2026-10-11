import type { ContentChannel, TemplateContent } from '@/lib/content-templates';
import {
  DEFAULT_POPULATION_FIELDS,
  populationFieldsFromSampleRow,
  type PopulationFieldDef,
} from '@/lib/template-personalization';
import { ChannelTemplatePreview } from '@/components/content-templates/ChannelTemplatePreview';

type Props = {
  channel: ContentChannel | string;
  content: TemplateContent;
  compact?: boolean;
  populationFields?: PopulationFieldDef[];
  populationSample?: Record<string, unknown> | null;
  sampleRecipients?: Record<string, unknown>[];
};

const CHANNELS: ContentChannel[] = ['email', 'sms', 'web_push', 'whatsapp', 'rcs'];

function normalizeChannel(channel: string): ContentChannel {
  if (CHANNELS.includes(channel as ContentChannel)) return channel as ContentChannel;
  return 'email';
}

export function DeliveryContentPreview({
  channel,
  content,
  compact,
  populationFields,
  populationSample,
  sampleRecipients,
}: Props) {
  const ch = normalizeChannel(channel);
  const sample = populationSample ?? sampleRecipients?.[0] ?? null;
  const fields =
    populationFields ??
    (sample ? populationFieldsFromSampleRow(sample) : DEFAULT_POPULATION_FIELDS);

  return (
    <div className="flex justify-center">
      <ChannelTemplatePreview
        channel={ch}
        content={content}
        compact={compact}
        populationFields={fields}
        populationSample={sample}
        personalizePreview
      />
    </div>
  );
}
