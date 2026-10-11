import { useQuery } from '@tanstack/react-query';
import { Link, useParams } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { EmptyState } from '@/components/ui';
import { ChatBotStudio } from '@/components/chatbots/ChatBotStudio';
import { fetchChatBotFullConfig } from '@/lib/chatbots';
import { fetchSchemasWithFields } from '@/lib/fetch-schemas';
import { useAuth } from '@/contexts/AuthContext';
import { fetchAiModelsConfig } from '@/lib/ai-engine-config';

export function ChatBotStudioPage() {
  const { id } = useParams<{ id: string }>();
  const { tenantId, environment } = useAuth();

  const { data: full, isLoading, error, refetch } = useQuery({
    queryKey: ['chatbot-full', id],
    queryFn: () => fetchChatBotFullConfig(id!),
    enabled: Boolean(id),
  });

  const { data: schemas } = useQuery({
    queryKey: ['schemas', tenantId, environment],
    queryFn: () => fetchSchemasWithFields(tenantId, environment),
  });

  const { data: providers } = useQuery({
    queryKey: ['ai-engine-providers', tenantId, environment],
    queryFn: async () => {
      const all = await fetchAiModelsConfig(tenantId, environment);
      return all
        .filter((m) => (m.apiKey || m.status === 'connected' || m.status === 'unverified') && !m.id.startsWith('ai_'))
        .map((m) => ({
          id: m.id,
          provider: m.provider,
          provider_name: m.providerName,
          model_name: m.modelName,
          status: m.status,
        }));
    },
  });

  if (isLoading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="flex items-center gap-2 text-sm text-slate-500">
          <Loader2 className="h-5 w-5 animate-spin text-brand-600" />
          Loading Chat Bot Studio…
        </div>
      </div>
    );
  }

  if (error || !full) {
    return (
      <div className="p-8">
        <EmptyState
          title="Chat bot not found"
          description="This chat bot does not exist for your tenant or environment."
          action={<Link to="/content/chatbots" className="text-sm font-semibold text-brand-600 hover:underline">Back to Chat Bots</Link>}
        />
      </div>
    );
  }

  return (
    <ChatBotStudio
      key={id}
      full={full}
      schemas={schemas ?? []}
      providers={providers ?? []}
      onReload={() => refetch()}
    />
  );
}
