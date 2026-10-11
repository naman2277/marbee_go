import { PageHeader, EmptyState } from '@/components/ui';

export function PlaceholderPage({ title, description }: { title: string; description?: string }) {
  return (
    <div>
      <PageHeader title={title} description={description} />
      <EmptyState
        title="Coming soon"
        description={`${title} module is on the P1 roadmap. Core platform foundation is ready.`}
      />
    </div>
  );
}
