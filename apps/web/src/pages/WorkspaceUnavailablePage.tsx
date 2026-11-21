import { useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { Button, MarbeeLogo } from '@/components/ui';

// Shown instead of the app when a signed-in user has no active workspace (TD-20):
// either they were never added to one, or their workspace is suspended (D-020).
// There is no fallback workspace any more — the app never pretends.
export function WorkspaceUnavailablePage() {
  const { workspaceStatus, suspendedWorkspaces, user, refreshWorkspace, signOut } = useAuth();
  const [checking, setChecking] = useState(false);
  const suspended = workspaceStatus === 'suspended';
  const names = suspendedWorkspaces.join(', ');

  const checkAgain = async () => {
    setChecking(true);
    try {
      await refreshWorkspace();
    } finally {
      setChecking(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-brand-50 via-white to-teal-50 px-4">
      <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-8 shadow-xl" role="main">
        <div className="mb-8 flex items-center justify-center">
          <MarbeeLogo size="lg" />
        </div>

        <h1 className="text-center text-xl font-semibold text-slate-900">
          {suspended ? 'Your workspace is suspended' : 'No workspace yet'}
        </h1>

        <div className="mt-4 space-y-3 text-center text-sm text-slate-600">
          {suspended ? (
            <>
              <p>
                Access to <span className="font-medium text-slate-900">{names}</span> is paused. Your data is safe and
                nothing has been deleted.
              </p>
              <p>Please contact your workspace owner or Marbee support to restore access.</p>
            </>
          ) : (
            <>
              <p>
                You're signed in{user?.email ? <> as <span className="font-medium text-slate-900">{user.email}</span></> : null},
                but you aren't a member of any Marbee workspace.
              </p>
              <p>Ask your workspace admin for an invitation. It arrives by email with a link to join.</p>
            </>
          )}
        </div>

        <div className="mt-8 space-y-3">
          <Button className="w-full" onClick={checkAgain} disabled={checking}>
            {checking ? 'Checking…' : 'Check again'}
          </Button>
          <Button variant="secondary" className="w-full" onClick={() => void signOut()}>
            Sign out
          </Button>
        </div>
      </div>
    </div>
  );
}
