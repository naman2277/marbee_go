import { useState } from 'react';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { Button, MarbeeLogo } from '@/components/ui';

// Sign-in only (SEC-03 / D-017). Marbee is invite-only: workspaces are created by
// Marbee platform admins and people join through an invitation email. Public signup
// used to drop every new account into the demo tenant as Tenant Admin.
export function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { signIn } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const cameForSignup = searchParams.get('mode') === 'signup';

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    const result = await signIn(email, password);
    setLoading(false);
    if (result.error) {
      setError(result.error);
    } else {
      navigate('/dashboard');
    }
  };

  const inputCls =
    'mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20';

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-brand-50 via-white to-teal-50 px-4">
      <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-8 shadow-xl">
        <div className="mb-8 flex items-center justify-center">
          <Link to="/">
            <MarbeeLogo size="lg" />
          </Link>
        </div>

        <h1 className="text-center text-xl font-semibold text-slate-900">Welcome back</h1>
        <p className="mt-1 text-center text-sm text-slate-500">Customer Engagement & Marketing Automation</p>

        {cameForSignup && (
          <div className="mt-6 rounded-lg border border-brand-100 bg-brand-50 px-4 py-3 text-sm text-slate-700" role="status">
            Marbee workspaces are set up by our team. If your company uses Marbee, ask your workspace admin
            for an invitation — it arrives by email with a link to set your password.
          </div>
        )}

        <form onSubmit={handleSubmit} className="mt-8 space-y-4">
          <div>
            <label htmlFor="login-email" className="block text-sm font-medium text-slate-700">Email</label>
            <input
              id="login-email"
              type="email"
              autoComplete="username"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className={inputCls}
              required
            />
          </div>
          <div>
            <label htmlFor="login-password" className="block text-sm font-medium text-slate-700">Password</label>
            <input
              id="login-password"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className={inputCls}
              required
            />
          </div>

          {error && <p className="text-sm text-red-600" role="alert">{error}</p>}

          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? 'Please wait...' : 'Sign in'}
          </Button>
        </form>

        <p className="mt-6 text-center text-sm text-slate-500">
          Access is by invitation. Need an account? Ask your workspace admin.
        </p>
      </div>
    </div>
  );
}
