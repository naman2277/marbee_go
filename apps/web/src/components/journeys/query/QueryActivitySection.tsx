import type { ReactNode } from 'react';

type Props = {
  title: string;
  children: ReactNode;
  dark?: boolean;
  action?: ReactNode;
};

/** ACC-style grouped section — Target selection, Complementary information, Results. */
export function QueryActivitySection({ title, children, dark, action }: Props) {
  return (
    <section
      className={`rounded-xl border ${
        dark ? 'border-slate-700 bg-slate-900/30' : 'border-slate-200 bg-white'
      }`}
    >
      <div
        className={`flex items-center justify-between gap-2 border-b px-4 py-2.5 ${
          dark ? 'border-slate-700 bg-slate-900/50' : 'border-slate-100 bg-slate-50/90'
        }`}
      >
        <h3 className={`text-xs font-semibold uppercase tracking-wide ${dark ? 'text-slate-300' : 'text-slate-600'}`}>
          {title}
        </h3>
        {action}
      </div>
      <div className="p-4">{children}</div>
    </section>
  );
}
