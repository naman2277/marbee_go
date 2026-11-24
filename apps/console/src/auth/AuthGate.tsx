import { createContext, useCallback, useContext, useEffect, useState, type FormEvent, type ReactNode } from 'react';
import type { Session } from '@supabase/supabase-js';
import { ShieldCheck } from 'lucide-react';
import { supabase, configMissing } from '@/lib/supabase';
import { api, ApiError, type Admin } from '@/lib/api';
import { Button, ErrorBox, Field, Input, Loading } from '@/components/ui';

type Stage =
  | { kind: 'loading' }
  | { kind: 'signed_out' }
  | { kind: 'enroll' }
  | { kind: 'verify'; factorId: string }
  | { kind: 'not_admin'; message: string }
  | { kind: 'ready'; admin: Admin };

const AdminContext = createContext<{ admin: Admin; signOut: () => Promise<void> } | null>(null);

export function useAdmin() {
  const ctx = useContext(AdminContext);
  if (!ctx) throw new Error('useAdmin outside AuthGate');
  return ctx;
}

export function AuthGate({ children }: { children: ReactNode }) {
  const [stage, setStage] = useState<Stage>({ kind: 'loading' });

  const evaluate = useCallback(async (session: Session | null) => {
    if (!session) return setStage({ kind: 'signed_out' });

    const { data: aal, error: aalErr } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
    if (aalErr) return setStage({ kind: 'not_admin', message: aalErr.message });

    if (aal.currentLevel !== 'aal2') {
      const { data: factors } = await supabase.auth.mfa.listFactors();
      const totp = factors?.totp?.find((f) => f.status === 'verified');
      return setStage(totp ? { kind: 'verify', factorId: totp.id } : { kind: 'enroll' });
    }

    try {
      const { admin } = await api.me();
      setStage({ kind: 'ready', admin });
    } catch (e) {
      // Show the server's exact reason (not admin / MFA required / origin / config).
      const email = session.user?.email ?? 'this account';
      const msg = e instanceof ApiError && e.message === 'Not a platform admin'
        ? `${email} is not a Marbee platform admin.`
        : e instanceof Error ? e.message : 'Could not verify access';
      setStage({ kind: 'not_admin', message: msg });
    }
  }, []);

  useEffect(() => {
    void supabase.auth.getSession().then(({ data }) => evaluate(data.session));
    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_OUT') setStage({ kind: 'signed_out' });
      if (event === 'SIGNED_IN' || event === 'MFA_CHALLENGE_VERIFIED') void evaluate(session);
    });
    return () => sub.subscription.unsubscribe();
  }, [evaluate]);

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
    setStage({ kind: 'signed_out' });
  }, []);

  if (configMissing) {
    return (
      <Shell>
        <ErrorBox message="VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY are not set. Copy apps/console/.env.example to .env.local." />
      </Shell>
    );
  }

  switch (stage.kind) {
    case 'loading':
      return <Shell><Loading label="Checking session…" /></Shell>;
    case 'signed_out':
      return <Shell><SignIn /></Shell>;
    case 'enroll':
      return <Shell><Enroll onDone={() => supabase.auth.getSession().then(({ data }) => evaluate(data.session))} onCancel={signOut} /></Shell>;
    case 'verify':
      return <Shell><Verify factorId={stage.factorId} onDone={() => supabase.auth.getSession().then(({ data }) => evaluate(data.session))} onCancel={signOut} /></Shell>;
    case 'not_admin':
      return (
        <Shell>
          <div className="space-y-4">
            <ErrorBox message={stage.message} />
            <Button variant="secondary" onClick={signOut} className="w-full">Sign out</Button>
          </div>
        </Shell>
      );
    case 'ready':
      return <AdminContext.Provider value={{ admin: stage.admin, signOut }}>{children}</AdminContext.Provider>;
  }
}

function Shell({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex items-center gap-2 text-slate-900">
          <ShieldCheck className="h-6 w-6 text-brand-600" aria-hidden />
          <span className="text-lg font-semibold">Marbee Console</span>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">{children}</div>
        <p className="mt-4 text-center text-xs text-slate-500">Restricted to Marbee platform administrators. All actions are logged.</p>
      </div>
    </div>
  );
}

function SignIn() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const { error: err } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    setBusy(false);
    // Same message for every failure — don't reveal which accounts exist.
    if (err) setError('Sign-in failed. Check your email and password.');
  };

  return (
    <form onSubmit={submit} className="space-y-4">
      <h1 className="text-base font-semibold text-slate-900">Sign in</h1>
      {error && <ErrorBox message={error} />}
      <Field label="Email">
        <Input type="email" autoComplete="username" required value={email} onChange={(e) => setEmail(e.target.value)} />
      </Field>
      <Field label="Password">
        <Input type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
      </Field>
      <Button type="submit" busy={busy} className="w-full">Continue</Button>
    </form>
  );
}

function Enroll({ onDone, onCancel }: { onDone: () => void; onCancel: () => void }) {
  const [factor, setFactor] = useState<{ id: string; qr: string; secret: string } | null>(null);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      // Clear any half-finished enrolment so we always show a fresh QR code.
      const { data: list } = await supabase.auth.mfa.listFactors();
      for (const f of list?.all ?? []) {
        if (f.status === 'unverified') await supabase.auth.mfa.unenroll({ factorId: f.id });
      }
      const { data, error: err } = await supabase.auth.mfa.enroll({ factorType: 'totp', friendlyName: `Marbee Console ${Date.now()}` });
      if (cancelled) return;
      if (err || !data) return setError(err?.message ?? 'Could not start two-factor setup');
      setFactor({ id: data.id, qr: data.totp.qr_code, secret: data.totp.secret });
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!factor) return;
    setBusy(true);
    setError(null);
    const { error: err } = await supabase.auth.mfa.challengeAndVerify({ factorId: factor.id, code: code.trim() });
    setBusy(false);
    if (err) return setError('That code did not match. Try the next code from your app.');
    onDone();
  };

  return (
    <form onSubmit={submit} className="space-y-4">
      <h1 className="text-base font-semibold text-slate-900">Set up two-factor sign-in</h1>
      <p className="text-sm text-slate-600">Required for the console. Scan with Google Authenticator, 1Password, Authy or similar.</p>
      {error && <ErrorBox message={error} />}
      {!factor && !error && <Loading label="Preparing…" />}
      {factor && (
        <>
          <img src={factor.qr} alt="Two-factor QR code" className="mx-auto h-44 w-44" />
          <details className="text-xs text-slate-500">
            <summary className="cursor-pointer">Can't scan? Enter this key</summary>
            <code className="mt-1 block break-all rounded bg-slate-100 p-2 font-mono">{factor.secret}</code>
          </details>
          <Field label="6-digit code">
            <Input inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6} required value={code} onChange={(e) => setCode(e.target.value)} />
          </Field>
          <Button type="submit" busy={busy} className="w-full">Verify and continue</Button>
        </>
      )}
      <Button variant="ghost" onClick={onCancel} className="w-full">Cancel</Button>
    </form>
  );
}

function Verify({ factorId, onDone, onCancel }: { factorId: string; onDone: () => void; onCancel: () => void }) {
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const { error: err } = await supabase.auth.mfa.challengeAndVerify({ factorId, code: code.trim() });
    setBusy(false);
    if (err) return setError('Invalid code. Try again with the current code.');
    onDone();
  };

  return (
    <form onSubmit={submit} className="space-y-4">
      <h1 className="text-base font-semibold text-slate-900">Two-factor code</h1>
      {error && <ErrorBox message={error} />}
      <Field label="6-digit code from your authenticator app">
        <Input autoFocus inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6} required value={code} onChange={(e) => setCode(e.target.value)} />
      </Field>
      <Button type="submit" busy={busy} className="w-full">Verify</Button>
      <Button variant="ghost" onClick={onCancel} className="w-full">Use a different account</Button>
    </form>
  );
}
