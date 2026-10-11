import { useEffect, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { ExternalLink } from 'lucide-react';
import { EmptyState } from '@/components/ui';
import { SchemaDataExplorer } from '@/components/schemas/SchemaDataExplorer';
import type { SchemaFieldRow } from '@/components/schemas/SchemaFieldsEditor';
import { fetchSchemasWithFields } from '@/lib/fetch-schemas';
import { canExploreSchema } from '@/lib/schema-data';
import { getSupabaseErrorMessage } from '@/lib/schema-queries';
import { fetchSchemaTableStats } from '@/lib/schema-stats';
import { useQuery } from '@tanstack/react-query';

type Props = {
  tenantId: string;
  environment: string;
  selectedSlug: string;
  onSelectSchema: (slug: string) => void;
};

export function SchemaDataExplorerPanel({ tenantId, environment, selectedSlug, onSelectSchema }: Props) {
  const { data: schemas, isLoading, error } = useQuery({
    queryKey: ['schemas', tenantId, environment],
    queryFn: () => fetchSchemasWithFields(tenantId, environment),
  });

  const explorableSchemas = useMemo(
    () => (schemas ?? []).filter((s) => s.table_name && canExploreSchema(s)),
    [schemas],
  );

  const { data: statsMap } = useQuery({
    queryKey: ['schema-stats', tenantId, environment, explorableSchemas.map((s) => s.slug).join(',')],
    queryFn: () =>
      fetchSchemaTableStats(
        tenantId,
        environment,
        explorableSchemas.map((s) => ({ slug: s.slug, table_name: s.table_name })),
      ),
    enabled: explorableSchemas.length > 0,
  });

  const activeSchema = useMemo(() => {
    if (!explorableSchemas.length) return null;
    if (selectedSlug) {
      return explorableSchemas.find((s) => s.slug === selectedSlug) ?? explorableSchemas[0];
    }
    return explorableSchemas.find((s) => s.slug === 'customer') ?? explorableSchemas[0];
  }, [explorableSchemas, selectedSlug]);

  useEffect(() => {
    if (!selectedSlug && activeSchema) {
      onSelectSchema(activeSchema.slug);
    }
  }, [selectedSlug, activeSchema, onSelectSchema]);

  if (isLoading) {
    return <p className="py-12 text-center text-sm text-slate-500">Loading schemas…</p>;
  }

  if (error) {
    return (
      <EmptyState
        title="Could not load schemas"
        description={getSupabaseErrorMessage(error)}
      />
    );
  }

  if (!explorableSchemas.length) {
    return (
      <EmptyState
        title="No explorable schemas"
        description="Publish a custom schema or run OOTB seed scripts to explore data here."
      />
    );
  }

  const rowCount = activeSchema ? statsMap?.get(activeSchema.slug)?.record_count : null;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <label className="flex min-w-0 flex-1 items-center gap-2 sm:max-w-sm">
          <span className="shrink-0 text-sm font-medium text-slate-600">Schema</span>
          <select
            value={activeSchema?.slug ?? ''}
            onChange={(e) => onSelectSchema(e.target.value)}
            className="min-w-0 flex-1 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus:border-brand-300 focus:outline-none focus:ring-2 focus:ring-brand-100"
          >
            {explorableSchemas.map((schema) => {
              const count = statsMap?.get(schema.slug)?.record_count;
              return (
                <option key={schema.id} value={schema.slug}>
                  {schema.name}
                  {count != null ? ` (${count.toLocaleString()} rows)` : ''}
                </option>
              );
            })}
          </select>
        </label>

        {activeSchema && (
          <Link
            to={`/data/schemas/${activeSchema.slug}`}
            className="inline-flex items-center gap-1.5 text-sm font-medium text-brand-600 hover:underline"
          >
            Schema definition
            <ExternalLink className="h-3.5 w-3.5" />
          </Link>
        )}

        {rowCount != null && (
          <span className="text-sm text-slate-500">{rowCount.toLocaleString()} rows in table</span>
        )}
      </div>

      {activeSchema?.table_name ? (
        <SchemaDataExplorer
          schema={{
            id: activeSchema.id,
            name: activeSchema.name,
            slug: activeSchema.slug,
            table_name: activeSchema.table_name,
            is_system: activeSchema.is_system,
            status: activeSchema.status,
            schema_fields: (activeSchema.schema_fields ?? []) as SchemaFieldRow[],
          }}
          tenantId={tenantId}
          environment={environment}
          resetKey={activeSchema.slug}
        />
      ) : null}
    </div>
  );
}
