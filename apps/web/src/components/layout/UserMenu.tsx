import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import {
  BookOpen,
  ChevronDown,
  HelpCircle,
  LogOut,
  Settings,
  User,
} from 'lucide-react';
import { Avatar } from '@/components/ui/Avatar';
import { useAuth } from '@/contexts/AuthContext';
import { cn } from '@/lib/utils';

const HELP_URL = 'https://docs.marbee.io/support';

export function UserMenu() {
  const { profile, displayName, user, signOut } = useAuth();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, []);

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white px-2 py-1.5 pl-1.5 transition hover:bg-slate-50"
      >
        <Avatar
          name={profile?.name ?? displayName}
          email={profile?.email ?? user?.email}
          seed={user?.id}
          src={profile?.avatarUrl}
          size="sm"
        />
        <div className="hidden text-left sm:block">
          <p className="max-w-[160px] truncate text-sm font-medium text-slate-900">{displayName}</p>
          <p className="max-w-[160px] truncate text-[11px] text-slate-500">My account</p>
        </div>
        <ChevronDown className={cn('h-4 w-4 text-slate-400 transition', open && 'rotate-180')} />
      </button>

      {open && (
        <div className="absolute right-0 top-[calc(100%+8px)] z-50 w-64 overflow-hidden rounded-xl border border-slate-200 bg-white py-1 shadow-lg">
          <div className="border-b border-slate-100 px-4 py-3">
            <div className="flex items-center gap-3">
              <Avatar
                name={profile?.name ?? displayName}
                email={profile?.email ?? user?.email}
                seed={user?.id}
                src={profile?.avatarUrl}
                size="md"
              />
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-slate-900">{displayName}</p>
                <p className="truncate text-xs text-slate-500">{profile?.email ?? user?.email}</p>
              </div>
            </div>
          </div>

          <MenuLink to="/settings/account" icon={User} onClick={() => setOpen(false)}>
            My account
          </MenuLink>
          <MenuLink to="/settings/docs" icon={BookOpen} onClick={() => setOpen(false)}>
            Documentation
          </MenuLink>
          <a
            href={HELP_URL}
            target="_blank"
            rel="noreferrer"
            className="flex w-full items-center gap-3 px-4 py-2.5 text-sm text-slate-700 hover:bg-slate-50"
            onClick={() => setOpen(false)}
          >
            <HelpCircle className="h-4 w-4 text-slate-400" />
            Help & support
          </a>
          <MenuLink to="/settings/general" icon={Settings} onClick={() => setOpen(false)}>
            Settings
          </MenuLink>

          <div className="my-1 border-t border-slate-100" />

          <button
            type="button"
            className="flex w-full items-center gap-3 px-4 py-2.5 text-sm text-red-600 hover:bg-red-50"
            onClick={() => {
              setOpen(false);
              void signOut();
            }}
          >
            <LogOut className="h-4 w-4" />
            Sign out
          </button>
        </div>
      )}
    </div>
  );
}

function MenuLink({
  to,
  icon: Icon,
  children,
  onClick,
}: {
  to: string;
  icon: typeof User;
  children: ReactNode;
  onClick?: () => void;
}) {
  return (
    <Link
      to={to}
      onClick={onClick}
      className="flex items-center gap-3 px-4 py-2.5 text-sm text-slate-700 hover:bg-slate-50"
    >
      <Icon className="h-4 w-4 text-slate-400" />
      {children}
    </Link>
  );
}
