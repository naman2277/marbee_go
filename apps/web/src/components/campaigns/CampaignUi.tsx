import { Link } from 'react-router-dom';
import { Bell, ChevronRight, Globe, Mail, MessageCircle, MessageSquare, Send, type LucideIcon } from 'lucide-react';
import { CAMPAIGN_STATUS_CONFIG, compactNumber, type CampaignStatus } from '@/lib/campaigns';

export function CampaignStatusBadge({ status, size = 'md' }: { status: CampaignStatus; size?: 'sm' | 'md' }) {
  const c = CAMPAIGN_STATUS_CONFIG[status];
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border border-current/15 font-semibold ${c.bg} ${c.text} ${
        size === 'sm' ? 'px-2 py-0.5 text-[10px]' : 'px-2.5 py-0.5 text-xs'
      }`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${c.dot} ${status === 'running' ? 'animate-pulse' : ''}`} />
      {c.label}
    </span>
  );
}

const CHANNEL_ICONS: Record<string, LucideIcon> = {
  email: Mail,
  sms: MessageSquare,
  whatsapp: MessageCircle,
  push: Bell,
  web_push: Globe,
};

export function channelIcon(channel: string): LucideIcon {
  return CHANNEL_ICONS[channel] ?? Send;
}

export function ChannelChip({ channel, label, count }: { channel: string; label?: string; count?: number }) {
  const Icon = channelIcon(channel);
  return (
    <span className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-white px-1.5 py-0.5 text-[11px] font-medium text-slate-600">
      <Icon className="h-3 w-3 text-slate-500" />
      {label ?? channel}
      {count !== undefined && <span className="tabular-nums text-slate-400">{compactNumber(count)}</span>}
    </span>
  );
}

export function KpiCard({
  group,
  label,
  value,
  hint,
  tone = 'slate',
  onClick,
}: {
  group: string;
  label: string;
  value: number | string | null;
  hint?: string;
  tone?: 'slate' | 'indigo' | 'emerald' | 'amber' | 'red' | 'sky' | 'violet';
  onClick?: () => void;
}) {
  const tones: Record<string, string> = {
    slate: 'text-slate-900',
    indigo: 'text-indigo-700',
    emerald: 'text-emerald-700',
    amber: 'text-amber-700',
    red: 'text-red-700',
    sky: 'text-sky-700',
    violet: 'text-violet-700',
  };
  const body = (
    <>
      <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">{group}</p>
      <p className="mt-0.5 text-xs font-medium text-slate-600">{label}</p>
      <p className={`mt-1.5 text-xl font-bold tabular-nums ${tones[tone]}`}>
        {value === null ? '—' : typeof value === 'number' ? compactNumber(value) : value}
      </p>
      {hint && <p className="mt-0.5 truncate text-[10px] text-slate-400">{hint}</p>}
    </>
  );
  const cls = 'rounded-xl border border-slate-200/80 bg-white p-3.5 text-left shadow-xs transition-all';
  return onClick ? (
    <button type="button" onClick={onClick} className={`${cls} hover:border-indigo-300 hover:shadow-md`}>
      {body}
    </button>
  ) : (
    <div className={cls}>{body}</div>
  );
}

export function Breadcrumbs({ items }: { items: { label: string; to?: string }[] }) {
  return (
    <nav className="flex flex-wrap items-center gap-1 text-xs text-slate-500" aria-label="Breadcrumb">
      {items.map((item, i) => (
        <span key={`${item.label}-${i}`} className="flex items-center gap-1">
          {i > 0 && <ChevronRight className="h-3 w-3 text-slate-300" />}
          {item.to ? (
            <Link to={item.to} className="font-medium hover:text-indigo-600">
              {item.label}
            </Link>
          ) : (
            <span className="font-semibold text-slate-800">{item.label}</span>
          )}
        </span>
      ))}
    </nav>
  );
}

export function TabBar<T extends string>({
  tabs,
  active,
  onChange,
}: {
  tabs: { id: T; label: string; count?: number }[];
  active: T;
  onChange: (id: T) => void;
}) {
  return (
    <div className="flex gap-1 overflow-x-auto border-b border-slate-200">
      {tabs.map((t) => (
        <button
          key={t.id}
          type="button"
          onClick={() => onChange(t.id)}
          className={`-mb-px whitespace-nowrap border-b-2 px-3.5 py-2.5 text-sm font-medium transition-colors ${
            active === t.id
              ? 'border-indigo-600 text-indigo-700'
              : 'border-transparent text-slate-500 hover:border-slate-300 hover:text-slate-800'
          }`}
        >
          {t.label}
          {t.count !== undefined && (
            <span className={`ml-1.5 rounded-full px-1.5 py-0.5 text-[10px] ${active === t.id ? 'bg-indigo-100 text-indigo-700' : 'bg-slate-100 text-slate-500'}`}>
              {t.count}
            </span>
          )}
        </button>
      ))}
    </div>
  );
}

export function SectionCard({
  title,
  action,
  children,
  className = '',
}: {
  title?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={`rounded-2xl border border-slate-200/80 bg-white shadow-xs ${className}`}>
      {title && (
        <div className="flex items-center justify-between gap-2 border-b border-slate-100 px-5 py-3">
          <h3 className="text-sm font-semibold text-slate-900">{title}</h3>
          {action}
        </div>
      )}
      <div className="p-5">{children}</div>
    </section>
  );
}

/** Horizontal funnel bars — no chart library in this app. */
export function FunnelBars({ rows }: { rows: { label: string; value: number | null; color: string }[] }) {
  const max = Math.max(1, ...rows.map((r) => r.value ?? 0));
  return (
    <div className="space-y-2.5">
      {rows.map((r) => (
        <div key={r.label} className="grid grid-cols-[90px_1fr_64px] items-center gap-3 text-xs">
          <span className="font-medium text-slate-600">{r.label}</span>
          <div className="h-2.5 overflow-hidden rounded-full bg-slate-100">
            <div className={`h-full rounded-full ${r.color}`} style={{ width: `${((r.value ?? 0) / max) * 100}%` }} />
          </div>
          <span className="text-right font-mono tabular-nums text-slate-800">{r.value === null ? '—' : compactNumber(r.value)}</span>
        </div>
      ))}
    </div>
  );
}

/** Vertical per-day bars. */
export function DailyBars({ days, color = 'bg-indigo-500' }: { days: { date: string; value: number }[]; color?: string }) {
  const max = Math.max(1, ...days.map((d) => d.value));
  if (!days.length) return <p className="py-8 text-center text-xs text-slate-400">No activity in this period.</p>;
  return (
    <div className="flex h-36 items-end gap-1">
      {days.map((d) => (
        <div key={d.date} className="group relative flex h-full flex-1 flex-col justify-end" title={`${d.date}: ${d.value.toLocaleString()}`}>
          <div className={`w-full rounded-t ${color} opacity-80 group-hover:opacity-100`} style={{ height: `${Math.max(2, (d.value / max) * 100)}%` }} />
        </div>
      ))}
    </div>
  );
}
