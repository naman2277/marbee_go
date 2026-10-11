/** Reject placeholder / template Firebase credentials before save or send. */

const PLACEHOLDER_PATTERN =
  /your[-_]?gcp|your[-_]?project|your[-_]?service|example\.com|placeholder|changeme|replace[-_]?me|xxx{3,}|insert[-_]?here|sample[-_]?/i;

const FAKE_PRIVATE_KEY_PATTERN = /\.{3}|\.{2}\s*\\n|your[-_]?private[-_]?key/i;

export type FirebaseServiceAccount = {
  type?: string;
  project_id?: string;
  private_key_id?: string;
  private_key?: string;
  client_email?: string;
  token_uri?: string;
  auth_uri?: string;
};

export function parseFirebaseServiceAccount(raw: string): FirebaseServiceAccount {
  try {
    return JSON.parse(raw) as FirebaseServiceAccount;
  } catch {
    throw new Error('Service account JSON is not valid JSON');
  }
}

export function validateFirebaseServiceAccountJson(raw: string, projectId?: string): string[] {
  const errors: string[] = [];
  let parsed: FirebaseServiceAccount;

  try {
    parsed = parseFirebaseServiceAccount(raw);
  } catch (err) {
    return [err instanceof Error ? err.message : 'Service account JSON is invalid'];
  }

  if (parsed.type !== 'service_account') {
    errors.push('Service account JSON must have type "service_account"');
  }

  if (!parsed.project_id?.trim()) {
    errors.push('Service account JSON is missing project_id');
  } else if (PLACEHOLDER_PATTERN.test(parsed.project_id)) {
    errors.push('Service account project_id looks like a placeholder — use your real Firebase project ID');
  }

  if (!parsed.client_email?.trim()) {
    errors.push('Service account JSON is missing client_email');
  } else if (PLACEHOLDER_PATTERN.test(parsed.client_email)) {
    errors.push('Service account client_email looks like a placeholder');
  }

  if (!parsed.private_key?.trim()) {
    errors.push('Service account JSON is missing private_key');
  } else {
    const key = parsed.private_key;
    if (!key.includes('BEGIN PRIVATE KEY')) {
      errors.push('private_key must be a PEM-encoded RSA private key from Firebase');
    }
    if (FAKE_PRIVATE_KEY_PATTERN.test(key) || key.length < 400) {
      errors.push('private_key appears truncated or fake — paste the full key from Firebase Console');
    }
  }

  const tokenUri = parsed.token_uri?.trim() ?? '';
  if (tokenUri && !tokenUri.includes('oauth2.googleapis.com')) {
    errors.push('token_uri must be https://oauth2.googleapis.com/token (use the JSON downloaded from Firebase)');
  }

  if (projectId?.trim() && parsed.project_id && parsed.project_id !== projectId.trim()) {
    errors.push('Project ID must match the project_id inside service account JSON');
  }

  return errors;
}

export function validateFirebaseClientFields(values: Record<string, string>): string[] {
  const errors: string[] = [];

  const projectId = values.project_id?.trim() ?? '';
  if (projectId && PLACEHOLDER_PATTERN.test(projectId)) {
    errors.push('Project ID looks like a placeholder');
  }

  const apiKey = values.api_key?.trim() ?? '';
  if (apiKey && (PLACEHOLDER_PATTERN.test(apiKey) || !apiKey.startsWith('AIza'))) {
    errors.push('Web API key must start with AIza… (copy from Firebase → Project settings → Your apps)');
  }

  const senderId = values.sender_id?.trim() ?? '';
  if (senderId && (!/^\d{10,}$/.test(senderId) || PLACEHOLDER_PATTERN.test(senderId))) {
    errors.push('Sender ID must be a numeric Firebase Cloud Messaging sender ID');
  }

  const appId = values.app_id?.trim() ?? '';
  if (appId && PLACEHOLDER_PATTERN.test(appId)) {
    errors.push('App ID looks like a placeholder');
  }

  const vapid = values.vapid_public_key?.trim() ?? '';
  if (vapid && (vapid.length < 80 || PLACEHOLDER_PATTERN.test(vapid))) {
    errors.push('VAPID public key looks invalid — generate one in Firebase → Cloud Messaging → Web configuration');
  }

  if (values.service_account_json?.trim()) {
    errors.push(...validateFirebaseServiceAccountJson(values.service_account_json, projectId));
  }

  return errors;
}
