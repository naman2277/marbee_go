import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';

type Props = {
  icon: LucideIcon;
  children: ReactNode;
  trailing?: ReactNode;
  dark?: boolean;
  className?: string;
};

/** Input wrapper with a left icon — matches personalisation field styling. */
export function IconField({ icon: Icon, children, trailing, dark, className }: Props) {
  return (
    <div className={`relative ${className ?? ''}`}>
      <Icon
        className={`pointer-events-none absolute left-3 top-1/2 z-10 h-4 w-4 -translate-y-1/2 ${
          dark ? 'text-slate-500' : 'text-slate-400'
        }`}
      />
      <div className="[&_input]:pl-9 [&_select]:pl-9 [&_textarea]:pl-9">{children}</div>
      {trailing}
    </div>
  );
}
