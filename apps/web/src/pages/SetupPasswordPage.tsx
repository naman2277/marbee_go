import { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Check, Lock, Mail } from 'lucide-react';
import { Button, Card, MarbeeLogo } from '@/components/ui';
import { supabase } from '@/lib/supabase';
import { bootstrapInviteSession } from '@/lib/auth-invite-session';
import {
  PASSWORD_REQUIREMENTS,
  passwordStrengthLabel,
  passwordsMatch,
  validatePassword,
} from '@/lib/password-policy';
import { activateProvisionedMembership } from '@/lib/access-management';
import { useAuth } from '@/contexts/AuthContext';

export function SetupPasswordPage() {
  const navigate = useNavigate();
  const { refreshWorkspace } = useAuth();
  const [searchParams] = useSearchParams();
  const tenantId = searchParams.get('tenant');

  const [ready, setReady] = useState(false);
  const [mode, setMode] = useState<'ready' | 'admin_share' | 'error'>('error');
  const [email, setEmail] = useState<string | null>(null);
  const [expectedEmail, setExpectedEmail] = useState<string | null>(null);
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    let cancelled = false;

    void bootstrapInviteSession(searchParams).then((result) => {
      if (cancelled) return;
      setEmail(result.email);
      setExpectedEmail(result.expectedEmail);
      setMode(result.mode);
      setError(result.error);
      setReady(true);
    });

    return () => {
      cancelled = true;
    };
  }, [searchParams]);

  const validation = validatePassword(password, email ?? undefined);
  const strength = passwordStrengthLabel(validation.score);
  const canSubmit =
    validation.valid &&
    passwordsMatch(password, confirm) &&
    !saving &&
    !done &&
    mode === 'ready';

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;

    setSaving(true);
    setError(null);

    const { error: updateError } = await supabase.auth.updateUser({ password });
    if (updateError) {
      setSaving(false);
      setError(updateError.message);
      return;
    }

    try {
      await activateProvisionedMembership(tenantId ?? undefined);
    } catch {
      // Non-fatal for alternate invite flows
    }

    await refreshWorkspace(); // pick up the workspace just activated
    setDone(true);
    setSaving(false);
    setTimeout(() => navigate('/dashboard'), 1500);
  };

  if (!ready) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50">
        <p className="text-slate-500">Preparing your account…</p>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-brand-50 via-white to-teal-50 p-4">
      <Card className="w-full max-w-md p-8">
        <div className="mb-6 flex items-center justify-center">
          <MarbeeLogo size="lg" />
        </div>

        {done ? (
          <div className="text-center">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-emerald-100">
              <Check className="h-6 w-6 text-emerald-600" />
            </div>
            <h1 className="mt-4 text-lg font-semibold text-slate-900">Password saved</h1>
            <p className="mt-2 text-sm text-slate-500">Redirecting to your workspace…</p>
          </div>
        ) : mode === 'admin_share' && expectedEmail ? (
          <div className="text-center">
            <Mail className="mx-auto h-10 w-10 text-brand-600" />
            <h1 className="mt-4 text-lg font-semibold text-slate-900">Invitation sent</h1>
            <p className="mt-2 text-sm text-slate-600">
              Password setup is for <strong>{expectedEmail}</strong>.
            </p>
            <p className="mt-3 text-xs text-slate-500 leading-relaxed">
              If you are <strong>{expectedEmail}</strong>, open the link from your invitation email
              (the full link with the secure token). If you are an admin, share that link with the
              user — you do not need to open this page yourself.
            </p>
            <Link to="/login" className="mt-6 inline-block text-sm text-brand-600 hover:underline">
              Already have a password? Sign in
            </Link>
          </div>
        ) : error && mode === 'error' && !email ? (
          <div className="text-center">
            <Lock className="mx-auto h-10 w-10 text-slate-300" />
            <h1 className="mt-4 text-lg font-semibold text-slate-900">Setup link required</h1>
            <p className="mt-2 text-sm text-slate-500">{error}</p>
            <Link to="/login" className="mt-6 inline-block text-sm font-medium text-brand-600 hover:underline">
              Go to sign in
            </Link>
          </div>
        ) : (
          <>
            <h1 className="text-center text-lg font-semibold text-slate-900">Set your password</h1>
            <p className="mt-1 text-center text-sm text-slate-500">
              Create a secure password for <strong>{email}</strong>
            </p>

            <form onSubmit={handleSubmit} className="mt-6 space-y-4">
              <div>
                <label className="text-xs font-medium text-slate-600">Password</label>
                <div className="relative mt-1">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    autoComplete="new-password"
                    className="w-full rounded-lg border border-slate-200 px-3 py-2 pr-20 text-sm"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                  />
                  <button
                    type="button"
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-slate-500 hover:text-slate-700"
                    onClick={() => setShowPassword((v) => !v)}
                  >
                    {showPassword ? 'Hide' : 'Show'}
                  </button>
                </div>
                {password && (
                  <p className={`mt-1 text-xs font-medium ${strength.color}`}>
                    Strength: {strength.label}
                  </p>
                )}
              </div>

              <div>
                <label className="text-xs font-medium text-slate-600">Confirm password</label>
                <input
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="new-password"
                  className="w-full mt-1 rounded-lg border border-slate-200 px-3 py-2 text-sm"
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  required
                />
                {confirm && !passwordsMatch(password, confirm) && (
                  <p className="mt-1 text-xs text-red-600">Passwords do not match</p>
                )}
              </div>

              <ul className="rounded-lg border border-slate-100 bg-slate-50 p-3 text-xs text-slate-600 space-y-1">
                {PASSWORD_REQUIREMENTS.map((req) => (
                  <li key={req}>• {req}</li>
                ))}
              </ul>

              {validation.errors.length > 0 && password && (
                <ul className="space-y-1">
                  {validation.errors.map((msg) => (
                    <li key={msg} className="text-xs text-red-600">{msg}</li>
                  ))}
                </ul>
              )}

              {error && <p className="text-sm text-red-600">{error}</p>}

              <Button type="submit" className="w-full" disabled={!canSubmit}>
                {saving ? 'Saving…' : 'Save password & continue'}
              </Button>
            </form>
          </>
        )}
      </Card>
    </div>
  );
}
