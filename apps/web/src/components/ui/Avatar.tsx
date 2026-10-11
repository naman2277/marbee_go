import { cn } from '@/lib/utils';
import { getUserAvatarColor, getUserInitials } from '@/lib/user-avatar';

type AvatarProps = {
  name?: string | null;
  email?: string | null;
  src?: string | null;
  seed?: string;
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl';
  className?: string;
};

const SIZE_CLASS = {
  xs: 'h-6 w-6 text-[10px]',
  sm: 'h-8 w-8 text-xs',
  md: 'h-10 w-10 text-sm',
  lg: 'h-12 w-12 text-base',
  xl: 'h-16 w-16 text-lg',
} as const;

export function Avatar({ name, email, src, seed, size = 'md', className }: AvatarProps) {
  const initials = getUserInitials(name, email);
  const colorSeed = seed ?? email ?? name ?? 'user';
  const gradient = getUserAvatarColor(colorSeed);

  if (src) {
    return (
      <img
        src={src}
        alt={name ?? email ?? 'User avatar'}
        className={cn('rounded-full object-cover ring-2 ring-white', SIZE_CLASS[size], className)}
      />
    );
  }

  return (
    <div
      className={cn(
        'flex shrink-0 items-center justify-center rounded-full bg-gradient-to-br font-semibold text-white ring-2 ring-white',
        gradient,
        SIZE_CLASS[size],
        className,
      )}
      aria-hidden
    >
      {initials}
    </div>
  );
}
