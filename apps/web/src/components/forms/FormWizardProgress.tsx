type Props = {
  step: number;
  total: number;
  labels: string[];
};

export function FormWizardProgress({ step, total, labels }: Props) {
  const pct = Math.round((step / total) * 100);

  return (
    <div className="mb-6">
      <div className="mb-2 flex items-center justify-between text-xs text-slate-500">
        <span>
          Step {step} of {total}
          {labels[step - 1] ? ` · ${labels[step - 1]}` : ''}
        </span>
        <span>{pct}%</span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-slate-100">
        <div
          className="h-full rounded-full bg-brand-600 transition-all duration-300"
          style={{ width: `${pct}%` }}
        />
      </div>
      <div className="mt-3 hidden gap-2 sm:flex">
        {labels.map((label, i) => (
          <span
            key={label}
            className={`rounded-full px-2.5 py-0.5 text-[10px] font-medium uppercase tracking-wide ${
              i + 1 <= step ? 'bg-brand-50 text-brand-700' : 'bg-slate-100 text-slate-400'
            }`}
          >
            {label}
          </span>
        ))}
      </div>
    </div>
  );
}
