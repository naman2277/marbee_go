import { useState } from 'react';
import { BookOpen, Code2, Key, KeyRound } from 'lucide-react';
import { PageHeader } from '@/components/ui';
import { RequirePermission } from '@/components/auth/RequirePermission';
import { ApiKeysPanel } from '@/components/api/ApiKeysPanel';
import { CustomEndpointsPanel } from '@/components/api/CustomEndpointsPanel';
import { ApiReferencePanel } from '@/components/api/ApiReferencePanel';
import { GlobalVariablesPanel } from '@/components/api/GlobalVariablesPanel';
import { PERMISSIONS } from '@/lib/permissions';

type Tab = 'keys' | 'encryption' | 'endpoints' | 'reference';

export function ApiSettingsPage() {
  const [tab, setTab] = useState<Tab>('keys');

  const tabs: { id: Tab; label: string; icon: typeof Key }[] = [
    { id: 'keys', label: 'API keys', icon: Key },
    { id: 'encryption', label: 'Encryption & variables', icon: KeyRound },
    { id: 'endpoints', label: 'Custom endpoints', icon: Code2 },
    { id: 'reference', label: 'Reference', icon: BookOpen },
  ];

  return (
    <RequirePermission permission={PERMISSIONS.API_KEYS_MANAGE}>
      <div>
        <PageHeader
          title="API"
          description="Manage keys, build secure custom endpoints, and integrate with Marbee programmatically"
        />

        <div className="mb-6 flex gap-1 rounded-xl border border-slate-200 bg-slate-50 p-1">
          {tabs.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              type="button"
              onClick={() => setTab(id)}
              className={`inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition ${
                tab === id ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              <Icon className={`h-4 w-4 ${tab === id ? 'text-orange-500' : ''}`} />
              {label}
            </button>
          ))}
        </div>

        {tab === 'keys' && <ApiKeysPanel />}
        {tab === 'encryption' && <GlobalVariablesPanel />}
        {tab === 'endpoints' && <CustomEndpointsPanel />}
        {tab === 'reference' && <ApiReferencePanel />}
      </div>
    </RequirePermission>
  );
}

/** @deprecated Use ApiSettingsPage — kept for route redirect */
export function ApiKeysSettingsPage() {
  return <ApiSettingsPage />;
}
