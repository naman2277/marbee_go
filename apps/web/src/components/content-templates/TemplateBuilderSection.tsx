import type { ReactNode } from 'react';

type Props = {
  title: string;
  description?: string;
  required?: boolean;
  action?: ReactNode;
  children: ReactNode;
};

export function TemplateBuilderSection({ title, description, required, action, children }: Props) {
  return (
    <section className="rounded-xl border border-slate-200 bg-white">
      <div className="flex items-start justify-between gap-3 border-b border-slate-100 px-4 py-3">
        <div>
          <h3 className="text-sm font-semibold text-slate-900">
            {title}
            {required && <span className="ml-1 text-red-500">*</span>}
          </h3>
          {description && <p className="mt-0.5 text-xs text-slate-500">{description}</p>}
        </div>
        {action}
      </div>
      <div className="p-4">{children}</div>
    </section>
  );
}
