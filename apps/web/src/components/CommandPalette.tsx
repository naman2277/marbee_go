import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Activity, Database, Plug, Search, Workflow } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { cn } from '@/lib/utils';

/* Global ⌘K / Ctrl+K palette — jump to any pipeline, connector, schema, or
   recent run. Data-workspace scoped for now. */

type Item = { id: string; label: string; sub: string; route: string; icon: typeof Workflow; group: string };

export function CommandPalette() {
  const navigate = useNavigate();
  const { tenantId, environment } = useAuth();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setOpen((o) => !o);
      } else if (e.key === 'Escape') {
        setOpen(false);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  useEffect(() => {
    if (open) {
      setQ('');
      setActive(0);
      setTimeout(() => inputRef.current?.focus(), 20);
    }
  }, [open]);

  const { data } = useQuery({
    queryKey: ['command-palette', tenantId, environment],
    enabled: open && Boolean(tenantId),
    staleTime: 30_000,
    queryFn: async (): Promise<Item[]> => {
      const [jobs, connectors, schemas, runs] = await Promise.all([
        supabase.from('data_jobs').select('id, name, job_type').eq('tenant_id', tenantId).eq('environment', environment).limit(50),
        supabase.from('connectors').select('id, name, connector_type').eq('tenant_id', tenantId).eq('environment', environment).limit(50),
        supabase.from('schema_definitions').select('id, name, slug').eq('tenant_id', tenantId).eq('environment', environment).limit(50),
        supabase
          .from('data_job_runs')
          .select('id, status, started_at, job:data_jobs!inner(name, tenant_id)')
          .eq('job.tenant_id', tenantId)
          .order('started_at', { ascending: false })
          .limit(15),
      ]);
      const items: Item[] = [];
      for (const j of jobs.data ?? [])
        items.push({ id: `j${j.id}`, label: j.name, sub: `Pipeline · ${j.job_type}`, route: `/data/jobs/${j.id}`, icon: Workflow, group: 'Pipelines' });
      for (const c of connectors.data ?? [])
        items.push({ id: `c${c.id}`, label: c.name, sub: `Connector · ${c.connector_type}`, route: `/data/connectors/${c.id}`, icon: Plug, group: 'Connectors' });
      for (const s of schemas.data ?? [])
        items.push({ id: `s${s.id}`, label: s.name, sub: 'Schema', route: `/data/schemas/${s.slug}`, icon: Database, group: 'Schemas' });
      for (const r of runs.data ?? []) {
        const jn = Array.isArray(r.job) ? r.job[0]?.name : (r.job as { name?: string } | null)?.name;
        items.push({
          id: `r${r.id}`,
          label: `${jn ?? 'Run'} — ${r.status}`,
          sub: `Run · ${new Date(r.started_at as string).toLocaleString()}`,
          route: `/data/runs/${r.id}`,
          icon: Activity,
          group: 'Recent runs',
        });
      }
      return items;
    },
  });

  const results = useMemo(() => {
    const items = data ?? [];
    if (!q.trim()) return items.slice(0, 20);
    const needle = q.toLowerCase();
    return items.filter((i) => i.label.toLowerCase().includes(needle) || i.sub.toLowerCase().includes(needle)).slice(0, 20);
  }, [data, q]);

  useEffect(() => setActive(0), [q]);

  if (!open) return null;

  const go = (item: Item) => {
    setOpen(false);
    navigate(item.route);
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-start justify-center bg-slate-900/40 p-4 pt-[12vh]" onClick={() => setOpen(false)}>
      <div
        className="w-full max-w-xl overflow-hidden rounded-xl border border-slate-200 bg-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2 border-b border-slate-100 px-3">
          <Search className="h-4 w-4 text-slate-400" />
          <input
            ref={inputRef}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'ArrowDown') {
                e.preventDefault();
                setActive((a) => Math.min(a + 1, results.length - 1));
              } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                setActive((a) => Math.max(a - 1, 0));
              } else if (e.key === 'Enter' && results[active]) {
                go(results[active]);
              }
            }}
            placeholder="Search pipelines, connectors, schemas, runs…"
            className="w-full bg-transparent py-3 text-sm text-slate-900 outline-none placeholder:text-slate-400"
          />
          <kbd className="rounded border border-slate-200 px-1.5 py-0.5 font-mono text-[10px] text-slate-400">esc</kbd>
        </div>

        <ul className="max-h-80 overflow-y-auto py-1">
          {results.length === 0 ? (
            <li className="px-4 py-6 text-center text-sm text-slate-400">No matches</li>
          ) : (
            results.map((item, i) => {
              const Icon = item.icon;
              return (
                <li key={item.id}>
                  <button
                    type="button"
                    onMouseEnter={() => setActive(i)}
                    onClick={() => go(item)}
                    className={cn(
                      'flex w-full items-center gap-3 px-4 py-2 text-left text-sm',
                      i === active ? 'bg-brand-50' : 'hover:bg-slate-50',
                    )}
                  >
                    <Icon className="h-4 w-4 shrink-0 text-slate-400" />
                    <span className="min-w-0 flex-1 truncate font-medium text-slate-800">{item.label}</span>
                    <span className="shrink-0 text-xs text-slate-400">{item.sub}</span>
                  </button>
                </li>
              );
            })
          )}
        </ul>
      </div>
    </div>
  );
}
