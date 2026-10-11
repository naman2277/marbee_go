/**
 * form-security.ts — anti-bot and input-hardening configuration for forms.
 *
 * ## Threat model, honestly stated
 *
 * Submissions reach the database through supabase-js / PostgREST, which sends
 * parameterized queries. Classic SQL injection is therefore NOT a live vector
 * against form answers, and any UI switch claiming to "block SQL injection"
 * would be theatre. The risks that are real here:
 *
 *   1. Unverified challenges — a CAPTCHA rendered only in the browser is
 *      decorative; a bot POSTs the endpoint directly. Verification must happen
 *      server-side, which is what `CaptchaConfig` drives in the edge function.
 *   2. Stored XSS — answers are rendered later in dashboards, exports and
 *      notification emails. This is the injection risk that actually applies,
 *      and `sanitize_html` addresses it.
 *   3. Payload stuffing — keys absent from the form definition being written
 *      into storage. `strict_field_whitelist` drops them.
 *   4. Volume abuse — floods, replays and duplicates, covered by the rate
 *      limit, nonce and duplicate window.
 *
 * Pattern detection (`injection_scan`) exists to flag and block probing
 * attempts for audit value. It is defence in depth and a tripwire, never the
 * primary control — the parameterized driver and sanitizer are.
 */

export type CaptchaProvider =
  | 'none'
  | 'smart_math'
  | 'proof_of_work'
  | 'turnstile'
  | 'hcaptcha'
  | 'recaptcha_v3';

/** When the challenge is shown: to everyone, or only to traffic that scores as risky. */
export type CaptchaTrigger = 'always' | 'suspicious';

export type CaptchaDifficulty = 'easy' | 'medium' | 'hard';

export type CaptchaConfig = {
  provider?: CaptchaProvider;
  trigger?: CaptchaTrigger;
  difficulty?: CaptchaDifficulty;
  /** Public site key for the hosted providers. Safe to ship to the browser. */
  site_key?: string;
  /**
   * Name of a `secret` global variable holding the provider's secret key,
   * e.g. `TURNSTILE_SECRET`. Referenced by name so rotation is central and the
   * secret itself never lands in form settings.
   */
  secret_variable?: string;
  /** reCAPTCHA v3 only: minimum score to accept, 0–1. */
  score_threshold?: number;
  /** How long an issued challenge stays valid. */
  ttl_seconds?: number;
  label?: string;
  align?: 'left' | 'center' | 'right' | 'full';
};

export type BotProtectionConfig = {
  /** Hidden field real users never fill. Filled ⇒ silently accepted, never stored. */
  honeypot_enabled?: boolean;
  honeypot_field?: string;
  /** Reject submissions completed faster than a human plausibly could. */
  min_fill_seconds?: number;
  /** Reject stale sessions — the form page sat open for too long. */
  max_fill_seconds?: number;
  /** Single-use signed token per render, defeating replay of a captured POST. */
  require_nonce?: boolean;
  rate_limit_per_hour?: number;
  rate_limit_per_day?: number;
  /** Drop an identical payload seen again inside this window. 0 disables. */
  duplicate_window_minutes?: number;
  /** Reject known throwaway mailbox domains. */
  block_disposable_email?: boolean;
  /** Require the Origin/Referer to match the embed allowlist. */
  enforce_origin?: boolean;
  blocked_ips?: string[];
  blocked_countries?: string[];
};

/** What to do when a value matches a known attack signature. */
export type InjectionAction = 'off' | 'flag' | 'block';

export type InputHardeningConfig = {
  /** Drop keys that are not declared fields on the form. */
  strict_field_whitelist?: boolean;
  /** Hard cap on any single answer's length, in characters. */
  max_field_length?: number;
  /** Cap on the whole payload, in kilobytes. */
  max_payload_kb?: number;
  /** Strip HTML tags from answers — the real defence against stored XSS. */
  sanitize_html?: boolean;
  /** Reject NUL and other control characters. */
  reject_control_chars?: boolean;
  /** Tripwire for probing attempts. Defence in depth, not the primary control. */
  injection_scan?: InjectionAction;
};

export type FormSecurityConfig = {
  captcha?: CaptchaConfig;
  bot?: BotProtectionConfig;
  input?: InputHardeningConfig;
};

// -----------------------------------------------------------------------------
// Provider metadata
// -----------------------------------------------------------------------------

export const CAPTCHA_PROVIDERS: Array<{
  value: CaptchaProvider;
  label: string;
  hint: string;
  /** Needs a site key + secret from a third party. */
  hosted: boolean;
}> = [
  {
    value: 'none',
    label: 'None',
    hint: 'No challenge. Rely on the honeypot, timing and rate limits alone.',
    hosted: false,
  },
  {
    value: 'smart_math',
    label: 'Math challenge',
    hint: 'A short arithmetic question, signed by the server so the answer cannot be forged.',
    hosted: false,
  },
  {
    value: 'proof_of_work',
    label: 'Proof of work',
    hint: 'The browser silently computes a hash puzzle. Invisible to people, costly to bulk bots.',
    hosted: false,
  },
  {
    value: 'turnstile',
    label: 'Cloudflare Turnstile',
    hint: 'Privacy-preserving and usually invisible. Needs a Cloudflare site key and secret.',
    hosted: true,
  },
  {
    value: 'hcaptcha',
    label: 'hCaptcha',
    hint: 'Interactive challenge with strong bot detection. Needs an hCaptcha site key and secret.',
    hosted: true,
  },
  {
    value: 'recaptcha_v3',
    label: 'reCAPTCHA v3',
    hint: 'Invisible scoring from Google. Submissions below your threshold are rejected.',
    hosted: true,
  },
];

/** Difficulty → concrete parameters for the self-hosted challenges. */
export const DIFFICULTY_SPEC: Record<
  CaptchaDifficulty,
  { mathMax: number; mathOps: number; powBits: number; label: string }
> = {
  easy: { mathMax: 10, mathOps: 1, powBits: 12, label: 'Easy — single-digit sums' },
  medium: { mathMax: 25, mathOps: 2, powBits: 16, label: 'Medium — two-step arithmetic' },
  hard: { mathMax: 60, mathOps: 2, powBits: 20, label: 'Hard — larger numbers, slower proof' },
};

export const DEFAULT_SECURITY: FormSecurityConfig = {
  captcha: {
    provider: 'smart_math',
    trigger: 'always',
    difficulty: 'medium',
    ttl_seconds: 600,
    score_threshold: 0.5,
  },
  bot: {
    honeypot_enabled: true,
    honeypot_field: 'mb_contact_pref',
    min_fill_seconds: 2,
    max_fill_seconds: 3600,
    require_nonce: true,
    duplicate_window_minutes: 5,
    block_disposable_email: false,
    enforce_origin: false,
  },
  input: {
    strict_field_whitelist: true,
    max_field_length: 5000,
    max_payload_kb: 256,
    sanitize_html: true,
    reject_control_chars: true,
    injection_scan: 'flag',
  },
};

// -----------------------------------------------------------------------------
// Input hardening — the client-side half. The edge function repeats all of this;
// nothing here is a security boundary on its own.
// -----------------------------------------------------------------------------

/**
 * Signatures for common probing payloads. Deliberately narrow: these flag
 * obvious attack strings without tripping on ordinary prose such as
 * "I'd like to select a plan" or "Drop me a line".
 */
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

export type InjectionFinding = { field: string; signature: string };

/** Scan a payload for attack signatures. Returns every match, for logging or blocking. */
export function scanForInjection(data: Record<string, unknown>): InjectionFinding[] {
  const findings: InjectionFinding[] = [];
  for (const [field, value] of Object.entries(data)) {
    const text = typeof value === 'string' ? value : JSON.stringify(value ?? '');
    for (const { name, pattern } of INJECTION_SIGNATURES) {
      if (pattern.test(text)) findings.push({ field, signature: name });
    }
  }
  return findings;
}

/** Remove HTML tags and decode-resistant angle brackets. The real anti-XSS step. */
export function stripHtml(value: string): string {
  return value
    .replace(/<[^>]*>/g, '')
    .replace(/[<>]/g, '')
    .trim();
}

/** Strip control characters (except tab, newline, carriage return). */
export function stripControlChars(value: string): string {
  // eslint-disable-next-line no-control-regex
  return value.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');
}

export type SanitizeResult = {
  data: Record<string, unknown>;
  dropped: string[];
  truncated: string[];
  findings: InjectionFinding[];
  blocked?: string;
};

/**
 * Apply the configured hardening to a payload.
 *
 * `allowedFields` is the set of field names declared on the form; anything else
 * is dropped when the whitelist is on.
 */
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

  const allowed = new Set(allowedFields);
  const out: Record<string, unknown> = {};
  const dropped: string[] = [];
  const truncated: string[] = [];

  const sizeKb = new Blob([JSON.stringify(data)]).size / 1024;
  if (sizeKb > max_payload_kb) {
    return {
      data: {},
      dropped: [],
      truncated: [],
      findings: [],
      blocked: `Payload is ${sizeKb.toFixed(0)}KB, over the ${max_payload_kb}KB limit`,
    };
  }

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
    if (reject_control_chars) next = stripControlChars(next);
    if (sanitize_html) next = stripHtml(next);
    if (next.length > max_field_length) {
      next = next.slice(0, max_field_length);
      truncated.push(key);
    }
    out[key] = next;
  }

  const findings = injection_scan === 'off' ? [] : scanForInjection(out);
  const blocked =
    injection_scan === 'block' && findings.length > 0
      ? `Submission rejected: ${findings[0].signature} detected in "${findings[0].field}"`
      : undefined;

  return { data: out, dropped, truncated, findings, blocked };
}

// -----------------------------------------------------------------------------
// Self-hosted challenges — client side
// -----------------------------------------------------------------------------

/** A challenge issued by the server. The signature is verified on submit. */
export type IssuedChallenge = {
  provider: 'smart_math' | 'proof_of_work';
  /** Opaque server-signed token carrying the expected answer and expiry. */
  token: string;
  /** Human-readable prompt for the math challenge. */
  question?: string;
  /** Puzzle input and required leading zero bits for proof of work. */
  challenge?: string;
  bits?: number;
};

/**
 * Solve a proof-of-work challenge: find a nonce whose SHA-256 digest of
 * `challenge + nonce` begins with `bits` zero bits. Runs in the browser and
 * takes well under a second at the default difficulty.
 */
export async function solveProofOfWork(
  challenge: string,
  bits: number,
  signal?: AbortSignal,
): Promise<number> {
  const encoder = new TextEncoder();
  for (let nonce = 0; ; nonce += 1) {
    if (signal?.aborted) throw new Error('Proof of work cancelled');
    const digest = new Uint8Array(
      await crypto.subtle.digest('SHA-256', encoder.encode(`${challenge}${nonce}`)),
    );
    if (leadingZeroBits(digest) >= bits) return nonce;
    // Yield to the event loop periodically so the page stays responsive.
    if (nonce % 2000 === 1999) await new Promise((r) => setTimeout(r, 0));
  }
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

/** Disposable mailbox domains rejected when `block_disposable_email` is on. */
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

/** Does an Origin header satisfy the embed allowlist? */
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
