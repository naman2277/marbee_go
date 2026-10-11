import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui';
import { supabase } from '@/lib/supabase';
import {
  TRANSFORM_OPTIONS,
  emptyMappingRow,
  type ConnectorMappingRow,
} from '@/lib/connector-mapping';

type SchemaOption = { slug: string; name: string };

type Props = {
  connectorId: string;
  mapping: ConnectorMappingRow[];
  schemaOptions: SchemaOption[];
};

export function ConnectorMappingEditor({ connectorId, mapping, schemaOptions }: Props) {
  const queryClient = useQueryClient();
  const [rows, setRows] = useState<ConnectorMappingRow[]>(
    mapping.length ? mapping : [emptyMappingRow()],
  );
  const [saved, setSaved] = useState(false);

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
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    },
  });

  const updateRow = (index: number, patch: Partial<ConnectorMappingRow>) => {
    setRows((prev) => prev.map((r, i) => (i === index ? { ...r, ...patch } : r)));
  };

  return (
    <div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[720px] text-sm">
          <thead>
            <tr className="border-b border-slate-100 text-left text-slate-500">
              <th className="px-4 py-3 font-medium">Source field</th>
              <th className="px-4 py-3 font-medium">Transform</th>
              <th className="px-4 py-3 font-medium">Target schema</th>
              <th className="px-4 py-3 font-medium">Target field</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => (
              <tr key={i} className="border-b border-slate-50">
                <td className="px-4 py-2">
                  <input
                    value={row.source_field}
                    onChange={(e) => updateRow(i, { source_field: e.target.value })}
                    placeholder="crm.email"
                    className="w-full rounded border border-slate-200 px-2 py-1.5 font-mono text-xs"
                  />
                </td>
                <td className="px-4 py-2">
                  <select
                    value={row.transform}
                    onChange={(e) => updateRow(i, { transform: e.target.value })}
                    className="w-full rounded border border-slate-200 px-2 py-1.5 text-xs"
                  >
                    {TRANSFORM_OPTIONS.map((t) => (
                      <option key={t.value} value={t.value}>
                        {t.label}
                      </option>
                    ))}
                  </select>
                </td>
                <td className="px-4 py-2">
                  <select
                    value={row.target_schema}
                    onChange={(e) => updateRow(i, { target_schema: e.target.value })}
                    className="w-full rounded border border-slate-200 px-2 py-1.5 text-xs"
                  >
                    {schemaOptions.map((s) => (
                      <option key={s.slug} value={s.slug}>
                        {s.name}
                      </option>
                    ))}
                  </select>
                </td>
                <td className="px-4 py-2">
                  <input
                    value={row.target_field}
                    onChange={(e) => updateRow(i, { target_field: e.target.value })}
                    placeholder="email"
                    className="w-full rounded border border-slate-200 px-2 py-1.5 font-mono text-xs"
                  />
                </td>
                <td className="px-4 py-2">
                  <button
                    type="button"
                    onClick={() => setRows((prev) => prev.filter((_, j) => j !== i))}
                    className="text-slate-400 hover:text-red-500"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="mt-4 flex flex-wrap gap-2 px-4 pb-4">
        <Button variant="secondary" size="sm" onClick={() => setRows((prev) => [...prev, emptyMappingRow()])}>
          <Plus className="mr-1 h-3.5 w-3.5" />
          Add mapping
        </Button>
        <Button size="sm" onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending}>
          {saveMutation.isPending ? 'Saving…' : 'Save mapping'}
        </Button>
        {saved && <span className="self-center text-sm text-emerald-600">Mapping saved</span>}
      </div>
    </div>
  );
}
