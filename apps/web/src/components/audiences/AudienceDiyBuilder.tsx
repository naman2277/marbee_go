import { useMemo, useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Code, Save, Users } from 'lucide-react';
import { Button } from '@/components/ui';
import { SchemaFilterEditor } from '@/components/schemas/SchemaFilterEditor';
import {
  createAudience,
  evaluateAudienceMembers,
  buildAudienceFilterFields,
  filterRootFromRules,
  slugifyAudienceName,
  updateAudience,
  refreshAudience,
  type SimpleAudienceRule,
} from '@/lib/audiences';
import { createFilterRoot, type FilterRoot } from '@/lib/schema-filters';
import { fetchSchemasWithFields } from '@/lib/fetch-schemas';
import { fetchSchemaRows } from '@/lib/schema-records';
import { formatFilterRoot } from '@/lib/schema-filters';

type Props = {
  tenantId: string;
  environment: string;
  /** Edit existing cohort */
  audienceId?: string;
  initialSchemaSlug?: string;
  initialFilterRoot?: FilterRoot;
  initialRules?: SimpleAudienceRule[];
  initialName?: string;
  initialDescription?: string;
  initialQuickSearch?: string;
  editMode?: boolean;
  onSaved?: (id: string) => void;
  onUpdated?: () => void;
};

export function AudienceDiyBuilder({
  tenantId,
  environment,
  audienceId,
  initialSchemaSlug = 'customer',
  initialFilterRoot,
  initialRules,
  initialName = '',
  initialDescription = '',
  initialQuickSearch = '',
  editMode = false,
  onSaved,
  onUpdated,
}: Props) {
  const [schemaSlug, setSchemaSlug] = useState(initialSchemaSlug);
  const [name, setName] = useState(initialName);
  const [description, setDescription] = useState(initialDescription);
  const [filterRoot, setFilterRoot] = useState<FilterRoot>(() =>
    initialFilterRoot ??
    (initialRules?.length ? filterRootFromRules(initialRules) : createFilterRoot()),
  );
  const [quickSearch, setQuickSearch] = useState(initialQuickSearch);

  const { data: schemas } = useQuery({
    queryKey: ['schemas', tenantId, environment],
    queryFn: () => fetchSchemasWithFields(tenantId, environment),
  });

  const schema = useMemo(
    () => (schemas ?? []).find((s) => s.slug === schemaSlug && s.table_name),
    [schemas, schemaSlug],
  );

  const { data: rows } = useQuery({
    queryKey: ['audience-schema-rows', schema?.table_name, tenantId, environment],
    queryFn: () => fetchSchemaRows(schema!.table_name!, tenantId, environment),
    enabled: Boolean(schema?.table_name),
  });

  const filterFields = useMemo(
    () => (schema && rows ? buildAudienceFilterFields(schema, rows) : []),
    [schema, rows],
  );

  const { data: preview, isFetching: previewLoading } = useQuery({
    queryKey: ['audience-preview', schemaSlug, filterRoot, quickSearch, tenantId],
    queryFn: () =>
      evaluateAudienceMembers({
        tenantId,
        environment,
        schema: schema!,
        filterRoot,
        quickSearch,
        limit: 50,
      }),
    enabled: Boolean(schema),
  });

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!name.trim()) throw new Error('Name is required');
      if (editMode && audienceId) {
        const updated = await updateAudience(audienceId, {
          name: name.trim(),
          description: description.trim(),
          schema_slug: schemaSlug,
          filter_json: filterRoot,
          quick_search: quickSearch,
        });
        await refreshAudience(updated, tenantId, environment, 'manual');
        return updated;
      }
      const audience = await createAudience({
        tenant_id: tenantId,
        environment,
        name: name.trim(),
        slug: slugifyAudienceName(name),
        description: description.trim() || undefined,
        schema_slug: schemaSlug,
        filter_json: filterRoot,
        quick_search: quickSearch,
        creation_mode: 'diy',
        member_count: preview?.total ?? 0,
      });
      return audience;
    },
    onSuccess: (a) => {
      if (editMode) onUpdated?.();
      else onSaved?.(a.id);
    },
  });

  const queryText = formatFilterRoot(filterRoot, filterFields);

  return (
    <div className="grid gap-6 lg:grid-cols-5">
      <div className="space-y-4 lg:col-span-3">
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <h3 className="font-semibold text-slate-900">
            {editMode ? 'Edit cohort rules' : 'DIY cohort builder'}
          </h3>
          <p className="mt-1 text-sm text-slate-500">
            {editMode
              ? 'Update schema filters — member count refreshes on save'
              : 'Pick a schema and define rules — same power as Data Explorer filters'}
          </p>

          <div className="mt-5 grid gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs font-semibold text-slate-600">Cohort name</label>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="High-value India customers"
                className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-slate-600">Schema</label>
              <select
                value={schemaSlug}
                onChange={(e) => {
                  setSchemaSlug(e.target.value);
                  setFilterRoot(createFilterRoot());
                }}
                className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm"
              >
                {(schemas ?? []).filter((s) => s.table_name).map((s) => (
                  <option key={s.slug} value={s.slug}>{s.name}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="mt-4">
            <label className="mb-1 block text-xs font-semibold text-slate-600">Description</label>
            <input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Optional description"
              className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm"
            />
          </div>

          {filterFields.length > 0 && (
            <div className="mt-6">
              <SchemaFilterEditor
                fields={filterFields}
                root={filterRoot}
                onChange={setFilterRoot}
                quickSearch={quickSearch}
                onQuickSearchChange={setQuickSearch}
                sampleRow={rows?.[0]}
              />
            </div>
          )}

          {queryText && (
            <div className="mt-4 flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50/80 px-3.5 py-2.5 text-xs text-slate-700">
              <Code className="h-4 w-4 text-brand-600 shrink-0" />
              <span className="font-bold text-slate-500 text-[10px] uppercase tracking-wider shrink-0">
                Expression:
              </span>
              <span className="font-mono text-slate-800 font-semibold truncate">{queryText}</span>
            </div>
          )}

          <Button className="mt-6" onClick={() => saveMutation.mutate()} disabled={!name.trim() || saveMutation.isPending}>
            <Save className="mr-1.5 h-4 w-4" />
            {editMode ? 'Save changes' : 'Save cohort'}
          </Button>
          {saveMutation.error && (
            <p className="mt-2 text-sm text-red-600">{(saveMutation.error as Error).message}</p>
          )}
        </div>
      </div>

      <div className="lg:col-span-2">
        <div className="sticky top-4 rounded-2xl border border-violet-200 bg-gradient-to-br from-violet-50 to-indigo-50 p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <h4 className="font-semibold text-violet-900">Live preview</h4>
            <span className="flex items-center gap-1 rounded-full bg-white px-3 py-1 text-sm font-bold text-violet-700 shadow-sm">
              <Users className="h-4 w-4" />
              {previewLoading ? '…' : (preview?.total ?? 0)}
            </span>
          </div>
          <p className="mt-1 text-xs text-violet-700">Members matching rules on {schema?.name ?? schemaSlug}</p>

          <ul className="mt-4 max-h-[420px] space-y-2 overflow-y-auto">
            {(preview?.members ?? []).slice(0, 20).map((row) => (
              <li key={String(row.id)} className="rounded-lg bg-white/80 px-3 py-2 text-xs shadow-sm">
                <p className="font-medium text-slate-800">
                  {String(row.email ?? row.first_name ?? row.id ?? 'Record')}
                </p>
                <p className="text-slate-500">{String(row.status ?? row.country ?? '')}</p>
              </li>
            ))}
            {!preview?.members?.length && !previewLoading && (
              <li className="py-8 text-center text-sm text-violet-600">No members match yet — add rules above</li>
            )}
          </ul>
        </div>
      </div>
    </div>
  );
}
