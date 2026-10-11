import type { EmailOtpType } from '@supabase/supabase-js';
import { supabase } from './supabase';

export type InviteSessionMode = 'ready' | 'admin_share' | 'error';

export type InviteSessionResult = {
  email: string | null;
  expectedEmail: string | null;
  mode: InviteSessionMode;
  error: string | null;
};

function readExpectedEmail(searchParams: URLSearchParams): string | null {
  const raw = searchParams.get('email');
  return raw ? raw.trim().toLowerCase() : null;
}

function parseHashTokens(hash: string): { accessToken: string; refreshToken: string } | null {
  const params = new URLSearchParams(hash.replace(/^#/, ''));
  const accessToken = params.get('access_token');
  const refreshToken = params.get('refresh_token');
  if (!accessToken || !refreshToken) return null;
  return { accessToken, refreshToken };
}

function hasInviteHash(): boolean {
  const hash = window.location.hash;
  return hash.includes('access_token=') && hash.includes('refresh_token=');
}

function hasAuthCallbackParams(searchParams: URLSearchParams): boolean {
  return (
    hasInviteHash()
    || searchParams.has('code')
    || (searchParams.has('token_hash') && searchParams.has('type'))
  );
}

function cleanAuthParamsFromUrl(): void {
  const url = new URL(window.location.href);
  url.hash = '';
  for (const key of ['code', 'token_hash', 'type', 'access_token', 'refresh_token']) {
    url.searchParams.delete(key);
  }
  window.history.replaceState({}, document.title, `${url.pathname}${url.search}`);
}

async function establishSessionFromCallback(
  searchParams: URLSearchParams,
): Promise<{ email: string | null; error: string | null }> {
  await supabase.auth.signOut({ scope: 'local' });

  const code = searchParams.get('code');
  if (code) {
    const { data, error } = await supabase.auth.exchangeCodeForSession(code);
    cleanAuthParamsFromUrl();
    if (error || !data.session?.user) {
      return { email: null, error: error?.message ?? 'Setup link expired or already used.' };
    }
    return { email: data.session.user.email?.toLowerCase() ?? null, error: null };
  }

  if (hasInviteHash()) {
    const tokens = parseHashTokens(window.location.hash);
    if (!tokens) {
      return { email: null, error: 'Invalid setup link.' };
    }
    const { data, error } = await supabase.auth.setSession({
      access_token: tokens.accessToken,
      refresh_token: tokens.refreshToken,
    });
    cleanAuthParamsFromUrl();
    if (error || !data.session?.user) {
      return { email: null, error: error?.message ?? 'Setup link expired or already used.' };
    }
    return { email: data.session.user.email?.toLowerCase() ?? null, error: null };
  }

  const tokenHash = searchParams.get('token_hash');
  const otpType = searchParams.get('type');
  if (tokenHash && otpType) {
    const { data, error } = await supabase.auth.verifyOtp({
      token_hash: tokenHash,
      type: otpType as EmailOtpType,
    });
    cleanAuthParamsFromUrl();
    if (error || !data.session?.user) {
      return { email: null, error: error?.message ?? 'Setup link expired or already used.' };
    }
    return { email: data.session.user.email?.toLowerCase() ?? null, error: null };
  }

  return { email: null, error: null };
}

/** Authenticate invited user from email link, then allow password setup. */
export async function bootstrapInviteSession(
  searchParams: URLSearchParams,
): Promise<InviteSessionResult> {
  const expectedEmail = readExpectedEmail(searchParams);

  if (hasAuthCallbackParams(searchParams)) {
    const auth = await establishSessionFromCallback(searchParams);
    if (auth.error || !auth.email) {
      return {
        email: null,
        expectedEmail,
        mode: 'error',
        error: auth.error ?? 'Could not verify your invitation. Ask your admin to resend the email.',
      };
    }
    return {
      email: auth.email,
      expectedEmail: expectedEmail ?? auth.email,
      mode: 'ready',
      error: null,
    };
  }

  const { data: { session } } = await supabase.auth.getSession();
  const currentEmail = session?.user.email?.toLowerCase() ?? null;

  if (currentEmail && (!expectedEmail || currentEmail === expectedEmail)) {
    return {
      email: currentEmail,
      expectedEmail,
      mode: 'ready',
      error: null,
    };
  }

  // Partial URL with no auth token — admin preview only.
  if (currentEmail) {
    await supabase.auth.signOut({ scope: 'local' });
  }

  if (expectedEmail) {
    return {
      email: null,
      expectedEmail,
      mode: 'admin_share',
      error: null,
    };
  }

  return {
    email: null,
    expectedEmail,
    mode: 'error',
    error: 'Open the complete setup link from your invitation email to set your password.',
  };
}

export async function signOutForInvite(): Promise<void> {
  await supabase.auth.signOut({ scope: 'local' });
}
