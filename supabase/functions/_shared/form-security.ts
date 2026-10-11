/**
 * _shared/form-security.ts — server-side enforcement of form anti-abuse rules.
 *
 * This is the security boundary. The browser-side copy in
 * `apps/web/src/lib/form-security.ts` improves the respondent's experience by
 * failing fast, but every check that matters is repeated here, because a bot
 * posts to this endpoint directly and never runs the page's JavaScript.
 *
 * Challenge tokens are HMAC-SHA256 signed with FORM_CHALLENGE_SECRET so the
 * expected answer can travel through an untrusted client without being forged.
 */

const encoder = new TextEncoder();

export type CaptchaProvider =
  | 'none'
  | 'smart_math'
  | 'proof_of_work'
  | 'turnstile'
  | 'hcaptcha'
  | 'recaptcha_v3';

export type CaptchaConfig = {
  provider?: CaptchaProvider;
  trigger?: 'always' | 'suspicious';
  difficulty?: 'easy' | 'medium' | 'hard';
  site_key?: string;
  secret_variable?: string;
  score_threshold?: number;
  ttl_seconds?: number;
};

export type BotProtectionConfig = {
  honeypot_enabled?: boolean;
  honeypot_field?: string;
  min_fill_seconds?: number;
  max_fill_seconds?: number;
  require_nonce?: boolean;
  rate_limit_per_hour?: number;
  rate_limit_per_day?: number;
  duplicate_window_minutes?: number;
  block_disposable_email?: boolean;
  enforce_origin?: boolean;
  blocked_ips?: string[];
};

export type InputHardeningConfig = {
  strict_field_whitelist?: boolean;
  max_field_length?: number;
  max_payload_kb?: number;
  sanitize_html?: boolean;
  reject_control_chars?: boolean;
  injection_scan?: 'off' | 'flag' | 'block';
};

export type FormSecurityConfig = {
  captcha?: CaptchaConfig;
  bot?: BotProtectionConfig;
  input?: InputHardeningConfig;
};

export const DIFFICULTY_SPEC = {
  easy: { mathMax: 10, mathOps: 1, powBits: 12 },
  medium: { mathMax: 25, mathOps: 2, powBits: 16 },
  hard: { mathMax: 60, mathOps: 2, powBits: 20 },
} as const;

// -----------------------------------------------------------------------------
// Signed challenge tokens
// -----------------------------------------------------------------------------

function b64url(bytes: Uint8Array): string {
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function unb64url(value: string): Uint8Array {
  const padded = value.replace(/-/g, '+').replace(/_/g, '/');
  const bin = atob(padded + '='.repeat((4 - (padded.length % 4)) % 4));
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i += 1) out[i] = bin.charCodeAt(i);
  return out;
}

function challengeSecret(): string {
  const secret = Deno.env.get('FORM_CHALLENGE_SECRET');
  if (!secret) {
    throw new Error(
      'FORM_CHALLENGE_SECRET is not set. Add it to the edge function secrets before enabling challenges.',
    );
  }
  return secret;
}

async function hmac(payload: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(challengeSecret()),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const sig = await crypto.subtle.sign('HMAC', key, encoder.encode(payload));
  return b64url(new Uint8Array(sig));
}

/** Constant-time string comparison, so signature checks leak no timing signal. */
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

type ChallengePayload = {
  /** Expected answer for smart_math, or the puzzle input for proof_of_work. */
  a: string;
  /** Required leading zero bits for proof_of_work. */
  b?: number;
  /** Form this challenge was issued for. */
  f: string;
  /** Expiry, epoch seconds. */
  e: number;
  /** Random unique id, used to burn the token after one use. */
  n: string;
};

export async function signChallenge(payload: ChallengePayload): Promise<string> {
  const body = b64url(encoder.encode(JSON.stringify(payload)));
  return `${body}.${await hmac(body)}`;
}

export async function verifyChallengeToken(
  token: string,
  formId: string,
): Promise<{ payload?: ChallengePayload; error?: string }> {
  const [body, sig] = token.split('.');
  if (!body || !sig) return { error: 'Malformed challenge token' };
  if (!timingSafeEqual(sig, await hmac(body))) return { error: 'Challenge signature is invalid' };

  let payload: ChallengePayload;
  try {
    payload = JSON.parse(new TextDecoder().decode(unb64url(body)));
  } catch {
    return { error: 'Malformed challenge token' };
  }

  if (payload.f !== formId) return { error: 'Challenge was issued for a different form' };
  if (payload.e < Math.floor(Date.now() / 1000)) return { error: 'Challenge expired — please retry' };
  return { payload };
}

/** Build a fresh challenge for the self-hosted providers. */
export async function issueChallenge(
  provider: 'smart_math' | 'proof_of_work',
  formId: string,
  difficulty: 'easy' | 'medium' | 'hard' = 'medium',
  ttlSeconds = 600,
): Promise<{ token: string; question?: string; challenge?: string; bits?: number }> {
  const spec = DIFFICULTY_SPEC[difficulty];
  const exp = Math.floor(Date.now() / 1000) + ttlSeconds;
  const nonce = b64url(crypto.getRandomValues(new Uint8Array(12)));

  if (provider === 'proof_of_work') {
    const puzzle = b64url(crypto.getRandomValues(new Uint8Array(16)));
    const token = await signChallenge({ a: puzzle, b: spec.powBits, f: formId, e: exp, n: nonce });
    return { token, challenge: puzzle, bits: spec.powBits };
  }

  const rand = (max: number) => 1 + Math.floor(Math.random() * max);
  const x = rand(spec.mathMax);
  const y = rand(spec.mathMax);
  let question: string;
  let answer: number;

  if (spec.mathOps === 1) {
    question = `${x} + ${y}`;
    answer = x + y;
  } else {
    const z = rand(9);
    // Keep the result non-negative so the prompt stays friendly.
    if (x >= y) {
      question = `${x} - ${y} + ${z}`;
      answer = x - y + z;
    } else {
      question = `${x} + ${y} - ${z}`;
      answer = x + y - z;
    }
  }

  const token = await signChallenge({ a: String(answer), f: formId, e: exp, n: nonce });
  return { token, question: `${question} = ?` };
}

export function leadingZeroBits(bytes: Uint8Array): number {
  let count = 0;
  for (const byte of bytes) {
    if (byte === 0) {
      count += 8;
      continue;
    }
    for (let bit = 7; bit >= 0; bit -= 1) {
      if ((byte >> bit) & 1) return count;
      count += 1;
    }
    return count;
  }
  return count;
}

// -----------------------------------------------------------------------------
// Hosted provider verification
// -----------------------------------------------------------------------------

const HOSTED_VERIFY_URL: Record<string, string> = {
  turnstile: 'https://challenges.cloudflare.com/turnstile/v0/siteverify',
  hcaptcha: 'https://api.hcaptcha.com/siteverify',
  recaptcha_v3: 'https://www.google.com/recaptcha/api/siteverify',
};

export async function verifyHostedCaptcha(
  provider: 'turnstile' | 'hcaptcha' | 'recaptcha_v3',
  responseToken: string,
  secret: string,
  remoteIp?: string,
  scoreThreshold = 0.5,
): Promise<{ ok: boolean; error?: string }> {
  const params = new URLSearchParams({ secret, response: responseToken });
  if (remoteIp) params.set('remoteip', remoteIp);

  let result: { success?: boolean; score?: number; 'error-codes'?: string[] };
  try {
    const res = await fetch(HOSTED_VERIFY_URL[provider], {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params.toString(),
    });
    result = await res.json();
  } catch {
    // Fail closed: an unreachable verifier must not become an open door.
    return { ok: false, error: 'Could not reach the CAPTCHA verifier' };
  }

  if (!result.success) {
    return { ok: false, error: `CAPTCHA verification failed (${(result['error-codes'] ?? []).join(', ') || 'rejected'})` };
  }
  if (provider === 'recaptcha_v3' && typeof result.score === 'number' && result.score < scoreThreshold) {
    return { ok: false, error: `Score ${result.score.toFixed(2)} is below the ${scoreThreshold} threshold` };
  }
  return { ok: true };
}

// -----------------------------------------------------------------------------
// Input hardening
// -----------------------------------------------------------------------------

const INJECTION_SIGNATURES: Array<{ name: string; pattern: RegExp }> = [
  { name: 'sql_union', pattern: /\bunion\b[\s\S]{0,40}\bselect\b/i },
  { name: 'sql_tautology', pattern: /(['"]\s*(or|and)\s*['"]?\d+['"]?\s*=\s*['"]?\d+)/i },
  { name: 'sql_comment_terminator', pattern: /(--|#|\/\*)\s*$/ },
  { name: 'sql_stacked', pattern: /;\s*(drop|delete|update|insert|alter|truncate)\s+/i },
  { name: 'script_tag', pattern: /<\s*script\b/i },
  { name: 'event_handler', pattern: /\bon(error|load|click|mouseover)\s*=/i },
  { name: 'js_uri', pattern: /javascript\s*:/i },
  { name: 'template_injection', pattern: /\{\{[\s\S]*?\}\}|\$\{[\s\S]*?\}/ },
  { name: 'path_traversal', pattern: /\.\.[/\\]{1,2}(etc|windows|proc)\b/i },
  { name: 'command_chain', pattern: /[;|&]{1,2}\s*(cat|curl|wget|nc|bash|sh|powershell)\s/i },
];

export type SanitizeResult = {
  data: Record<string, unknown>;
  dropped: string[];
  findings: Array<{ field: string; signature: string }>;
  blocked?: string;
};

export function sanitizeSubmission(
  data: Record<string, unknown>,
  allowedFields: string[],
  config: InputHardeningConfig = {},
): SanitizeResult {
  const {
    strict_field_whitelist = true,
    max_field_length = 5000,
    max_payload_kb = 256,
    sanitize_html = true,
    reject_control_chars = true,
    injection_scan = 'flag',
  } = config;

  const sizeKb = encoder.encode(JSON.stringify(data)).length / 1024;
  if (sizeKb > max_payload_kb) {
    return {
      data: {},
      dropped: [],
      findings: [],
      blocked: `Payload is ${sizeKb.toFixed(0)}KB, over the ${max_payload_kb}KB limit`,
    };
  }

  const allowed = new Set(allowedFields);
  const out: Record<string, unknown> = {};
  const dropped: string[] = [];

  for (const [key, value] of Object.entries(data)) {
    if (strict_field_whitelist && !allowed.has(key)) {
      dropped.push(key);
      continue;
    }
    if (typeof value !== 'string') {
      out[key] = value;
      continue;
    }
    let next = value;
    if (reject_control_chars) next = next.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');
    if (sanitize_html) next = next.replace(/<[^>]*>/g, '').replace(/[<>]/g, '').trim();
    if (next.length > max_field_length) next = next.slice(0, max_field_length);
    out[key] = next;
  }

  const findings: Array<{ field: string; signature: string }> = [];
  if (injection_scan !== 'off') {
    for (const [field, value] of Object.entries(out)) {
      const text = typeof value === 'string' ? value : JSON.stringify(value ?? '');
      for (const { name, pattern } of INJECTION_SIGNATURES) {
        if (pattern.test(text)) findings.push({ field, signature: name });
      }
    }
  }

  const blocked =
    injection_scan === 'block' && findings.length > 0
      ? `Submission rejected: ${findings[0].signature} detected in "${findings[0].field}"`
      : undefined;

  return { data: out, dropped, findings, blocked };
}

export const DISPOSABLE_EMAIL_DOMAINS = new Set([
  'mailinator.com',
  'guerrillamail.com',
  '10minutemail.com',
  'tempmail.com',
  'throwawaymail.com',
  'yopmail.com',
  'trashmail.com',
  'sharklasers.com',
  'getnada.com',
  'temp-mail.org',
  'fakeinbox.com',
  'dispostable.com',
]);

export function isDisposableEmail(email: string): boolean {
  const domain = email.split('@')[1]?.toLowerCase().trim();
  return domain ? DISPOSABLE_EMAIL_DOMAINS.has(domain) : false;
}

export function isOriginAllowed(origin: string | null, allowed: string[]): boolean {
  if (allowed.length === 0) return true;
  if (!origin) return false;
  let host: string;
  try {
    host = new URL(origin).hostname.toLowerCase();
  } catch {
    return false;
  }
  return allowed.some((entry) => {
    const clean = entry.trim().toLowerCase().replace(/^https?:\/\//, '').replace(/\/.*$/, '');
    if (!clean) return false;
    if (clean.startsWith('*.')) return host === clean.slice(2) || host.endsWith(clean.slice(1));
    return host === clean;
  });
}

/** Stable hash of a payload, for duplicate detection. */
export async function payloadFingerprint(data: Record<string, unknown>): Promise<string> {
  const canonical = JSON.stringify(data, Object.keys(data).sort());
  const digest = await crypto.subtle.digest('SHA-256', encoder.encode(canonical));
  return b64url(new Uint8Array(digest));
}

/** Best-effort client IP from the proxy headers Supabase sets. */
export function clientIp(req: Request): string {
  const fwd = req.headers.get('x-forwarded-for');
  if (fwd) return fwd.split(',')[0].trim();
  return req.headers.get('cf-connecting-ip') ?? req.headers.get('x-real-ip') ?? 'unknown';
}
