import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ArrowRight, GripVertical, Plus, Sparkles, Trash2, Wand2 } from 'lucide-react';
import { Button } from '@/components/ui';
import { supabase } from '@/lib/supabase';
import { logAudit } from '@/lib/audit';
import {
  TRANSFORM_OPTIONS,
  emptyMappingRow,
  type ConnectorMappingRow,
} from '@/lib/connector-mapping';
import { connectorMeta } from '@/lib/connector-meta';

type SchemaOption = { slug: string; name: string; schema_fields?: Array<{ name: string }> };

type Props = {
  connectorId: string;
  connectorType: string;
  connectorName?: string;
  tenantId?: string;
  environment?: string;
  mapping: ConnectorMappingRow[];
  schemaOptions: SchemaOption[];
};

export function ConnectorMappingFlow({
  connectorId,
  connectorType,
  connectorName,
  tenantId,
  environment,
  mapping,
  schemaOptions,
}: Props) {
  const queryClient = useQueryClient();
  const meta = connectorMeta(connectorType);
  const [rows, setRows] = useState<ConnectorMappingRow[]>(
    mapping.length ? mapping : [emptyMappingRow()],
  );
  const [saved, setSaved] = useState(false);
  const [selectedIdx, setSelectedIdx] = useState<number | null>(0);

  const saveMutation = useMutation({
    mutationFn: async () => {
      const cleaned = rows.filter((r) => r.source_field && r.target_field);
      const { error } = await supabase
        .from('connectors')
        .update({ mapping: cleaned, updated_at: new Date().toISOString() })
        .eq('id', connectorId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['connector'] });
      if (tenantId && environment) {
        void logAudit({
          tenantId,
          environment,
          action: 'update',
          resourceType: 'connector',
          resourceId: connectorId,
          resourceName: connectorName ?? connectorType,
          summary: 'Updated field mappings',
        });
      }
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    },
  });

  const updateRow = (index: number, patch: Partial<ConnectorMappingRow>) => {
    setRows((prev) => prev.map((r, i) => (i === index ? { ...r, ...patch } : r)));
  };

  const addSuggestedMappings = () => {
    const suggestions: ConnectorMappingRow[] = [
      { source_field: 'email', transform: 'lowercase', target_schema: 'customer', target_field: 'email' },
      { source_field: 'phone', transform: 'trim', target_schema: 'customer', target_field: 'mobile' },
      { source_field: 'first_name', transform: 'trim', target_schema: 'customer', target_field: 'first_name' },
      { source_field: 'last_name', transform: 'trim', target_schema: 'customer', target_field: 'last_name' },
    ];
    setRows((prev) => {
      const existing = new Set(prev.map((r) => `${r.source_field}:${r.target_field}`));
      const next = suggestions.filter((s) => !existing.has(`${s.source_field}:${s.target_field}`));
      return [...prev.filter((r) => r.source_field || r.target_field), ...next];
    });
  };

  const selectedRow = selectedIdx != null ? rows[selectedIdx] : null;
  const selectedSchema = schemaOptions.find((s) => s.slug === selectedRow?.target_schema);
  const targetFields = (selectedSchema?.schema_fields ?? []) as Array<{ name: string }>;

  return (
    <div className="flex min-h-[520px] overflow-hidden rounded-2xl border border-slate-200 bg-slate-950">
      {/* Pipeline canvas */}
      <div className="relative min-w-0 flex-1">
        <div className="absolute left-4 right-4 top-4 z-10 flex items-center justify-between rounded-xl border border-slate-700/50 bg-slate-900/90 px-3 py-2 backdrop-blur-md">
          <div className="flex items-center gap-2 text-xs text-slate-300">
            <Sparkles className="h-3.5 w-3.5 text-teal-400" />
            <span>
              <span className="font-semibold text-white">{rows.filter((r) => r.source_field && r.target_field).length}</span> mappings
            </span>
          </div>
          <div className="flex gap-1.5">
            <button
              type="button"
              onClick={addSuggestedMappings}
              className="inline-flex items-center gap-1 rounded-lg px-2.5 py-1 text-[11px] font-medium text-teal-300 hover:bg-slate-800"
            >
              <Wand2 className="h-3 w-3" />
              Auto-suggest
            </button>
            <button
              type="button"
              onClick={() => {
                setRows((prev) => [...prev, emptyMappingRow()]);
                setSelectedIdx(rows.length);
              }}
              className="inline-flex items-center gap-1 rounded-lg bg-teal-600 px-2.5 py-1 text-[11px] font-medium text-white hover:bg-teal-500"
            >
              <Plus className="h-3 w-3" />
              Add
            </button>
          </div>
        </div>

        <div className="h-full overflow-y-auto px-6 pb-6 pt-16">
          {/* Source node */}
          <div className="mb-6 flex justify-center">
            <div className="rounded-2xl border border-slate-700 bg-slate-900 px-6 py-4 text-center shadow-xl">
              <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Source</p>
              <p className="mt-1 text-sm font-bold text-white">{meta?.label ?? connectorType}</p>
              <p className="mt-0.5 text-[11px] text-slate-400">Incoming payload fields</p>
            </div>
          </div>

          <div className="mx-auto max-w-2xl space-y-2">
            {rows.map((row, i) => {
              const isSelected = selectedIdx === i;
              const transformLabel = TRANSFORM_OPTIONS.find((t) => t.value === row.transform)?.label ?? 'None';
              const complete = row.source_field && row.target_field;

              return (
                <button
                  key={i}
                  type="button"
                  onClick={() => setSelectedIdx(i)}
                  className={`group flex w-full items-center gap-2 rounded-xl border p-3 text-left transition-all ${
                    isSelected
                      ? 'border-teal-500/60 bg-teal-500/10 shadow-lg shadow-teal-500/10'
                      : complete
                        ? 'border-slate-700 bg-slate-900/80 hover:border-slate-600'
                        : 'border-dashed border-slate-700 bg-slate-900/40 hover:border-slate-600'
                  }`}
                >
                  <GripVertical className="h-4 w-4 shrink-0 text-slate-600" />

                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="rounded-lg bg-slate-800 px-2.5 py-1 font-mono text-xs text-emerald-300">
                        {row.source_field || 'source.field'}
                      </span>
                      <ArrowRight className="h-3.5 w-3.5 shrink-0 text-slate-600" />
                      {row.transform && (
                        <>
                          <span className="rounded-md bg-violet-500/20 px-2 py-0.5 text-[10px] font-semibold text-violet-300">
                            {transformLabel}
                          </span>
                          <ArrowRight className="h-3.5 w-3.5 shrink-0 text-slate-600" />
                        </>
                      )}
                      <span className="rounded-lg bg-slate-800 px-2.5 py-1 font-mono text-xs text-blue-300">
                        {row.target_schema}.{row.target_field || 'field'}
                      </span>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setRows((prev) => prev.filter((_, j) => j !== i));
                      setSelectedIdx(null);
                    }}
                    className="shrink-0 text-slate-600 opacity-0 transition group-hover:opacity-100 hover:text-red-400"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </button>
              );
            })}
          </div>

          {/* Target node */}
          <div className="mt-6 flex justify-center">
            <div className="rounded-2xl border border-slate-700 bg-gradient-to-br from-blue-950 to-slate-900 px-6 py-4 text-center shadow-xl">
              <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Destination</p>
              <p className="mt-1 text-sm font-bold text-white">Marbee Schemas</p>
              <p className="mt-0.5 text-[11px] text-slate-400">Upsert into tenant tables</p>
            </div>
          </div>
        </div>
      </div>

      {/* Inspector */}
      <aside className="flex w-[340px] shrink-0 flex-col border-l border-slate-800 bg-white">
        <div className="border-b border-slate-100 px-5 py-4">
          <h3 className="font-semibold text-slate-900">Mapping inspector</h3>
          <p className="mt-0.5 text-xs text-slate-500">Configure the selected field mapping</p>
        </div>

        {selectedRow != null ? (
          <div className="flex-1 space-y-4 overflow-y-auto p-5">
            <Field label="Source field">
              <input
                value={selectedRow.source_field}
                onChange={(e) => updateRow(selectedIdx!, { source_field: e.target.value })}
                placeholder="crm.email"
                className="w-full rounded-xl border border-slate-200 px-3 py-2 font-mono text-sm focus:border-teal-400 focus:outline-none focus:ring-2 focus:ring-teal-100"
              />
            </Field>

            <Field label="Transform">
              <select
                value={selectedRow.transform}
                onChange={(e) => updateRow(selectedIdx!, { transform: e.target.value })}
                className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
              >
                {TRANSFORM_OPTIONS.map((t) => (
                  <option key={t.value} value={t.value}>{t.label}</option>
                ))}
              </select>
            </Field>

            <Field label="Target schema">
              <select
                value={selectedRow.target_schema}
                onChange={(e) => updateRow(selectedIdx!, { target_schema: e.target.value, target_field: '' })}
                className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
              >
                {schemaOptions.map((s) => (
                  <option key={s.slug} value={s.slug}>{s.name}</option>
                ))}
              </select>
            </Field>

            <Field label="Target field">
              {targetFields.length ? (
                <select
                  value={selectedRow.target_field}
                  onChange={(e) => updateRow(selectedIdx!, { target_field: e.target.value })}
                  className="w-full rounded-xl border border-slate-200 px-3 py-2 font-mono text-sm"
                >
                  <option value="">Select field</option>
                  {targetFields.map((f) => (
                    <option key={f.name} value={f.name}>{f.name}</option>
                  ))}
                </select>
              ) : (
                <input
                  value={selectedRow.target_field}
                  onChange={(e) => updateRow(selectedIdx!, { target_field: e.target.value })}
                  placeholder="email"
                  className="w-full rounded-xl border border-slate-200 px-3 py-2 font-mono text-sm"
                />
              )}
            </Field>

            {/* Live preview */}
            <div className="rounded-xl border border-slate-100 bg-slate-50 p-3">
              <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Preview</p>
              <p className="mt-2 font-mono text-xs text-slate-700">
                {selectedRow.source_field || 'source'}
                {selectedRow.transform ? ` → ${selectedRow.transform}()` : ''}
                {' → '}
                {selectedRow.target_schema}.{selectedRow.target_field || 'field'}
              </p>
            </div>
          </div>
        ) : (
          <div className="flex flex-1 items-center justify-center p-6 text-center text-sm text-slate-500">
            Select a mapping row to edit
          </div>
        )}

        <div className="border-t border-slate-100 p-4">
          <Button className="w-full" onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending}>
            {saveMutation.isPending ? 'Saving…' : 'Save mappings'}
          </Button>
          {saved && <p className="mt-2 text-center text-xs text-emerald-600">Mappings saved</p>}
        </div>
      </aside>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="mb-1.5 block text-xs font-semibold text-slate-600">{label}</label>
      {children}
    </div>
  );
}
