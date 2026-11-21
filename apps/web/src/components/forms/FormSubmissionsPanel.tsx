import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Download,
  Search,
  Users,
  Eye,
  X,
} from 'lucide-react';
import { Button, Card } from '@/components/ui';
import { fetchFormSubmissions, type FormField, type FormSubmission, type MarbeeForm } from '@/lib/forms';
import { formatSchemaDate } from '@/lib/schema-stats';
import { downloadTextFile } from '@/lib/schema-export';

type Props = {
  form?: MarbeeForm;
  formId?: string;
  fields?: FormField[];
};

export function FormSubmissionsPanel({ form, formId: propFormId, fields: propFields }: Props) {
  const formId = form?.id ?? propFormId ?? '';
  const fields = form?.fields ?? propFields ?? [];

  const [search, setSearch] = useState('');
  const [selectedSub, setSelectedSub] = useState<FormSubmission | null>(null);

  const { data: submissions, isLoading } = useQuery({
    queryKey: ['form-submissions', formId],
    queryFn: () => fetchFormSubmissions(formId, 1000),
    enabled: Boolean(formId),
  });

  const columns = fields.length
    ? fields.slice(0, 6)
    : [{ id: 'data', name: 'data', label: 'Data', field_type: 'text' as const, sort_order: 0 }];

  const filtered = useMemo(() => {
    const list = submissions ?? [];
    const q = search.trim().toLowerCase();
    if (!q) return list;
    return list.filter((s) => {
      const dataStr = JSON.stringify(s.data ?? {}).toLowerCase();
      return dataStr.includes(q) || s.id.toLowerCase().includes(q);
    });
  }, [submissions, search]);

  const handleExportCsv = () => {
    if (!submissions?.length) return;
    const allKeys = Array.from(
      new Set(submissions.flatMap((s) => Object.keys((s.data ?? {}) as Record<string, unknown>)))
    );
    const headers = ['submission_id', 'submitted_at', ...allKeys];
    const csvRows = [
      headers.join(','),
      ...submissions.map((s) => {
        const data = (s.data ?? {}) as Record<string, unknown>;
        return [
          `"${s.id}"`,
          `"${s.created_at}"`,
          ...allKeys.map((k) => `"${String(data[k] ?? '').replace(/"/g, '""')}"`),
        ].join(',');
      }),
    ].join('\n');

    downloadTextFile(csvRows, `form-submissions-${form?.slug ?? formId}.csv`, 'text/csv;charset=utf-8;');
  };

  if (isLoading) {
    return (
      <div className="p-12 text-center text-xs text-slate-500 font-medium">
        Loading captured responses…
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* TOOLBAR */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-4">
        <div className="flex items-center gap-3 min-w-[260px] flex-1">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by customer name, email, data…"
              className="w-full rounded-xl border border-slate-200 bg-slate-50/60 py-2 pl-9 pr-3 text-xs text-slate-800 focus:border-brand-500 focus:outline-none"
            />
          </div>
          <span className="text-xs text-slate-500 font-medium hidden sm:inline">
            {filtered.length} response{filtered.length === 1 ? '' : 's'}
          </span>
        </div>

        <Button
          variant="secondary"
          size="sm"
          onClick={handleExportCsv}
          disabled={!submissions?.length}
          className="rounded-xl shadow-2xs"
        >
          <Download className="mr-1.5 h-3.5 w-3.5" />
          Export to CSV
        </Button>
      </div>

      {!submissions?.length ? (
        <Card className="p-12 text-center border-slate-200 bg-white">
          <Users className="h-10 w-10 mx-auto text-slate-300 mb-3" />
          <h4 className="text-sm font-bold text-slate-900">No responses recorded yet</h4>
          <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
            Once respondents fill out and submit your form, their lead profile and form entries will appear here in real-time.
          </p>
        </Card>
      ) : (
        <Card className="border-slate-200 bg-white overflow-hidden shadow-xs">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-xs">
              <thead>
                <tr className="border-b border-slate-100 text-left text-slate-500 bg-slate-50/60">
                  <th className="px-6 py-3 font-semibold whitespace-nowrap">Submitted At</th>
                  {columns.map((col) => (
                    <th key={col.id} className="px-4 py-3 font-semibold whitespace-nowrap">
                      {col.label}
                    </th>
                  ))}
                  <th className="px-4 py-3 text-right font-semibold">Details</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {filtered.map((sub) => {
                  const data = (sub.data ?? {}) as Record<string, unknown>;
                  return (
                    <tr
                      key={sub.id}
                      onClick={() => setSelectedSub(sub)}
                      className="hover:bg-slate-50/80 cursor-pointer transition"
                    >
                      <td className="px-6 py-3 whitespace-nowrap font-medium text-slate-600">
                        {formatSchemaDate(sub.created_at)}
                      </td>
                      {columns.map((col) => (
                        <td key={col.id} className="max-w-[180px] truncate px-4 py-3 text-slate-800">
                          {data[col.name] !== undefined ? String(data[col.name]) : '—'}
                        </td>
                      ))}
                      <td className="px-4 py-3 text-right">
                        <span className="inline-flex items-center gap-1 font-bold text-brand-600 hover:text-brand-700">
                          <Eye className="h-3.5 w-3.5" />
                          <span>View</span>
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* LEAD SUBMISSION DETAILS MODAL */}
      {selectedSub && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-xs p-4">
          <div className="w-full max-w-lg rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-brand-50 text-brand-600">
                  <Users className="h-4 w-4" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-900">Lead Response Details</h3>
                  <p className="text-[11px] text-slate-400">ID: {selectedSub.id}</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setSelectedSub(null)}
                className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="text-xs text-slate-500">
              <span className="font-semibold text-slate-700">Submitted on: </span>
              {formatSchemaDate(selectedSub.created_at)}
            </div>

            {/* FORM FIELD VALUES */}
            <div className="rounded-xl border border-slate-200 bg-slate-50/50 p-4 space-y-2.5 max-h-72 overflow-y-auto">
              {Object.entries((selectedSub.data ?? {}) as Record<string, unknown>).map(([key, val]) => (
                <div key={key} className="flex items-start justify-between gap-4 border-b border-slate-100 pb-2 last:border-0 last:pb-0 text-xs">
                  <span className="font-bold text-slate-600 capitalize">{key.replace(/_/g, ' ')}:</span>
                  <span className="font-mono text-slate-900 text-right">{String(val)}</span>
                </div>
              ))}
            </div>

            <div className="flex justify-end pt-2">
              <Button variant="secondary" size="sm" onClick={() => setSelectedSub(null)}>
                Close
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
