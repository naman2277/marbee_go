/**
 * Realistic device chrome for the studio previews. Pure presentational.
 */
import { Battery, ChevronLeft, Signal, Wifi } from 'lucide-react';

export function PhoneFrame({
  children,
  variant = 'ios',
  statusColor = '#0b141a',
  className,
}: {
  children: React.ReactNode;
  /** ios = notch, android = punch-hole */
  variant?: 'ios' | 'android';
  statusColor?: string;
  className?: string;
}) {
  return (
    <div
      className={`relative mx-auto w-[320px] shrink-0 overflow-hidden rounded-[2.75rem] border-[10px] border-slate-900 bg-black shadow-[0_30px_70px_-20px_rgba(15,23,42,0.55)] ${className ?? ''}`}
    >
      {/* status bar */}
      <div
        className="relative flex h-9 items-center justify-between px-6 text-[11px] font-semibold text-white"
        style={{ background: statusColor }}
      >
        <span className="tabular-nums">9:41</span>
        {variant === 'ios' ? (
          <span className="absolute left-1/2 top-0 h-5 w-32 -translate-x-1/2 rounded-b-2xl bg-slate-900" />
        ) : (
          <span className="absolute left-1/2 top-2.5 h-2 w-2 -translate-x-1/2 rounded-full bg-slate-900" />
        )}
        <span className="flex items-center gap-1">
          <Signal className="h-3 w-3" />
          <Wifi className="h-3 w-3" />
          <Battery className="h-3.5 w-3.5" />
        </span>
      </div>
      {children}
      {/* home indicator */}
      <div className="flex h-5 items-center justify-center bg-black">
        <span className="h-1 w-28 rounded-full bg-white/70" />
      </div>
    </div>
  );
}

export function AppHeader({
  color,
  title,
  subtitle,
  avatar,
}: {
  color: string;
  title: string;
  subtitle?: string;
  avatar?: string;
}) {
  return (
    <div className="flex items-center gap-2.5 px-3 py-2.5 text-white" style={{ background: color }}>
      <ChevronLeft className="h-5 w-5 opacity-90" />
      <div className="flex h-8 w-8 items-center justify-center overflow-hidden rounded-full bg-white/25 text-[11px] font-bold">
        {avatar ? <img src={avatar} alt="" className="h-full w-full object-cover" /> : title.slice(0, 2).toUpperCase()}
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold leading-tight">{title}</p>
        {subtitle && <p className="truncate text-[10px] opacity-80">{subtitle}</p>}
      </div>
    </div>
  );
}

export function BrowserFrame({
  children,
  url = 'example.com',
  className,
}: {
  children: React.ReactNode;
  url?: string;
  className?: string;
}) {
  return (
    <div className={`mx-auto w-full max-w-[440px] overflow-hidden rounded-2xl border border-slate-200 bg-slate-100 shadow-xl ${className ?? ''}`}>
      <div className="flex items-center gap-2 border-b border-slate-200 bg-slate-50 px-3 py-2">
        <span className="h-2.5 w-2.5 rounded-full bg-[#ff5f57]" />
        <span className="h-2.5 w-2.5 rounded-full bg-[#febc2e]" />
        <span className="h-2.5 w-2.5 rounded-full bg-[#28c840]" />
        <div className="ml-2 flex-1 truncate rounded-md bg-white px-2 py-1 text-[10px] text-slate-400">{url}</div>
      </div>
      <div className="bg-gradient-to-br from-slate-200 to-slate-300 p-6">{children}</div>
    </div>
  );
}
