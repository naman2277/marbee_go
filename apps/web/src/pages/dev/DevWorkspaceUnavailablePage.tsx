/**
 * DEV-ONLY harness for the "no workspace" / "workspace suspended" screen (TD-20).
 * Mounted at /dev/workspace-unavailable?state=none|suspended when import.meta.env.DEV.
 * Supplies a fake auth context so the screen can be seen without a real account.
 */
import { useContext } from 'react';
import { useSearchParams } from 'react-router-dom';
import { AuthContext } from '@/contexts/AuthContext';
import { WorkspaceUnavailablePage } from '@/pages/WorkspaceUnavailablePage';

export function DevWorkspaceUnavailablePage() {
  const real = useContext(AuthContext);
  const [params] = useSearchParams();
  const suspended = params.get('state') === 'suspended';
  if (!real) return null;
  const fake = {
    ...real,
    user: { id: 'dev', email: 'new.person@example.test' } as unknown as typeof real.user,
    workspaceStatus: suspended ? ('suspended' as const) : ('none' as const),
    suspendedWorkspaces: suspended ? ['Acme Retail'] : [],
    refreshWorkspace: async () => { await new Promise((r) => setTimeout(r, 600)); },
    signOut: async () => { window.alert('Sign out (dev harness — nothing happens)'); },
  };
  return (
    <AuthContext.Provider value={fake}>
      <WorkspaceUnavailablePage />
    </AuthContext.Provider>
  );
}
