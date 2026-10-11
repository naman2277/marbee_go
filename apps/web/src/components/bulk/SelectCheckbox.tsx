type Props = {
  checked: boolean;
  indeterminate?: boolean;
  onChange: () => void;
  disabled?: boolean;
  'aria-label'?: string;
};

export function SelectCheckbox({
  checked,
  indeterminate,
  onChange,
  disabled,
  'aria-label': ariaLabel = 'Select row',
}: Props) {
  return (
    <input
      type="checkbox"
      checked={checked}
      ref={(el) => {
        if (el) el.indeterminate = Boolean(indeterminate);
      }}
      onChange={onChange}
      disabled={disabled}
      aria-label={ariaLabel}
      className="h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-500 disabled:opacity-40"
      onClick={(e) => e.stopPropagation()}
    />
  );
}
