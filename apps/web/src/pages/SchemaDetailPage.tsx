import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, Table2 } from 'lucide-react';
import { PageHeader, Card, CardHeader, Badge, EmptyState, Button } from '@/components/ui';
import { SchemaFieldsEditor, type SchemaFieldRow } from '@/components/schemas/SchemaFieldsEditor';
import { SchemaRelationshipExplorer } from '@/components/schemas/SchemaRelationshipExplorer';
import { PublishSchemaPanel } from '@/components/schemas/PublishSchemaPanel';
import { SchemaSettingsPanel } from '@/components/schemas/SchemaSettingsPanel';
import { SchemaVersionsPanel } from '@/components/schemas/SchemaVersionsPanel';
import { AuditTrailPanel } from '@/components/audit/AuditTrailPanel';
import { supabase } from '@/lib/supabase';
import { useTenantScope } from '@/contexts/AuthContext';
import { canExploreSchema } from '@/lib/schema-data';
import { fetchSchemaBySlug, fetchSchemasWithFields } from '@/lib/fetch-schemas';
import { getSupabaseErrorMessage } from '@/lib/schema-queries';
import {
  getSchemaStatusBadgeVariant,
  getSchemaStatusLabel,
  getSchemaTypeBadgeVariant,
  getSchemaTypeLabel,
} from '@/lib/schema-labels';

type SchemaDefinition = {
  id: string;
  name: string;
  slug: string;
  table_name: string | null;
  description: string | null;
  is_system: boolean;
  status: string;
  current_version: number;
  published_at: string | null;
  schema_fields: SchemaFieldRow[];
};

export function SchemaDetailPage() {
  const { slug } = useParams<{ slug: string }>();
  const { tenantId, environment } = useTenantScope();
  const [view, setView] = useState<'fields' | 'erd' | 'versions' | 'audit'>('fields');

  const { data: schema, isLoading: schemaLoading, error: schemaError } = useQuery({
    queryKey: ['schema', slug, tenantId, environment],
    queryFn: async () => {
      const data = await fetchSchemaBySlug(tenantId, environment, slug!);
      return data as SchemaDefinition | null;
    },
    enabled: Boolean(slug),
  });

  const { data: allSchemasForErd } = useQuery({
    queryKey: ['schemas', tenantId, environment],
    queryFn: () => fetchSchemasWithFields(tenantId, environment),
  });

  const { data: allSchemas } = useQuery({
    queryKey: ['schemas', tenantId, environment],
    queryFn: async () => {
      const { data } = await supabase
        .from('schema_definitions')
        .select('id, name, slug, table_name, is_system')
        .eq('tenant_id', tenantId)
        .eq('environment', environment);
      return data ?? [];
    },
  });

  const fkSchemaOptions = (allSchemas ?? []).filter(
    (s) => s.id !== schema?.id && (s.is_system || s.table_name),
  );

  const canShowData = schema ? canExploreSchema(schema) : false;
  const fieldsEditable = !schema?.is_system && schema?.status !== 'published';

  if (schemaLoading) {
    return <p className="p-8 text-center text-sm text-slate-500">Loading schema...</p>;
  }

  if (schemaError) {
    return (
      <EmptyState
        title="Could not load schema"
        description={getSupabaseErrorMessage(schemaError)}
        action={
          <Link to="/data/schemas" className="text-sm font-medium text-brand-600 hover:underline">
            Back to Schemas
          </Link>
        }
      />
    );
  }

  if (!schema) {
    return (
      <EmptyState
        title="Schema not found"
        description="This schema does not exist for your tenant."
        action={
          <Link to="/data/schemas" className="text-sm font-medium text-brand-600 hover:underline">
            Back to Schemas
          </Link>
        }
      />
    );
  }

  const tabs: Array<'fields' | 'erd' | 'versions' | 'audit'> = [
    'fields',
    'erd',
    ...(!schema.is_system ? (['versions'] as const) : []),
    'audit',
  ];

  return (
    <div>
      <Link
        to="/data/schemas"
        className="mb-4 inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-700"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to Schemas
      </Link>

      <PageHeader
        title={schema.name}
        description={schema.description ?? `Table: ${schema.table_name ?? '—'}`}
        action={
          <div className="flex flex-wrap items-center gap-2">
            {canShowData && (
              <Link to={`/data/schemas?tab=explorer&schema=${schema.slug}`}>
                <Button variant="secondary" size="sm">
                  <Table2 className="mr-1.5 h-3.5 w-3.5" />
                  Explore data
                </Button>
              </Link>
            )}
            <Badge variant={getSchemaTypeBadgeVariant(schema.is_system)}>
              {getSchemaTypeLabel(schema.is_system)}
            </Badge>
            <Badge variant={getSchemaStatusBadgeVariant(schema.is_system, schema.status)}>
              {getSchemaStatusLabel(schema.is_system, schema.status)}
            </Badge>
            {((schema.current_version ?? 0) > 0) && (
              <Badge variant="default">v{schema.current_version}</Badge>
            )}
          </div>
        }
      />

      <div className="mb-6 flex w-fit gap-1 rounded-lg border border-slate-200 bg-slate-50 p-1">
        {tabs.map((t) => (
          <button
            key={t}
            onClick={() => setView(t)}
            className={`rounded-md px-4 py-2 text-sm font-medium capitalize transition-colors ${
              view === t ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            {t === 'fields' ? 'Fields' : t === 'erd' ? 'Relationships' : t === 'audit' ? 'Audit trail' : 'Versions'}
          </button>
        ))}
      </div>

      {view === 'fields' && (
        <Card>
          {!schema.is_system && (
            <SchemaSettingsPanel
              schemaId={schema.id}
              name={schema.name}
              slug={schema.slug}
              description={schema.description}
              status={schema.status}
              tableName={schema.table_name}
              currentVersion={schema.current_version ?? 0}
              isSystem={schema.is_system}
            />
          )}
          {!schema.is_system && (
            <PublishSchemaPanel
              schemaId={schema.id}
              status={schema.status}
              currentVersion={schema.current_version ?? 0}
              tableName={schema.table_name}
              isSystem={schema.is_system}
              fieldCount={schema.schema_fields?.length ?? 0}
            />
          )}
          {schema.is_system && (
            <p className="border-b border-slate-100 px-6 py-3 text-xs text-slate-500">
              System schema — field definitions are read-only and match the Postgres table.
            </p>
          )}
          {schema.schema_fields?.length || !schema.is_system ? (
            <SchemaFieldsEditor
              schemaId={schema.id}
              schemaSlug={schema.slug}
              tenantId={tenantId}
              environment={environment}
              fields={schema.schema_fields ?? []}
              readOnly={!fieldsEditable}
              fkSchemaOptions={fkSchemaOptions}
            />
          ) : (
            <p className="p-8 text-center text-sm text-slate-500">Add fields, then publish to create the database table.</p>
          )}
        </Card>
      )}

      {view === 'erd' && (
        <Card className="overflow-hidden p-4 md:p-6">
          <SchemaRelationshipExplorer
            compact
            highlightSlug={schema.slug}
            schemas={allSchemasForErd?.map((s) => ({
              id: s.id,
              slug: s.slug,
              name: s.name,
              table_name: s.table_name,
              is_system: s.is_system,
              status: s.status,
              schema_fields: s.schema_fields as Array<{
                name: string;
                field_type: string;
                is_primary_key?: boolean;
                is_pii?: boolean;
                references_schema_id?: string | null;
              }>,
            }))}
          />
        </Card>
      )}

      {view === 'versions' && !schema.is_system && (
        <Card>
          <CardHeader title="Version history" subtitle="Snapshots created on each publish" />
          <SchemaVersionsPanel schemaId={schema.id} />
        </Card>
      )}

      {view === 'audit' && (
        <AuditTrailPanel
          tenantId={tenantId}
          environment={environment}
          resourceType="schema"
          resourceId={schema.id}
          title="Schema audit trail"
          subtitle={`Changes to ${schema.name}`}
        />
      )}
    </div>
  );
}
