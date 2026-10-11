import type { MarbeeForm } from '@/lib/forms';
import { isMappingConfigured } from '@/lib/form-mapping';

type Props = {
  form: MarbeeForm;
};

export function FormSetupProgress({ form }: Props) {
  const steps = [
    { label: 'Fields', done: form.fields.length > 0 },
    { label: 'Mapping', done: isMappingConfigured(form.schema_mapping) },
    { label: 'Settings', done: Boolean(form.settings.submit_label) },
    { label: 'Published', done: form.status === 'published' },
  ];

  const completed = steps.filter((s) => s.done).length;
  const pct = Math.round((completed / steps.length) * 100);

  return (
    <div className="border-b border-slate-100 bg-slate-50/60 px-6 py-4">
      <div className="mb-2 flex items-center justify-between text-xs text-slate-500">
        <span className="font-medium text-slate-700">Setup progress</span>
        <span>{completed}/{steps.length} complete · {pct}%</span>
      </div>
      <div className="mb-3 h-1.5 overflow-hidden rounded-full bg-slate-200">
        <div
          className="h-full rounded-full bg-brand-600 transition-all"
          style={{ width: `${pct}%` }}
        />
      </div>
      <div className="flex flex-wrap gap-2">
        {steps.map((s) => (
          <span
            key={s.label}
            className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${
              s.done ? 'bg-emerald-100 text-emerald-700' : 'bg-white text-slate-500 ring-1 ring-slate-200'
            }`}
          >
            {s.done ? '✓ ' : ''}{s.label}
          </span>
        ))}
      </div>
    </div>
  );
}
