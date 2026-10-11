import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Mail } from 'lucide-react';
import { Button, Card, MarbeeLogo } from '@/components/ui';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';
import { acceptInvite, fetchInvitePreview, type InvitePreview } from '@/lib/access-management';

export function AcceptInvitePage() {
  const { token } = useParams<{ token: string }>();
  const navigate = useNavigate();
  const { session, signIn, refreshAccess } = useAuth();
  const [preview, setPreview] = useState<InvitePreview | null>(null);
  const [loading, setLoading] = useState(true);
  const [accepting, setAccepting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [signingIn, setSigningIn] = useState(false);

  useEffect(() => {
    if (!token) return;
    setLoading(true);
    fetchInvitePreview(token)
      .then(setPreview)
      .finally(() => setLoading(false));
  }, [token]);

  useEffect(() => {
    if (preview?.email && !email) {
      setEmail(preview.email);
    }
  }, [preview?.email, email]);

  const handleAccept = async () => {
    if (!token) return;
    setAccepting(true);
    setError(null);
    try {
      await acceptInvite(token);
      await refreshAccess();
      navigate('/dashboard');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to accept invite');
    } finally {
      setAccepting(false);
    }
  };

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setSigningIn(true);
    setError(null);
    const result = await signIn(email, password);
    setSigningIn(false);
    if (result.error) {
      setError(result.error);
      return;
    }
    await handleAccept();
  };

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50">
        <p className="text-slate-500">Loading invitation…</p>
      </div>
    );
  }

  if (!preview?.valid) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 p-4">
        <Card className="max-w-md p-8 text-center">
          <h1 className="text-xl font-semibold text-slate-900">Invalid invitation</h1>
          <p className="mt-2 text-sm text-slate-500">{preview?.reason ?? 'This invite link is not valid.'}</p>
          <Link to="/login" className="mt-6 inline-block text-sm font-medium text-brand-600 hover:underline">
            Go to sign in
          </Link>
        </Card>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-brand-50 via-white to-teal-50 p-4">
      <Card className="w-full max-w-md p-8">
        <div className="mb-6 flex items-center justify-center">
          <MarbeeLogo size="lg" />
        </div>

        <div className="rounded-xl border border-slate-100 bg-slate-50 p-4 text-center">
          <Mail className="mx-auto h-8 w-8 text-brand-600" />
          <h1 className="mt-3 text-lg font-semibold text-slate-900">Join {preview.tenantName}</h1>
          <p className="mt-1 text-sm text-slate-500">
            You&apos;ve been invited as <strong>{preview.roleName}</strong>
          </p>
          <p className="mt-2 text-xs text-slate-400">{preview.email}</p>
        </div>

        {session && preview.email && session.user.email?.toLowerCase() !== preview.email.toLowerCase() ? (
          <div className="mt-6 space-y-4">
            <p className="text-center text-sm text-amber-800">
              You&apos;re signed in as <strong>{session.user.email}</strong>, but this invite is for{' '}
              <strong>{preview.email}</strong>.
            </p>
            <Button
              className="w-full"
              variant="secondary"
              onClick={async () => {
                await supabase.auth.signOut();
                window.location.reload();
              }}
            >
              Sign out & continue as {preview.email}
            </Button>
          </div>
        ) : session ? (
          <div className="mt-6 space-y-4">
            <p className="text-center text-sm text-slate-600">
              Signed in as {session.user.email}. Accept to join this workspace.
            </p>
            {error && <p className="text-center text-sm text-red-600">{error}</p>}
            <Button className="w-full" disabled={accepting} onClick={() => void handleAccept()}>
              {accepting ? 'Accepting…' : 'Accept invitation'}
            </Button>
          </div>
        ) : (
          <form onSubmit={handleSignIn} className="mt-6 space-y-4">
            <p className="text-center text-sm text-slate-600">
              Sign in with <strong>{preview.email}</strong> to accept.
            </p>
            <input
              type="email"
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="Email"
              required
            />
            <input
              type="password"
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Password"
              required
            />
            {error && <p className="text-sm text-red-600">{error}</p>}
            <Button type="submit" className="w-full" disabled={signingIn}>
              {signingIn ? 'Signing in…' : 'Sign in & accept'}
            </Button>
            <p className="text-center text-xs text-slate-500">
              No account?{' '}
              <Link to={`/login?signup=1`} className="text-brand-600 hover:underline">
                Create one
              </Link>{' '}
              with this email first.
            </p>
          </form>
        )}
      </Card>
    </div>
  );
}
