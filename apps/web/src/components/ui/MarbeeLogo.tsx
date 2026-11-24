
type MarbeeLogoProps = {
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl';
  showText?: boolean;
  className?: string;
  textClassName?: string;
  iconOnly?: boolean;
};

const SIZE_CLASSES = {
  xs: 'h-6 w-6',
  sm: 'h-8 w-8',
  md: 'h-9 w-9',
  lg: 'h-10 w-10',
  xl: 'h-12 w-12',
};

const TEXT_CLASSES = {
  xs: 'text-sm font-bold',
  sm: 'text-base font-bold',
  md: 'text-lg font-bold',
  lg: 'text-xl font-bold',
  xl: 'text-2xl font-bold',
};

export function MarbeeLogo({
  size = 'md',
  showText = true,
  className = '',
  textClassName = '',
  iconOnly = false,
}: MarbeeLogoProps) {
  return (
    <div className={`flex items-center gap-2.5 ${className}`}>
      <div
        className={`flex shrink-0 items-center justify-center rounded-xl bg-slate-950 p-1.5 shadow-sm ring-1 ring-slate-800/80 ${SIZE_CLASSES[size]}`}
      >
        <img
          src="/favicon.svg"
          alt="Marbee logo"
          className="h-full w-full object-contain"
        />
      </div>
      {showText && !iconOnly && (
        <span className={`tracking-tight text-slate-900 font-bold ${TEXT_CLASSES[size]} ${textClassName}`}>
          Marbee
        </span>
      )}
    </div>
  );
}
