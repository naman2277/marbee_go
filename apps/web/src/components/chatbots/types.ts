import type { ChatBot, ChatBotCta, ChatBotField, ChatBotFieldMapping, ChatBotFullConfig, ChatBotKnowledgeSource, ChatBotPublishConfig } from '@/lib/chatbots';
import type { SchemaWithFields } from '@/lib/fetch-schemas';

export type AiProviderOption = { id: string; provider: string; provider_name: string; model_name: string; status: string };

export type ChatBotDraft = {
  bot: ChatBot;
  fields: ChatBotField[];
  mappings: ChatBotFieldMapping[];
  ctas: ChatBotCta[];
  knowledgeSources: ChatBotKnowledgeSource[];
  publish: ChatBotPublishConfig | null;
};

export function draftFromFull(full: ChatBotFullConfig): ChatBotDraft {
  return {
    bot: { ...full.bot },
    fields: full.fields.map((f) => ({ ...f })),
    mappings: full.mappings.map((m) => ({ ...m })),
    ctas: full.ctas.map((c) => ({ ...c })),
    knowledgeSources: full.knowledgeSources.map((k) => ({ ...k })),
    publish: full.publishConfig ?? null,
  };
}

export type TabProps = {
  draft: ChatBotDraft;
  update: (updater: (d: ChatBotDraft) => ChatBotDraft) => void;
  schemas: SchemaWithFields[];
  providers: AiProviderOption[];
};

export const TAB_KEYS = [
  'configuration', 'llm', 'context', 'knowledge', 'data-capture',
  'schema-mapping', 'cta', 'test', 'conversations', 'analytics', 'publish',
] as const;

export type TabKey = typeof TAB_KEYS[number];

export const TAB_LABELS: Record<TabKey, string> = {
  configuration: 'Configuration',
  llm: 'LLM',
  context: 'Context',
  knowledge: 'Knowledge',
  'data-capture': 'Data Capture',
  'schema-mapping': 'Schema Mapping',
  cta: 'CTA',
  test: 'Test',
  conversations: 'Conversations',
  analytics: 'Analytics',
  publish: 'Publish',
};

export function newId(): string {
  return `tmp_${crypto.randomUUID()}`;
}
