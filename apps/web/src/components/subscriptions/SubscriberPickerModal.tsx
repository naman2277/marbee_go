import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Search, X } from 'lucide-react';
import { Button } from '@/components/ui';
import { fetchCustomers, getCustomerDisplayName } from '@/lib/customers';

type Props = {
  open: boolean;
  tenantId: string;
  environment: string;
  loading?: boolean;
  excludeCustomerIds?: string[];
  onClose: () => void;
  onConfirm: (customerIds: string[]) => void;
};

export function SubscriberPickerModal({
  open,
  tenantId,
  environment,
  loading,
  excludeCustomerIds = [],
  onClose,
  onConfirm,
}: Props) {
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const { data: customers, isLoading } = useQuery({
    queryKey: ['subscriber-picker-customers', tenantId, environment, search],
    queryFn: () => fetchCustomers(tenantId, environment, search, 200),
    enabled: open && Boolean(tenantId),
  });

  const exclude = useMemo(() => new Set(excludeCustomerIds), [excludeCustomerIds]);

  const available = useMemo(
    () => (customers ?? []).filter((c) => !exclude.has(c.id)),
    [customers, exclude],
  );

  if (!open) return null;

  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectAll = () => {
    setSelected(new Set(available.map((c) => c.id)));
  };

  const handleClose = () => {
    setSelected(new Set());
    setSearch('');
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <button type="button" className="absolute inset-0 bg-slate-900/50 backdrop-blur-sm" aria-label="Close" onClick={handleClose} />
      <div className="relative flex max-h-[85vh] w-full max-w-lg flex-col rounded-2xl border border-slate-200 bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4">
          <h2 className="text-lg font-bold text-slate-900">Add subscribers</h2>
          <button type="button" onClick={handleClose} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="border-b border-slate-100 px-6 py-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by name or email…"
              className="w-full rounded-lg border border-slate-200 py-2 pl-9 pr-3 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>
          <div className="mt-2 flex items-center justify-between text-xs text-slate-500">
            <span>{selected.size} selected</span>
            <button type="button" className="text-blue-600 hover:underline" onClick={selectAll}>
              Select all visible
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-2 py-2">
          {isLoading ? (
            <p className="py-8 text-center text-sm text-slate-500">Loading profiles…</p>
          ) : available.length === 0 ? (
            <p className="py-8 text-center text-sm text-slate-500">No profiles available to add.</p>
          ) : (
            <ul className="space-y-0.5">
              {available.map((c) => (
                <li key={c.id}>
                  <label className="flex cursor-pointer items-center gap-3 rounded-lg px-4 py-2.5 hover:bg-slate-50">
                    <input
                      type="checkbox"
                      checked={selected.has(c.id)}
                      onChange={() => toggle(c.id)}
                      className="rounded border-slate-300"
                    />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-slate-900">{getCustomerDisplayName(c)}</p>
                      {c.email && <p className="truncate text-xs text-slate-500">{c.email}</p>}
                    </div>
                  </label>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="flex gap-3 border-t border-slate-100 px-6 py-4">
          <Button type="button" variant="secondary" className="flex-1" onClick={handleClose} disabled={loading}>
            Cancel
          </Button>
          <Button
            type="button"
            className="flex-1"
            disabled={loading || selected.size === 0}
            onClick={() => onConfirm([...selected])}
          >
            {loading ? 'Adding…' : `Add ${selected.size || ''} subscriber${selected.size === 1 ? '' : 's'}`}
          </Button>
        </div>
      </div>
    </div>
  );
}
