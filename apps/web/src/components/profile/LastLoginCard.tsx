import { Clock } from 'lucide-react';
import { Badge } from '@/components/ui';
import { formatLastLogin } from '@/lib/member-settings';

type LastLoginCardProps = {
  lastLoginAt: string | null;
  memberSince?: string | null;
};

export function LastLoginCard({ lastLoginAt, memberSince }: LastLoginCardProps) {
  const login = formatLastLogin(lastLoginAt);

  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50/60 p-4">
      <div className="flex items-start gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white shadow-sm">
          <Clock className="h-5 w-5 text-brand-600" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-sm font-semibold text-slate-900">Last login</h3>
            <Badge variant={login.never ? 'warning' : 'success'}>
              {login.never ? 'No login recorded' : login.relative}
            </Badge>
          </div>
          <p className="mt-1 text-sm text-slate-700">{login.label}</p>
          {memberSince && (
            <p className="mt-2 text-xs text-slate-500">
              Member since {new Date(memberSince).toLocaleDateString(undefined, {
                year: 'numeric',
                month: 'long',
                day: 'numeric',
              })}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
