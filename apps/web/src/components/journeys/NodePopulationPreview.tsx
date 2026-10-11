import type { NodePopulationResult } from '@/lib/workflow-engine';

type Props = {
  result?: NodePopulationResult | null;
  loading?: boolean;
  dark?: boolean;
};

export function NodePopulationPreview({ result, loading, dark }: Props) {
  const shell = dark
    ? 'rounded-lg border border-slate-800 bg-slate-900/50'
    : 'rounded-lg border border-slate-200 bg-white';
  const muted = dark ? 'text-slate-500' : 'text-slate-500';
  const text = dark ? 'text-slate-200' : 'text-slate-900';
  const headBg = dark ? 'bg-slate-900' : 'bg-slate-50';

  if (loading) {
    return (
      <div className={`${shell} p-4 text-sm ${muted}`}>
        Building work table…
      </div>
    );
  }

  if (!result) {
    return (
      <div className={`${shell} border-dashed p-4 text-center text-xs ${muted}`}>
        Run this query to populate the temporary work table and preview transition data
      </div>
    );
  }

  const queryMeta = result.query;
  const columns = result.sample.length
    ? Object.keys(result.sample[0]!).filter((k) => !k.startsWith('_') || k === '_pk').slice(0, 6)
    : queryMeta
      ? ['_pk', ...queryMeta.additionalFields.slice(0, 4)]
      : ['id'];

  const countLabel = queryMeta?.aggregateMode && queryMeta.aggregateMode !== 'none'
    ? `${result.count.toLocaleString()} aggregate row${result.count === 1 ? '' : 's'}`
    : `${result.count.toLocaleString()} record${result.count === 1 ? '' : 's'}`;

  return (
    <div className={shell}>
      <div className={`px-3 py-2.5 ${dark ? 'border-b border-slate-800' : 'border-b border-slate-100'}`}>
        <div className="flex items-start justify-between gap-2">
          <div>
            <p className={`text-xs font-semibold ${text}`}>{countLabel} in work table</p>
            {result.executedAt && (
              <p className={`text-[10px] ${muted}`}>
                {new Date(result.executedAt).toLocaleTimeString()}
              </p>
            )}
          </div>
        </div>
        {queryMeta && (
          <div className={`mt-2 flex flex-wrap gap-1 text-[10px] ${muted}`}>
            <span className={`rounded px-1.5 py-0.5 ${dark ? 'bg-slate-800' : 'bg-slate-100'}`}>
              dim: {queryMeta.targetingDimension}
            </span>
            {queryMeta.additionalFields.length > 0 && (
              <span className={`rounded px-1.5 py-0.5 ${dark ? 'bg-slate-800' : 'bg-slate-100'}`}>
                +{queryMeta.additionalFields.length} data
              </span>
            )}
            {queryMeta.segmentCode && (
              <span className={`rounded px-1.5 py-0.5 ${dark ? 'bg-slate-800' : 'bg-slate-100'}`}>
                seg: {queryMeta.segmentCode}
              </span>
            )}
            {queryMeta.aggregateMode !== 'none' && (
              <span className={`rounded px-1.5 py-0.5 ${dark ? 'bg-slate-800' : 'bg-slate-100'}`}>
                {queryMeta.aggregateMode}
              </span>
            )}
          </div>
        )}
        <p className={`mt-2 text-[10px] leading-relaxed ${muted}`}>
          Primary keys and optional additional attributes — passed to the next activity via the outgoing transition.
        </p>
      </div>

      {result.sample.length > 0 ? (
        <div className="max-h-44 overflow-auto">
          <table className="w-full text-left text-[11px]">
            <thead className={`sticky top-0 ${headBg} ${muted}`}>
              <tr>
                {columns.map((col) => (
                  <th key={col} className="px-3 py-1.5 font-medium">
                    {col === '_pk' ? 'Primary key' : col === 'segment_code' ? 'Segment' : col}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className={dark ? 'text-slate-400' : 'text-slate-700'}>
              {result.sample.slice(0, 8).map((row, i) => (
                <tr key={String(row._pk ?? row.id ?? i)} className={dark ? 'border-t border-slate-800' : 'border-t border-slate-100'}>
                  {columns.map((col) => (
                    <td key={col} className="max-w-[100px] truncate px-3 py-1.5">
                      {formatCell(row[col])}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className={`px-3 py-4 text-center text-xs ${muted}`}>Empty work table</p>
      )}
    </div>
  );
}

function formatCell(value: unknown): string {
  if (value == null) return '—';
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}
