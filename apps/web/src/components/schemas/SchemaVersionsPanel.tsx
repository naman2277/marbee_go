import { useQuery } from '@tanstack/react-query';
import { fetchSchemaVersions } from '@/lib/schema-publish';
import { Badge } from '@/components/ui';

type Props = {
  schemaId: string;
};

export function SchemaVersionsPanel({ schemaId }: Props) {
  const { data: versions, isLoading } = useQuery({
    queryKey: ['schema-versions', schemaId],
    queryFn: () => fetchSchemaVersions(schemaId),
  });

  if (isLoading) {
    return <p className="p-6 text-sm text-slate-500">Loading versions...</p>;
  }

  if (!versions?.length) {
    return (
      <p className="p-8 text-center text-sm text-slate-500">
        No published versions yet. Publish the schema to create version 1.
      </p>
    );
  }

  return (
    <div className="divide-y divide-slate-100">
      {versions.map((v) => {
        const fields = (v.snapshot as { fields?: unknown[] })?.fields ?? [];
        return (
          <div key={v.id} className="px-6 py-4">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <span className="font-semibold text-slate-900">Version {v.version_number}</span>
                <Badge variant="default">{fields.length} fields</Badge>
              </div>
              <span className="text-xs text-slate-400">
                {new Date(v.published_at).toLocaleString()}
              </span>
            </div>
            {v.change_notes && (
              <p className="mt-1 text-sm text-slate-600">{v.change_notes}</p>
            )}
            <p className="mt-1 font-mono text-xs text-slate-400">
              Table: {(v.snapshot as { table_name?: string })?.table_name ?? '—'}
            </p>
          </div>
        );
      })}
    </div>
  );
}
