import { cn } from '@/lib/utils';
import {
  AUTH_METHOD_LABELS,
  CAPABILITY_LABELS,
  type ConnectorAuthMethod,
  type ConnectorCapability,
} from '@/lib/connector-catalog';

/**
 * A small, monochrome descriptor chip used on marketplace cards and the
 * connector detail header. Deliberately quiet — it labels a fact, it is not
 * a status. Status uses {@link StatusPill}.
 */
export function CapabilityBadge({
  children,
  tone = 'neutral',
  className,
}: {
  children: React.ReactNode;
  tone?: 'neutral' | 'accent';
  className?: string;
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-md px-1.5 py-0.5 font-mono text-[10px] font-medium uppercase tracking-wide ring-1 ring-inset',
        tone === 'accent'
          ? 'bg-brand-50 text-brand-700 ring-brand-600/20'
          : 'bg-slate-50 text-slate-600 ring-slate-500/15',
        className,
      )}
    >
      {children}
    </span>
  );
}

export function CapabilityBadgeRow({
  capabilities,
  className,
}: {
  capabilities: ConnectorCapability[];
  className?: string;
}) {
  if (!capabilities.length) return null;
  return (
    <div className={cn('flex flex-wrap gap-1', className)}>
      {capabilities.map((c) => (
        <CapabilityBadge key={c}>{CAPABILITY_LABELS[c]}</CapabilityBadge>
      ))}
    </div>
  );
}

export function AuthMethodBadge({ method }: { method: ConnectorAuthMethod }) {
  return <CapabilityBadge tone="accent">{AUTH_METHOD_LABELS[method]}</CapabilityBadge>;
}
