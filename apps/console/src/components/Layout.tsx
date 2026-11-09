import { NavLink, Outlet } from 'react-router-dom';
import clsx from 'clsx';
import { Building2, LogOut, ScrollText, ShieldCheck, Tags } from 'lucide-react';
import { useAdmin } from '@/auth/AuthGate';

const NAV = [
  { to: '/tenants', label: 'Tenants', icon: Building2 },
  { to: '/rates', label: 'Rate card', icon: Tags },
  { to: '/audit', label: 'Audit log', icon: ScrollText },
];

export function Layout() {
  const { admin, signOut } = useAdmin();
  return (
    <div className="flex min-h-screen bg-slate-50">
      <aside className="hidden w-56 shrink-0 flex-col border-r border-slate-200 bg-white md:flex print:hidden">
        <div className="flex items-center gap-2 px-5 py-4">
          <ShieldCheck className="h-5 w-5 text-brand-600" aria-hidden />
          <span className="font-semibold text-slate-900">Marbee Console</span>
        </div>
        <nav className="flex-1 space-y-0.5 px-3">
          {NAV.map(({ to, label, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              className={({ isActive }) =>
                clsx(
                  'flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium',
                  isActive ? 'bg-brand-50 text-brand-700' : 'text-slate-600 hover:bg-slate-100',
                )
              }
            >
              <Icon className="h-4 w-4" aria-hidden /> {label}
            </NavLink>
          ))}
        </nav>
        <div className="border-t border-slate-100 px-5 py-4 text-xs text-slate-500">
          <div className="truncate font-medium text-slate-700" title={admin.email}>{admin.email}</div>
          <div className="capitalize">{admin.role}</div>
          <button type="button" onClick={signOut} className="mt-3 inline-flex items-center gap-1.5 text-slate-600 hover:text-slate-900">
            <LogOut className="h-3.5 w-3.5" aria-hidden /> Sign out
          </button>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        {/* Compact top bar for tablet / narrow screens */}
        <header className="flex items-center justify-between border-b border-slate-200 bg-white px-4 py-3 md:hidden print:hidden">
          <span className="font-semibold text-slate-900">Marbee Console</span>
          <nav className="flex gap-3 text-sm">
            {NAV.map(({ to, label }) => (
              <NavLink key={to} to={to} className={({ isActive }) => (isActive ? 'font-medium text-brand-700' : 'text-slate-600')}>
                {label}
              </NavLink>
            ))}
          </nav>
        </header>
        <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-6 md:px-8">
          <Outlet />
        </main>
      </div>
    </div>
  );
}

export function PageHeader({ title, description, action }: { title: string; description?: string; action?: React.ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-xl font-semibold text-slate-900">{title}</h1>
        {description && <p className="mt-1 text-sm text-slate-500">{description}</p>}
      </div>
      {action}
    </div>
  );
}
